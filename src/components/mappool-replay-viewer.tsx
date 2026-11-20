"use client";

import { useEffect, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { slotLabel } from "@/lib/mappool-model";
import type { MappoolWorkspace } from "@/lib/mappool-reads";
import type { ReplayItem } from "@/lib/mappool-replays";
import { MappoolReplayPlayer } from "./mappool-replay-player";
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
  const heading = useRef<HTMLHeadingElement>(null);
  const [replays, setReplays] = useState<ReplayItem[] | "error" | null>(null);
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const selected = Array.isArray(replays)
    ? (replays.find((replay) => replay.id === selectedId) ?? replays[0])
    : undefined;
  const slot = slotLabel(entry.category, entry.position);

  useEffect(() => {
    heading.current?.focus();
  }, []);

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
        if (!controller.signal.aborted)
          setReplays(items.filter((item) => item.summary.mode === "osu"));
      } catch {
        if (!controller.signal.aborted) setReplays("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [listUrl, retry]);

  return (
    <section id={id} className={styles.viewer} aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h3 ref={heading} tabIndex={-1} id={`${id}-title`}>
            {tr("Replay player for {value0}", { value0: slot })}
          </h3>
          <p>
            {entry.metadata.title} · {entry.metadata.difficulty}
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          aria-label={tr("Close player")}
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
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
      {selected && (
        <MappoolReplayPlayer
          key={selected.id}
          replayUrl={`${listUrl}/${selected.id}`}
          beatmapMd5={selected.summary.beatmapMd5}
          filename={selected.filename}
        />
      )}
      {replays === null && <p role="status">{tr("Loading replay list…")}</p>}
      {Array.isArray(replays) && !replays.length && (
        <p role="status">
          {tr("No playable osu!standard replays for this map.")}
        </p>
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
              setReplays(null);
              setRetry(retry + 1);
            }}
          >
            {tr("Reload replay list")}
          </button>
        </div>
      )}
    </section>
  );
}
