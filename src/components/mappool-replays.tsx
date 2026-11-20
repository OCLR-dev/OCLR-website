"use client";

import { LoadingRegion } from "./loading-region";
import { MappoolReplayPlayer } from "./mappool-replay-player";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { MappoolActionIcon } from "./mappool-action-icon";
import { MappoolBeatmapCache } from "./mappool-beatmap-cache";
import { usePendingRefresh } from "./use-pending-refresh";
import { useAppTranslations } from "@/i18n/shared";
import { useFormatter } from "next-intl";
import { beatmapCacheWrite } from "@/lib/beatmap-cache-contract";
import type { MappoolWorkspace } from "@/lib/mappool-reads";
import type { ReplayItem } from "@/lib/mappool-replays";
import { REPLAY_MAX_BYTES, REPLAY_ENTRY_LIMIT } from "@/lib/replay-model";
import {
  deleteReplayWrite,
  uploadReplayWrite,
  type ReplayWriteCommand,
} from "@/lib/replay-write-contract";
import { slotLabel } from "@/lib/mappool-model";
type Pool = MappoolWorkspace["pools"][number];
type Entry = MappoolWorkspace["entries"][number];
const uploadReceipt = uploadReplayWrite.response.pick({
  duplicate: true,
  version: true,
});
export function MappoolReplays({
  slug,
  pool,
  entry,
  canManage,
  canPlay,
  canManageCache,
  renderTrigger = (trigger) => trigger,
}: {
  slug: string;
  pool: Pool;
  entry: Entry;
  canManage: boolean;
  canPlay?: boolean;
  canManageCache?: boolean;
  renderTrigger?: (trigger: ReactNode) => ReactNode;
}) {
  const tr = useAppTranslations(),
    format = useFormatter(),
    { refreshing, refresh } = usePendingRefresh(),
    id = useId();
  const url = uploadReplayWrite.path
    .replace("{edition}", slug)
    .replace("{entryId}", entry.id);
  const [expanded, setExpanded] = useState(false),
    [items, setItems] = useState<ReplayItem[]>([]);
  const [loaded, setLoaded] = useState(false),
    [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [description, setDescription] = useState("");
  const [requestPending, setPending] = useState(false),
    [progress, setProgress] = useState(0);
  const [operation, setOperation] = useState<"upload" | "delete" | null>(null);
  const pending = requestPending || refreshing;
  const uploading = requestPending && operation === "upload";
  const [error, setError] = useState(""),
    [listError, setListError] = useState(""),
    [status, setStatus] = useState("");
  const [selectedReplay, setSelectedReplay] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ReplayItem | null>(null);
  const input = useRef<HTMLInputElement>(null),
    summary = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDialogElement>(null),
    reload = useRef<HTMLButtonElement>(null);
  const request = useRef<XMLHttpRequest | null>(null),
    listRequest = useRef<AbortController | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      listRequest.current?.abort();
      listRequest.current = null;
    },
    [url],
  );
  const [knownVersion, setKnownVersion] = useState(pool.version);
  const [observedCount, setObservedCount] = useState<{
    version: number;
    count: number;
  }>();
  const version = Math.max(knownVersion, pool.version);
  const writable = canManage;
  const count =
    observedCount &&
    (entry.replayCount === undefined || observedCount.version >= pool.version)
      ? observedCount.count
      : entry.replayCount;
  const hasReplays = count !== undefined && count > 0;
  const triggerLabel = hasReplays
    ? tr("Saved replays ({value0})", { value0: count })
    : writable
      ? tr("Upload replays")
      : tr("Replays");
  const labeledTrigger = writable || hasReplays;
  async function load(atVersion = version) {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true);
    setListError("");
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json();
      if (listRequest.current !== controller || controller.signal.aborted)
        return;
      if (!response.ok) throw new Error(data.error);
      setItems(data);
      setObservedCount({ version: atVersion, count: data.length });
      setLoaded(true);
    } catch (err) {
      if (listRequest.current !== controller || controller.signal.aborted)
        return;
      setListError(
        err instanceof Error
          ? err.message
          : tr("Could not load replays. Retry the list."),
      );
    } finally {
      if (listRequest.current === controller) {
        listRequest.current = null;
        setLoading(false);
      }
    }
  }
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || pending || !writable) return;
    if (!/\.osr$/i.test(file.name) || file.size > REPLAY_MAX_BYTES) {
      setError(tr("Choose a stable .osr replay up to 8 MiB."));
      return;
    }
    setPending(true);
    setError("");
    setStatus("");
    setOperation("upload");
    setProgress(0);
    const form = new FormData();
    form.set("file", file);
    form.set("description", description);
    form.set("expectedVersion", String(version));
    form.set("confirmed", "true");
    let listVersion = version;
    try {
      const result = await new Promise<{ duplicate: boolean; version: number }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          request.current = xhr;
          xhr.open(uploadReplayWrite.method, url);
          xhr.timeout = 30000;
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable)
              setProgress(Math.round((e.loaded * 100) / e.total));
          };
          xhr.onload = () => {
            try {
              const data: unknown = JSON.parse(xhr.responseText);
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(uploadReceipt.parse(data));
              } else {
                const failure = uploadReplayWrite.error.safeParse(data);
                reject(
                  new Error(
                    (failure.success && failure.data.error) ||
                      tr("Replay upload failed. Retry the file."),
                  ),
                );
              }
            } catch {
              reject(new Error(tr("Replay upload failed. Retry the file.")));
            }
          };
          const interrupted = () =>
            reject(
              new Error(
                tr(
                  "Upload interrupted. Reload the list and retry; an already saved file will not be added twice.",
                ),
              ),
            );
          xhr.onerror = interrupted;
          xhr.onabort = interrupted;
          xhr.ontimeout = interrupted;
          xhr.send(form);
        },
      );
      setKnownVersion(result.version);
      listVersion = result.version;
      if (!result.duplicate && count !== undefined)
        setObservedCount({ version: result.version, count: count + 1 });
      setStatus(
        result.duplicate
          ? tr("This file is already attached. No duplicate was created.")
          : tr("Replay uploaded."),
      );
      setFile(null);
      setDescription("");
      if (input.current) input.current.value = "";
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr("Replay upload failed. Retry the file."),
      );
    } finally {
      request.current = null;
      await load(listVersion);
      refresh();
      setPending(false);
    }
  }
  async function remove() {
    if (!deleting || pending || !writable) return;
    const failure = tr("Replay deletion failed. Reload and retry.");
    setOperation("delete");
    setPending(true);
    setError("");
    setStatus("");
    let listVersion = version;
    try {
      const command: ReplayWriteCommand = {
        expectedVersion: version,
        confirmed: true,
      };
      const response = await fetch(`${url}/${deleting.id}`, {
        method: deleteReplayWrite.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const error = deleteReplayWrite.error.safeParse(body);
        throw new Error(error.success ? error.data.error : failure);
      }
      const parsed = deleteReplayWrite.response.safeParse(body);
      if (!parsed.success) throw new Error(failure);
      setKnownVersion(parsed.data.version);
      listVersion = parsed.data.version;
      if (parsed.data.removed) {
        setItems((current) =>
          current.filter((item) => item.id !== deleting.id),
        );
        if (count !== undefined)
          setObservedCount({
            version: parsed.data.version,
            count: Math.max(0, count - 1),
          });
      }
      dialog.current?.close();
      setDeleting(null);
      setStatus(tr("Replay deleted."));
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
      dialog.current?.close();
      setDeleting(null);
    } finally {
      await load(listVersion);
      refresh();
      setPending(false);
      requestAnimationFrame(() => reload.current?.focus());
    }
  }
  return (
    <section
      className="mappool-replays"
      aria-label={tr("Replays for {value0}", {
        value0: slotLabel(entry.category, entry.position),
      })}
    >
      {pending && !deleting && operation === "delete" && <LoadingRegion />}
      {renderTrigger(
        <button
          type="button"
          ref={summary}
          className={`secondary ${labeledTrigger ? "mappool-labeled-action" : "mappool-icon-action"}`}
          aria-label={triggerLabel}
          title={triggerLabel}
          aria-haspopup="dialog"
          aria-expanded={expanded}
          aria-controls={`${id}-panel`}
          onClick={() => {
            setExpanded(true);
            panel.current?.showModal();
            void load();
          }}
        >
          <MappoolActionIcon kind="replays" />
          {labeledTrigger && <span>{triggerLabel}</span>}
        </button>,
      )}
      <dialog
        ref={panel}
        id={`${id}-panel`}
        className="replay-dialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-map`}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClose={() => {
          listRequest.current?.abort();
          listRequest.current = null;
          setLoading(false);
          setExpanded(false);
          setSelectedReplay(null);
          summary.current?.focus();
        }}
      >
        <header className="replay-dialog-heading">
          <div>
            <h3 id={`${id}-title`}>
              {tr("Replays for {value0}", {
                value0: slotLabel(entry.category, entry.position),
              })}
            </h3>
            <p id={`${id}-map`} className="small muted">
              {tr("Beatmap ID")} {entry.beatmapId}
              {count !== undefined && ` · ${count} / ${REPLAY_ENTRY_LIMIT}`}
            </p>
          </div>
          <div className="replay-toolbar">
            <button
              type="button"
              ref={reload}
              className="secondary mappool-icon-action"
              aria-label={tr("Reload replay list")}
              title={tr("Reload replay list")}
              aria-busy={loading}
              onClick={() => {
                setError("");
                void load();
              }}
              disabled={loading}
            >
              <MappoolActionIcon kind="refresh" />
            </button>
            <button
              type="button"
              className="secondary mappool-icon-action"
              aria-label={tr("Close")}
              title={tr("Close")}
              disabled={pending}
              onClick={() => panel.current?.close()}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </header>
        <div className="replay-content">
          {loaded && !items.length && (
            <p className="small muted">{tr("No replays attached.")}</p>
          )}
          {!!items.length && (
            <ul className="replay-list">
              {items.map((item) => (
                <li key={item.id} className="replay-item">
                  <div>
                    <strong className="replay-filename">{item.filename}</strong>
                    <p className="muted small replay-item-meta">
                      <bdi>{item.uploaderName}</bdi> ·{" "}
                      <time dateTime={new Date(item.createdAt).toISOString()}>
                        {format.dateTime(new Date(item.createdAt), {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "UTC",
                          timeZoneName: "short",
                        })}
                      </time>
                      {" · "}
                      {tr("{value0} KiB", {
                        value0: format.number(item.size / 1024, {
                          maximumFractionDigits: 1,
                        }),
                      })}
                    </p>
                  </div>
                  {item.description && <p>{item.description}</p>}
                  <div className="actions">
                    {canPlay && item.summary.mode === "osu" && (
                      <button
                        type="button"
                        className="secondary"
                        aria-expanded={selectedReplay === item.id}
                        aria-controls={
                          selectedReplay === item.id
                            ? `${id}-player`
                            : undefined
                        }
                        onClick={() =>
                          setSelectedReplay(
                            selectedReplay === item.id ? null : item.id,
                          )
                        }
                      >
                        {selectedReplay === item.id
                          ? tr("Close player")
                          : tr("Open replay player")}
                      </button>
                    )}
                    <a className="button secondary" href={`${url}/${item.id}`}>
                      {tr("Download replay")}
                    </a>
                    {writable && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={pending}
                        onClick={() => {
                          setError("");
                          setDeleting(item);
                          dialog.current?.showModal();
                        }}
                      >
                        {tr("Delete replay")}
                      </button>
                    )}
                  </div>
                  <details className="replay-technical small muted">
                    <summary>
                      {tr("Replay details")} ·{" "}
                      <span>
                        {item.verification === "matched"
                          ? tr("Beatmap checksum matched")
                          : tr(
                              "Unverified: official beatmap checksum unavailable",
                            )}
                      </span>
                    </summary>
                    <p>
                      {tr("Player name in file")} ·{" "}
                      <bdi>{item.summary.playerName}</bdi>
                      {" · "}
                      {item.summary.mode} · {tr("Mods")} {item.summary.mods} ·{" "}
                      {`stable ${item.summary.version}`}
                    </p>
                    <p>
                      <bdi>{item.uploaderName}</bdi> (ID {item.uploaderId}) ·{" "}
                      <code>MD5 {item.summary.beatmapMd5}</code>
                    </p>
                  </details>
                  {expanded && canPlay && selectedReplay === item.id && (
                    <MappoolReplayPlayer
                      key={`${url}/${item.id}`}
                      id={`${id}-player`}
                      replayUrl={`${url}/${item.id}`}
                      beatmapMd5={item.summary.beatmapMd5}
                      filename={item.filename}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManage && (
            <form
              onSubmit={upload}
              className="replay-upload"
              aria-busy={pending}
            >
              <p id={`${id}-help`} className="small muted replay-upload-help">
                {tr("Choose a stable .osr replay up to 8 MiB.")}
              </p>
              <label className="field">
                <span>{tr("Replay file")}</span>
                <input
                  ref={input}
                  type="file"
                  accept=".osr"
                  aria-describedby={`${id}-help${error && !deleting ? ` ${id}-error` : ""}`}
                  disabled={!writable || pending}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setError("");
                  }}
                />
              </label>
              <label className="field">
                <span>{tr("Replay description (optional)")}</span>
                <input
                  value={description}
                  maxLength={500}
                  disabled={!writable || pending}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <div className="actions">
                <button type="submit" disabled={!writable || !file || pending}>
                  {uploading
                    ? progress === 100
                      ? tr("Validating and saving…")
                      : tr("Uploading…")
                    : tr("Upload replay")}
                </button>
                {uploading && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => request.current?.abort()}
                  >
                    {tr("Cancel upload")}
                  </button>
                )}
              </div>
              {uploading && (
                <progress
                  aria-label={tr("Replay upload progress")}
                  max={100}
                  value={progress}
                />
              )}
            </form>
          )}
          {expanded && canPlay && canManageCache && (
            <MappoolBeatmapCache
              url={beatmapCacheWrite.path
                .replace("{edition}", slug)
                .replace("{entryId}", entry.id)}
              version={version}
              disabled={pending}
              onChanged={(newVersion) => {
                setKnownVersion(newVersion);
                refresh();
              }}
            />
          )}
          {status && <p role="status">{tr(status)}</p>}
          {listError && (
            <p role="alert" className="error-text">
              {tr(listError)}
            </p>
          )}
          {error && !deleting && (
            <p id={`${id}-error`} role="alert" className="error-text">
              {tr(error)}
            </p>
          )}
        </div>
      </dialog>
      <dialog
        ref={dialog}
        className="replay-delete-dialog"
        aria-labelledby={`${id}-delete-title`}
        onCancel={(event) => {
          if (pending) event.preventDefault();
          else setDeleting(null);
        }}
        onClose={() => reload.current?.focus()}
      >
        {pending && deleting && operation === "delete" && <LoadingRegion />}
        <h3 id={`${id}-delete-title`}>{tr("Delete replay?")}</h3>
        <p className="replay-filename">{deleting?.filename}</p>
        <p>
          {tr(
            "This removes the staff attachment. It does not change the beatmap or any result.",
          )}
        </p>
        {deleting && error && (
          <p role="alert" className="error-text">
            {tr(error)}
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={() => {
              dialog.current?.close();
              setDeleting(null);
            }}
          >
            {tr("Cancel")}
          </button>
          <button
            type="button"
            disabled={pending || !writable}
            aria-busy={pending && operation === "delete"}
            onClick={() => void remove()}
          >
            {tr("Delete replay")}
          </button>
        </div>
      </dialog>
    </section>
  );
}
