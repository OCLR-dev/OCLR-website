"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { slotLabel } from "@/lib/mappool-model";
import type { MappoolWorkspace } from "@/lib/mappool-reads";
import type { ReplayItem } from "@/lib/mappool-replays";
import { openReplayListChannel } from "@/lib/replay-list-updates";
import { MappoolReplayPlayer } from "./mappool-replay-player";
import { MappoolReplayDialog } from "./mappool-replay-dialog";
import styles from "./mappool-replay-player.module.css";

export function MappoolReplayViewer({
  id,
  entry,
  listUrl,
  onClose,
}: {
  id: string;
  entry: MappoolWorkspace["entries"][number];
  listUrl: string;
  onClose: () => void;
}) {
  const tr = useAppTranslations();
  const [replays, setListState] = useState<ReplayItem[] | "error" | null>(null);
  const [listRevision, setListRevision] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const selected = Array.isArray(replays)
    ? (replays.find((replay) => replay.id === selectedId) ??
      replays.find(
        (replay) => replay.preferred && replay.summary.mode === "osu",
      ) ??
      replays.find((replay) => replay.summary.mode === "osu") ??
      replays[0])
    : undefined;
  const slot = slotLabel(entry.category, entry.position);
  const setReplays = useEffectEvent((items: ReplayItem[]) => {
    // A new upload can appear ahead of the implicitly selected first replay.
    if (selected) setSelectedId(selected.id);
    setListState(items);
  });

  useEffect(() => {
    const refresh = () => setListRevision((revision) => revision + 1);
    const channel = openReplayListChannel(listUrl);
    if (channel) channel.onmessage = refresh;
    function onVisibilityChange() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      channel?.close();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [listUrl]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(listUrl, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const items: ReplayItem[] = await response.json();
        if (!Array.isArray(items) || items.some((item) => !item?.summary))
          throw new Error();
        if (!controller.signal.aborted) setReplays(items);
      } catch {
        if (!controller.signal.aborted) setListState("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [listUrl, listRevision]);

  return (
    <MappoolReplayDialog
      id={id}
      slot={slot}
      map={`${entry.metadata.title} · ${entry.metadata.difficulty}`}
      onClose={onClose}
    >
      {Array.isArray(replays) && replays.length > 1 && (
        <label className={styles.selection}>
          <span className="sr-only">{tr("Replay file")}</span>
          <select
            value={selected?.id ?? ""}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {replays.map((replay) => (
              <option key={replay.id} value={replay.id}>
                {replay.filename}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected &&
        (selected.summary.mode === "osu" ? (
          <MappoolReplayPlayer
            key={selected.id}
            replayUrl={`${listUrl}/${selected.id}`}
            beatmapMd5={selected.summary.beatmapMd5}
            filename={selected.filename}
          />
        ) : (
          <p role="status">
            {tr(
              "Online playback supports only osu!standard. Download {filename} from Saved replays.",
              { filename: selected.filename },
            )}
          </p>
        ))}
      {Array.isArray(replays) && !replays.length && (
        <p role="status">{tr("No replays attached.")}</p>
      )}
      {replays === "error" && (
        <div className={styles.listError}>
          <p role="alert" className="error-text">
            {tr("Could not load replays. Retry the list.")}
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setListState(null);
              setListRevision((revision) => revision + 1);
            }}
          >
            {tr("Reload replay list")}
          </button>
        </div>
      )}
    </MappoolReplayDialog>
  );
}
