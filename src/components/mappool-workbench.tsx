"use client";
import { useEffect, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type {
  CandidateComments,
  CandidatePreview,
  SelectionWorkspace,
} from "@/lib/mappool-workbench";
import type { BeatmapMetadata } from "@/lib/mappool-model";
import {
  formatBeatmapDuration,
  formatBeatmapNumber,
} from "@/lib/mappool-model";
import {
  candidateCategories,
  type CandidateCategory,
  candidateLimit,
  commentLength,
  commentLimit,
} from "@/lib/mappool-workbench-model";
import type { MappoolWorkspace } from "@/lib/mappools";
import { EntryForm } from "./mappool-editor";
import { WorkspaceTabs } from "./workspace-tabs";
import { MapCardBand } from "./map-card-band";
import { BeatmapCover } from "./beatmap-cover";
import { BeatmapActions } from "./beatmap-actions";
import styles from "./mappool-workbench.module.css";
async function request<T>(url: string, data?: unknown): Promise<T> {
  const response = await fetch(
    url,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : { cache: "no-store" },
  ).catch(() => null);
  if (!response)
    throw new Error("This request could not be completed. Please try again.");
  const result = await response.json().catch(() => null);
  if (!result)
    throw new Error("This request could not be completed. Please try again.");
  if (!response.ok)
    throw new Error(
      result.error || "This request could not be completed. Please try again.",
    );
  return result as T;
}
function Stamp({ value }: { value: string | Date }) {
  const tr = useAppTranslations();
  const date = new Date(value);
  return (
    <time dateTime={date.toISOString()}>
      {new Intl.DateTimeFormat(tr.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date)}{" "}
      UTC
    </time>
  );
}
function MapIdentity({
  id,
  metadata: m,
}: {
  id: number;
  metadata: BeatmapMetadata;
}) {
  const tr = useAppTranslations();
  return (
    <div className={styles.identity}>
      <BeatmapCover setId={m.setId} compact />
      <div>
        <a
          className="text-link"
          href={`https://osu.ppy.sh/beatmaps/${id}`}
          target="_blank"
          rel="noreferrer"
        >
          <strong>
            {m.artist} — {m.title}
          </strong>{" "}
          ↗
        </a>
        <p className="small muted">
          {m.difficulty} · {m.mapper}
        </p>
        <span className="small muted">
          {tr("BID")} {id}
        </span>
        <BeatmapActions beatmapId={id} setId={m.setId} showWeb={false} />
      </div>
    </div>
  );
}
function Parameters({ m }: { m: BeatmapMetadata }) {
  const tr = useAppTranslations();
  return (
    <div className={styles.parameters}>
      <p>
        <strong>
          {formatBeatmapNumber(m.stars, 2)} {tr("★ base")}
        </strong>
        <span>
          {formatBeatmapNumber(m.bpm)} {tr("BPM")}
        </span>
        <span>{formatBeatmapDuration(m.duration)}</span>
      </p>
      <p className="muted small">
        <span>
          {tr("AR")} {formatBeatmapNumber(m.ar)}
        </span>
        <span>
          {tr("OD")} {formatBeatmapNumber(m.od)}
        </span>
        <span>
          {tr("CS")} {formatBeatmapNumber(m.cs)}
        </span>
        <span>
          {tr("HP")} {formatBeatmapNumber(m.hp)}
        </span>
      </p>
    </div>
  );
}
function CommentItem({
  comment: c,
  canManage,
  base,
  candidateId,
  onChange,
}: {
  comment: CandidateComments[number];
  canManage: boolean;
  base: string;
  candidateId: string;
  onChange: (deleted: boolean) => Promise<void>;
}) {
  const tr = useAppTranslations();
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [target, setTarget] = useState(c);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const deleteConfirmation = useRef<HTMLButtonElement>(null);
  const previousMode = useRef(mode);
  useEffect(() => {
    if (mode === "edit") editor.current?.focus();
    else if (mode === "delete") deleteConfirmation.current?.focus();
    else if (previousMode.current === "edit") editTrigger.current?.focus();
    else if (previousMode.current === "delete") deleteTrigger.current?.focus();
    previousMode.current = mode;
  }, [mode]);
  async function save(action: "comment_edit" | "comment_delete") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await request(base, {
        action,
        candidateId,
        commentId: target.id,
        version: target.version,
        ...(action === "comment_edit" ? { body: draft.trim() } : {}),
      });
      setMode(null);
      await onChange(action === "comment_delete");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function begin(next: "edit" | "delete") {
    setTarget(c);
    setDraft(c.body);
    setError("");
    setMode(next);
  }
  return (
    <li>
      <p className="small">
        <a
          className="text-link"
          href={`https://osu.ppy.sh/users/${c.authorId}`}
        >
          <strong>{c.authorName}</strong>
        </a>{" "}
        <span className="muted">
          · <Stamp value={c.createdAt} />
        </span>
      </p>
      {mode === "edit" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save("comment_edit");
          }}
        >
          <label className="field">
            <span>{tr("Edit comment")}</span>
            <textarea
              ref={editor}
              value={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              required
              maxLength={commentLength}
              rows={3}
            />
          </label>
          <div className={styles.commentActions}>
            <button disabled={busy || !draft.trim()}>{tr("Save")}</button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setMode(null);
                setError("");
              }}
            >
              {tr("Cancel")}
            </button>
          </div>
        </form>
      ) : (
        <p className={styles.commentBody}>{c.body}</p>
      )}
      {canManage && mode === null && (
        <div className={styles.commentActions}>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            ref={editTrigger}
            onClick={() => begin("edit")}
          >
            {tr("Edit")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            ref={deleteTrigger}
            onClick={() => begin("delete")}
          >
            {tr("Delete")}
          </button>
        </div>
      )}
      {mode === "delete" && (
        <div role="group" aria-label={tr("Delete this comment?")}>
          <p>{tr("Delete this comment?")}</p>
          <div className={styles.commentActions}>
            <button
              type="button"
              disabled={busy}
              ref={deleteConfirmation}
              onClick={() => void save("comment_delete")}
            >
              {tr("Confirm delete")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setMode(null);
                setError("");
              }}
            >
              {tr("Cancel")}
            </button>
          </div>
        </div>
      )}
      {busy && <p role="status">{tr("Working…")}</p>}
      {error && (
        <p className="error" role="alert">
          {tr(error)}
        </p>
      )}
    </li>
  );
}
function Comments({
  slug,
  id,
  count,
  writable,
  viewerId,
  onChange,
}: {
  slug: string;
  id: string;
  count: number;
  writable: boolean;
  viewerId: number;
  onChange: () => Promise<void>;
}) {
  const tr = useAppTranslations();
  const [comments, setComments] = useState<CandidateComments | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const region = useRef<HTMLElement>(null);
  const refreshTrigger = useRef<HTMLButtonElement>(null);
  const readGeneration = useRef(0);
  const pending = useRef(false);
  const submission = useRef<{ body: string; id: string } | null>(null);
  const base = `/api/admin/tournaments/${slug}/mappool-workbench`;
  const load = async () => {
    const generation = ++readGeneration.current;
    const rows = await request<CandidateComments>(`${base}/${id}/comments`);
    if (generation === readGeneration.current) setComments(rows);
  };
  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const node = region.current;
    if (!node) return;
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const generation = ++readGeneration.current;
        request<CandidateComments>(`${base}/${id}/comments`)
          .then((rows) => {
            if (active && generation === readGeneration.current)
              setComments(rows);
          })
          .catch((e: Error) => {
            if (active && generation === readGeneration.current)
              setError(e.message);
          });
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [base, id]);
  return (
    <section
      ref={region}
      className={styles.discussion}
      aria-label={tr("Comments ({count})", {
        count: comments?.length ?? count,
      })}
    >
      <h3>{tr("Comments ({count})", { count: comments?.length ?? count })}</h3>
      <div className={styles.thread}>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          ref={refreshTrigger}
          onClick={() => void refresh()}
        >
          {tr("Refresh comments")}
        </button>
        {comments === null && !error && (
          <p className="muted small">{tr("Loading…")}</p>
        )}
        {comments?.length === 0 && (
          <p className="muted small">{tr("No comments yet.")}</p>
        )}
        <ol
          className={styles.comments}
          tabIndex={0}
          aria-label={tr("Comments ({count})", {
            count: comments?.length ?? count,
          })}
        >
          {comments?.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              canManage={writable && viewerId === c.authorId}
              base={base}
              candidateId={id}
              onChange={async (deleted) => {
                await load();
                await onChange();
                if (deleted) refreshTrigger.current?.focus();
              }}
            />
          ))}
        </ol>
        {writable && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (pending.current) return;
              pending.current = true;
              setBusy(true);
              setError("");
              if (
                !submission.current ||
                submission.current.body !== body.trim()
              )
                submission.current = {
                  body: body.trim(),
                  id: crypto.randomUUID(),
                };
              try {
                await request(base, {
                  action: "comment",
                  candidateId: id,
                  requestId: submission.current.id,
                  body: submission.current.body,
                });
                setBody("");
                submission.current = null;
                await load();
                await onChange();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                pending.current = false;
                setBusy(false);
              }
            }}
          >
            <label className="field">
              <span>{tr("Your comment")}</span>
              <textarea
                value={body}
                disabled={busy}
                onChange={(event) => setBody(event.target.value)}
                required
                maxLength={commentLength}
                rows={3}
              />
            </label>
            <p className="small muted">
              {tr(
                "Up to {count} characters per comment; {limit} comments per map.",
                { count: commentLength, limit: commentLimit },
              )}
            </p>
            <button disabled={busy || !body.trim()}>
              {busy ? tr("Working…") : tr("Post comment")}
            </button>
          </form>
        )}
        {busy && <p role="status">{tr("Working…")}</p>}
        {error && (
          <p className="error" role="alert">
            {tr(error)}
          </p>
        )}
      </div>
    </section>
  );
}
export function SelectionWorkbench({
  slug,
  initialData,
  writable,
  viewerId,
  officialPools,
}: {
  slug: string;
  initialData: SelectionWorkspace;
  officialPools: MappoolWorkspace | null;
  writable: boolean;
  viewerId: number;
}) {
  const tr = useAppTranslations();
  const [data, setData] = useState(initialData);
  const [category, setCategory] = useState<CandidateCategory>("unassigned");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<CandidatePreview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const base = `/api/admin/tournaments/${slug}/mappool-workbench`;
  const reload = async () => setData(await request<SelectionWorkspace>(base));
  const states: Record<string, string> = {
    ready: tr("Ready"),
    duplicate: tr("Duplicate"),
    invalid: tr("Invalid BID"),
    failed: tr("Lookup failed"),
  };
  return (
    <div className={`mappool-selection-workbench ${styles.workbench}`}>
      <p className="muted">
        {tr(
          "Collect candidate maps and discuss test feedback. Candidates and comments remain private to authorized staff.",
        )}
      </p>
      {!writable && (
        <p className="notice">
          {data.archived
            ? tr(
                "Historical archives are read-only in the selection workbench.",
              )
            : tr("This workbench is read-only.")}
        </p>
      )}
      <WorkspaceTabs
        id="candidate-mods"
        label="Mod category"
        appearance="line"
        items={candidateCategories.map((value) => ({
          value,
          label: `${value === "unassigned" ? tr("Unassigned") : value} (${data.candidates.filter((c) => c.category === value).length})`,
        }))}
        value={category}
        onChange={(next) => {
          if (busy) return;
          setCategory(next);
          setPreview(null);
          setSelected([]);
          setNotice("");
        }}
      />
      <div
        role="tabpanel"
        id="candidate-mods-panel"
        aria-labelledby={`candidate-mods-${category}`}
      >
        {writable && (
          <section
            className={styles.importer}
            aria-labelledby="candidate-import-heading"
          >
            <h2 id="candidate-import-heading">{tr("Add candidate maps")}</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (pending.current) return;
                pending.current = true;
                setBusy(true);
                setError("");
                setNotice("");
                setPreview(null);
                try {
                  const result = await request<CandidatePreview>(base, {
                    action: "preview",
                    category,
                    text,
                  });
                  setPreview(result);
                  setSelected(
                    result.rows
                      .filter((r) => r.status === "ready")
                      .map((r) => r.line),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  pending.current = false;
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                <span>{tr("Beatmap IDs or difficulty URLs")}</span>
                <textarea
                  rows={4}
                  required
                  maxLength={16000}
                  value={text}
                  disabled={busy}
                  onChange={(e) => {
                    setText(e.target.value);
                    setPreview(null);
                  }}
                  placeholder={"4184799\nhttps://osu.ppy.sh/beatmaps/75"}
                  aria-describedby="candidate-input-help"
                />
              </label>
              <p className="small muted" id="candidate-input-help">
                {tr(
                  "One BID or official difficulty URL per line, up to 50 maps. Blank lines are ignored; set-only URLs are not supported.",
                )}
              </p>
              <button disabled={busy || !text.trim()}>
                {tr("Preview candidates")}
              </button>
            </form>
            {preview && (
              <div className={styles.preview}>
                <h3>{tr("Candidate preview")}</h3>
                <ul className={styles.previewList}>
                  {preview.rows.map((r) => (
                    <li key={r.line}>
                      <label className={styles.choice}>
                        <input
                          type="checkbox"
                          aria-label={tr("Include row {count}", {
                            count: r.line,
                          })}
                          checked={selected.includes(r.line)}
                          disabled={busy || r.status !== "ready"}
                          onChange={(e) =>
                            setSelected((old) =>
                              e.target.checked
                                ? [...old, r.line]
                                : old.filter((n) => n !== r.line),
                            )
                          }
                        />
                        <span className="small">
                          {tr("Row {count}", { count: r.line })} ·{" "}
                          {states[r.status]} · {r.input}
                        </span>
                      </label>
                      {r.snapshot && (
                        <div className={styles.previewMap}>
                          <MapIdentity
                            id={r.snapshot.beatmapId}
                            metadata={r.snapshot.metadata}
                          />
                          <Parameters m={r.snapshot.metadata} />
                        </div>
                      )}
                      {r.error && <p className="small error">{tr(r.error)}</p>}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={busy || !selected.length}
                  onClick={async () => {
                    if (pending.current) return;
                    pending.current = true;
                    setBusy(true);
                    setError("");
                    const chosen = preview.rows.filter(
                      (r) =>
                        selected.includes(r.line) &&
                        r.status === "ready" &&
                        r.snapshot,
                    );
                    try {
                      const result = await request<{
                        added: number;
                        skipped: number;
                      }>(base, {
                        action: "add",
                        category,
                        rows: chosen.map((r) => ({
                          beatmapId: r.beatmapId,
                          fingerprint: r.snapshot!.fingerprint,
                        })),
                      });
                      setNotice(
                        tr(
                          "Added {count} maps; skipped {skipped} existing maps.",
                          { count: result.added, skipped: result.skipped },
                        ),
                      );
                      const done = new Set(chosen.map((r) => r.line));
                      setText(
                        preview.rows
                          .filter(
                            (r) =>
                              !done.has(r.line) && r.status !== "duplicate",
                          )
                          .map((r) => r.input)
                          .join("\n"),
                      );
                      setPreview(null);
                      setSelected([]);
                      await reload();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      pending.current = false;
                      setBusy(false);
                    }
                  }}
                >
                  {tr("Add selected candidates ({count})", {
                    count: selected.length,
                  })}
                </button>
              </div>
            )}
          </section>
        )}
        {busy && <p role="status">{tr("Working…")}</p>}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p className="error" role="alert">
            {tr(error)}
          </p>
        )}
        <section aria-labelledby="candidate-list-heading">
          <div className={styles.listHeading}>
            <h2 id="candidate-list-heading">
              {tr("Candidate maps ({count})", {
                count: data.candidates.filter((c) => c.category === category)
                  .length,
              })}
            </h2>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await reload();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("Refresh list")}
            </button>
          </div>
          <p className="small muted">
            {tr(
              "Up to {count} candidates per edition. Adding candidates does not change or publish an official pool.",
              { count: candidateLimit },
            )}
          </p>
          {!data.candidates.some((c) => c.category === category) && (
            <p className="empty">{tr("No candidate maps yet.")}</p>
          )}
          <ul className={styles.candidates}>
            {data.candidates.map((c) => (
              <li key={c.id} hidden={c.category !== category}>
                <article
                  className={styles.candidateRow}
                  aria-label={`BID ${c.beatmapId}`}
                >
                  <div>
                    <MapCardBand
                      id={`candidate-map-${c.id}`}
                      dataCategory={c.category}
                      slot={
                        c.category === "unassigned"
                          ? tr("Unassigned")
                          : c.category
                      }
                      title={c.metadata.title ?? `BID ${c.beatmapId}`}
                      artist={c.metadata.artist}
                      difficulty={c.metadata.difficulty}
                      mapper={c.metadata.mapper}
                      beatmapId={c.beatmapId}
                      setId={c.metadata.setId}
                      stars={c.metadata.stars}
                      bpm={c.metadata.bpm}
                      durationSeconds={c.metadata.duration}
                      cs={c.metadata.cs}
                      ar={c.metadata.ar}
                      od={c.metadata.od}
                      showMode={false}
                      openHref={`https://osu.ppy.sh/beatmaps/${c.beatmapId}`}
                      openLabel={`${c.metadata.artist} — ${c.metadata.title}`}
                      note={tr("★ base")}
                      chips={
                        <span>
                          {tr("HP")} {formatBeatmapNumber(c.metadata.hp)}
                        </span>
                      }
                    />
                    <div className={styles.candidateTools}>
                      <div className={`small muted ${styles.attribution}`}>
                        <p>
                          {tr("Added by")}{" "}
                          <a
                            className="text-link"
                            href={`https://osu.ppy.sh/users/${c.authorId}`}
                          >
                            <strong>{c.authorName}</strong>
                          </a>
                        </p>
                        <Stamp value={c.createdAt} />
                      </div>
                      {writable && (
                        <label className={`field ${styles.categoryField}`}>
                          <span>{tr("Mod category")}</span>
                          <select
                            value={c.category}
                            disabled={busy}
                            onChange={async (event) => {
                              setBusy(true);
                              setError("");
                              try {
                                await request(base, {
                                  action: "classify",
                                  candidateId: c.id,
                                  category: event.target.value,
                                  expectedCategory: c.category,
                                });
                                await reload();
                              } catch (e) {
                                setError((e as Error).message);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {candidateCategories.map((value) => (
                              <option key={value} value={value}>
                                {value === "unassigned"
                                  ? tr("Unassigned")
                                  : value}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {officialPools && (
                        <PromoteCandidate
                          slug={slug}
                          candidate={c}
                          initialPools={officialPools}
                        />
                      )}
                    </div>
                  </div>
                  <Comments
                    slug={slug}
                    id={c.id}
                    count={c.commentCount}
                    writable={writable}
                    viewerId={viewerId}
                    onChange={reload}
                  />
                </article>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function PromoteCandidate({
  slug,
  candidate,
  initialPools,
}: {
  slug: string;
  candidate: SelectionWorkspace["candidates"][number];
  initialPools: MappoolWorkspace;
}) {
  const tr = useAppTranslations();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(initialPools);
  const [poolId, setPoolId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const endpoint = `/api/admin/tournaments/${slug}/mappools`;
  const pool = data.pools.find((p) => p.id === poolId);
  const available = data.pools.filter(
    (p) => !p.lockedAt && !p.selectionLockedAt,
  );
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setData(await request<MappoolWorkspace>(endpoint));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.promotion}>
      <button
        type="button"
        className="secondary"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) void refresh();
        }}
      >
        {tr("Add to official pool")}
      </button>
      {saved && (
        <p role="status">{tr("Candidate added to the official pool.")}</p>
      )}
      {open && (
        <div className={styles.promotionForm}>
          <label className="field">
            <span>{tr("Target pool")}</span>
            <select
              value={poolId}
              disabled={busy}
              onChange={(event) => {
                setPoolId(event.target.value);
                setSaved(false);
              }}
            >
              <option value="">{tr("Choose a pool")}</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {data.rounds.find((r) => r.id === p.roundId)?.name} · {p.name}
                  {p.publishedAt ? ` · ${tr("Published")}` : ""}
                </option>
              ))}
            </select>
          </label>
          {!available.length && (
            <p className="muted small">
              {tr(
                "No editable pools. Create a pool in mappool management first.",
              )}
            </p>
          )}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {tr("Refresh list")}
          </button>
          {error && (
            <p role="alert" className="error">
              {tr(error)}
            </p>
          )}
          {!busy && pool && !pool.lockedAt && !pool.selectionLockedAt && (
            <>
              {pool.publishedAt && (
                <p className="notice">
                  {tr(
                    "This pool is public. Added maps will be visible immediately.",
                  )}
                </p>
              )}
              <EntryForm
                key={`${pool.id}-${pool.version}-${candidate.category}`}
                change={{ url: endpoint }}
                pool={pool}
                category={
                  candidate.category === "unassigned"
                    ? "NM"
                    : candidate.category
                }
                candidateBeatmapId={candidate.beatmapId}
                entries={data.entries.filter((e) => e.poolId === pool.id)}
                onSuccess={() => {
                  setSaved(true);
                  setOpen(false);
                  void refresh();
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
