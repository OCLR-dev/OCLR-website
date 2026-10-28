"use client";
import { LoadingRegion } from "./loading-region";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { usePendingRefresh } from "./use-pending-refresh";
import { useAppTranslations } from "@/i18n/shared";
import type { MappoolWorkspace } from "@/lib/mappools";
import type { ReplayItem } from "@/lib/mappool-replays";
import { REPLAY_MAX_BYTES, REPLAY_ENTRY_LIMIT } from "@/lib/replay-model";
import { slotLabel } from "@/lib/mappool-model";
import { useStaffReadOnly } from "./staff-read-only";
import { ConfirmMutation } from "./confirm-mutation";
type Pool = MappoolWorkspace["pools"][number];
type Entry = MappoolWorkspace["entries"][number];
export function ReplayWindow({
  pool,
  url,
  hasMaps,
}: {
  pool: Pool;
  url: string;
  hasMaps: boolean;
}) {
  const tr = useAppTranslations();
  const readOnly = useStaffReadOnly();
  const [deadline, setDeadline] = useState("");
  const date = deadline ? new Date(deadline) : null;
  const valid = date && Number.isFinite(date.getTime());
  const payload = {
    action: "replay_window",
    poolId: pool.id,
    expectedVersion: pool.version,
    showcaseAt: valid ? date.toISOString() : "",
    confirmed: true,
  };
  return (
    <section
      className="replay-window panel form-stack"
      aria-label={tr("Replay upload window")}
    >
      <h3>{tr("Replay upload window")}</h3>
      <p className="muted small">
        {tr(
          "Internal staff only. Lock map selection to open replay uploads. Uploads and deletions close at the Showcase deadline; downloads remain available.",
        )}
      </p>
      {pool.showcaseAt && (
        <p>
          {tr("Showcase deadline")}:{" "}
          <time dateTime={new Date(pool.showcaseAt).toISOString()}>
            {new Date(pool.showcaseAt).toISOString()}
          </time>
        </p>
      )}
      {pool.selectionLockedAt ? (
        <p className="notice">
          {tr(
            "Map selection locked. Maps and the Showcase deadline can no longer be changed.",
          )}
        </p>
      ) : pool.lockedAt ? (
        <p className="notice">
          {tr(
            "Completed-fixture protection prevents configuring a new replay window.",
          )}
        </p>
      ) : readOnly ? null : (
        <>
          <label className="field">
            <span>{tr("Showcase deadline (your local time)")}</span>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          {valid && <p className="small muted">{date.toISOString()}</p>}
          <div className="actions">
            <ConfirmMutation
              label={tr("Save Showcase deadline")}
              title={tr("Save Showcase deadline")}
              url={url}
              payload={{ ...payload, lockSelection: false }}
              requireConfirmation={false}
              disabled={!valid || !hasMaps}
            />
            <ConfirmMutation
              label={tr("Lock map selection")}
              title={tr("Lock map selection?")}
              description={tr(
                "This freezes map selection and the Showcase deadline, and opens replay uploads until that deadline. To change maps later, create a new pool.",
              )}
              url={url}
              payload={{ ...payload, lockSelection: true }}
              disabled={!valid || !hasMaps}
            />
          </div>
        </>
      )}
    </section>
  );
}
export function MappoolReplays({
  slug,
  pool,
  entry,
  canManage,
}: {
  slug: string;
  pool: Pool;
  entry: Entry;
  canManage: boolean;
}) {
  const tr = useAppTranslations(),
    { refreshing, refresh } = usePendingRefresh(),
    id = useId();
  const url = `/api/admin/tournaments/${slug}/mappools/entries/${entry.id}/replays`;
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
    [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState<ReplayItem | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null),
    summary = useRef<HTMLButtonElement>(null);
  const request = useRef<XMLHttpRequest | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const interval = expanded
      ? setInterval(() => setNow(Date.now()), 1000)
      : undefined;
    return () => {
      clearInterval(interval);
      request.current?.abort();
    };
  }, [expanded]);
  const [knownVersion, setKnownVersion] = useState(pool.version);
  const version = Math.max(knownVersion, pool.version);
  const open =
    !!pool.selectionLockedAt &&
    !!pool.showcaseAt &&
    now < new Date(pool.showcaseAt).getTime();
  const writable = canManage && open;
  async function load() {
    setLoading(true);
    try {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems(data);
      setLoaded(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr("Could not load replays. Retry the list."),
      );
    } finally {
      setLoading(false);
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
    try {
      const result = await new Promise<{ duplicate: boolean; version: number }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          request.current = xhr;
          xhr.open("POST", url);
          xhr.timeout = 30000;
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable)
              setProgress(Math.round((e.loaded * 100) / e.total));
          };
          xhr.onload = () => {
            try {
              const data = JSON.parse(xhr.responseText);
              if (xhr.status >= 200 && xhr.status < 300) resolve(data);
              else
                reject(
                  new Error(
                    data.error || tr("Replay upload failed. Retry the file."),
                  ),
                );
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
      await load();
      refresh();
      setPending(false);
    }
  }
  async function remove() {
    if (!deleting || pending || !writable) return;
    setOperation("delete");
    setPending(true);
    setError("");
    try {
      const response = await fetch(`${url}/${deleting.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version,
          confirmed: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setKnownVersion(data.version);
      dialog.current?.close();
      setDeleting(null);
      summary.current?.focus();
      setStatus(tr("Replay deleted."));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr("Replay deletion failed. Reload and retry."),
      );
      dialog.current?.close();
      setDeleting(null);
      summary.current?.focus();
    } finally {
      await load();
      refresh();
      setPending(false);
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
      <button
        type="button"
        ref={summary}
        className="secondary"
        aria-expanded={expanded}
        aria-controls={`${id}-panel`}
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          if (next) void load();
        }}
      >
        {tr("Replays")}
        {loaded ? ` (${items.length})` : ""}
      </button>
      <div
        id={`${id}-panel`}
        hidden={!expanded}
        className="replay-content form-stack"
      >
        <p className="small muted">
          {slotLabel(entry.category, entry.position)} · {tr("Beatmap ID")}{" "}
          {entry.beatmapId}
        </p>
        <p className="notice small">
          {tr(
            "Replay player names are file contents, not verified account identities. Replays do not change registrations, Tiers or results.",
          )}
        </p>
        {!open && (
          <p className="notice">
            {tr(
              "Replay changes are allowed only after map selection is locked and before the Showcase deadline.",
            )}
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setError("");
              void load();
            }}
            disabled={loading}
          >
            {loading ? tr("Loading…") : tr("Reload replay list")}
          </button>
          <span className="small muted">
            {items.length} / {REPLAY_ENTRY_LIMIT}
          </span>
        </div>
        {loaded && !items.length && (
          <p className="muted">{tr("No replays attached.")}</p>
        )}
        <ul className="replay-list">
          {items.map((item) => (
            <li key={item.id} className="replay-item">
              <div>
                <strong className="replay-filename">{item.filename}</strong>
                <p className="muted small">
                  {`${(item.size / 1024).toFixed(1)} KiB`} · {item.uploaderName}{" "}
                  (ID {item.uploaderId}) ·{" "}
                  <time dateTime={new Date(item.createdAt).toISOString()}>
                    {new Date(item.createdAt).toISOString()}
                  </time>
                </p>
              </div>
              {item.description && <p>{item.description}</p>}
              <p className="small">
                {tr("Player name in file")}:{" "}
                <bdi>{item.summary.playerName}</bdi> · {item.summary.mode} ·{" "}
                {tr("Mods")} {item.summary.mods} ·{" "}
                {`stable ${item.summary.version}`}
              </p>
              <p className="small">
                {item.verification === "matched"
                  ? tr("Beatmap checksum matched")
                  : tr("Unverified: official beatmap checksum unavailable")}
              </p>
              <code className="small replay-filename">
                MD5 {item.summary.beatmapMd5}
              </code>
              <div className="actions">
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
            </li>
          ))}
        </ul>
        {canManage && (
          <form onSubmit={upload} className="form-stack" aria-busy={pending}>
            <p id={`${id}-help`} className="small muted">
              {tr(
                "Stable .osr only (version 20140721 or later; no lazer). Up to 8 MiB per file and 10 files per map. Upload one file at a time.",
              )}
            </p>
            <label className="field">
              <span>{tr("Replay file")}</span>
              <input
                ref={input}
                type="file"
                accept=".osr"
                aria-describedby={`${id}-help ${id}-error`}
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
        {status && <p role="status">{tr(status)}</p>}
        <p
          id={`${id}-error`}
          role={error ? "alert" : undefined}
          className="error-text"
        >
          {error && !deleting && tr(error)}
        </p>
        <dialog
          ref={dialog}
          aria-labelledby={`${id}-delete-title`}
          onCancel={(event) => {
            if (pending) event.preventDefault();
            else setDeleting(null);
          }}
          onClose={() => summary.current?.focus()}
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
      </div>
    </section>
  );
}
