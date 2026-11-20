"use client";

import { useEffect, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  beatmapCacheStatus,
  type BeatmapCacheStatus,
} from "@/lib/beatmap-cache-contract";
import { REPLAY_BEATMAP_MAX_BYTES } from "@/lib/replay-model";

type Action = "sync" | "upload" | "remove";

async function readStatus(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(typeof data.error === "string" ? data.error : "");
  const parsed = beatmapCacheStatus.safeParse(data);
  if (!parsed.success) throw new Error();
  return parsed.data;
}

export function MappoolBeatmapCache({
  url,
  version,
  disabled,
  onChanged,
}: {
  url: string;
  version: number;
  disabled: boolean;
  onChanged: (version: number) => void;
}) {
  const tr = useAppTranslations();
  const [cache, setCache] = useState<BeatmapCacheStatus>();
  const [attempt, setAttempt] = useState(0);
  const [selectedMirror, setSelectedMirror] = useState("");
  const [file, setFile] = useState<File>();
  const [pending, setPending] = useState<Action>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => request.current?.abort(), [url]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, { cache: "no-store", signal: controller.signal })
      .then(readStatus)
      .then((status) => {
        if (!controller.signal.aborted) {
          setCache((current) =>
            !current || current.version <= status.version ? status : current,
          );
          setLoadError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [url, version, attempt]);

  const mirror =
    cache?.mirrors.find(({ id }) => id === selectedMirror) ?? cache?.mirrors[0];
  async function change(action: Action) {
    if (!cache || disabled || request.current) return;
    const form = new FormData();
    form.set("expectedVersion", String(cache.version));
    form.set("confirmed", "true");
    form.set("action", action);
    if (action === "sync") {
      if (!mirror) return;
      form.set("mirror", mirror.id);
    } else if (action === "upload") {
      if (!file) return;
      if (!/\.osz$/i.test(file.name) || file.size > REPLAY_BEATMAP_MAX_BYTES) {
        setError(tr("Choose an .osz beatmap package up to 64 MiB."));
        return;
      }
      form.set("file", file);
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(action);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (response.status === 409) setAttempt((value) => value + 1);
      const status = await readStatus(response);
      if (controller.signal.aborted) return;
      setCache(status);
      setConfirmRemove(false);
      if (action === "upload") {
        setFile(undefined);
        if (input.current) input.current.value = "";
      }
      onChanged(status.version);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error && failure.message
            ? tr(failure.message)
            : tr("Beatmap cache update failed. Retry the operation."),
        );
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setPending(undefined);
      }
    }
  }

  const locked =
    disabled || !!pending || !cache || loadError || cache.version < version;
  return (
    <div className="form-stack mappool-beatmap-cache">
      <h4>{tr("Server beatmap cache")}</h4>
      <p className="small muted" role="status">
        {pending === "sync"
          ? tr("Syncing beatmap package…")
          : pending === "upload"
            ? tr("Uploading beatmap package…")
            : pending === "remove"
              ? tr("Removing beatmap package…")
              : cache?.package
                ? tr("Cached OSZ · {value0} MiB", {
                    value0: (cache.package.size / 1024 ** 2).toFixed(1),
                  })
                : cache
                  ? tr("No beatmap package cached.")
                  : loadError
                    ? ""
                    : tr("Checking beatmap cache…")}
      </p>
      {loadError && (
        <button
          type="button"
          className="secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {tr("Retry loading the beatmap cache")}
        </button>
      )}
      {cache && (
        <fieldset
          className="staff-readonly-fields form-stack"
          disabled={locked}
        >
          {mirror && (
            <div className="actions">
              <label className="field">
                <span>{tr("Beatmap mirror")}</span>
                <select
                  value={mirror.id}
                  onChange={(event) =>
                    setSelectedMirror(event.currentTarget.value)
                  }
                >
                  {cache.mirrors.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => void change("sync")}
              >
                {tr("Sync from mirror")}
              </button>
            </div>
          )}
          <div className="actions">
            <label className="field">
              <span>{tr("Beatmap package (.osz)")}</span>
              <input
                ref={input}
                type="file"
                accept=".osz"
                onChange={(event) => setFile(event.currentTarget.files?.[0])}
              />
            </label>
            <button
              type="button"
              className="secondary"
              disabled={!file}
              onClick={() => void change("upload")}
            >
              {tr("Upload beatmap package")}
            </button>
          </div>
          {cache.package &&
            (confirmRemove ? (
              <div className="actions">
                <p className="small">
                  {tr("Remove this map’s cached package?")}
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setConfirmRemove(false)}
                >
                  {tr("Cancel")}
                </button>
                <button
                  type="button"
                  className="secondary destructive-action"
                  onClick={() => void change("remove")}
                >
                  {tr("Confirm")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="secondary destructive-action"
                onClick={() => setConfirmRemove(true)}
              >
                {tr("Remove cached package")}
              </button>
            ))}
        </fieldset>
      )}
      {error && (
        <p className="error-text small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
