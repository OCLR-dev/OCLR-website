"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import type { PracticeWorkspace } from "@/lib/player-workspace";
import {
  practiceValueSchema,
  practiceFeels,
  type PracticeFeel,
  type PracticeValue,
} from "@/lib/player-workspace-model";
import { categories, slotLabel, fmPolicyName } from "@/lib/mappool-model";
import { beatmapLinks } from "@/lib/beatmap-links";
import { BeatmapActions } from "./beatmap-actions";
import { BeatmapCover } from "./beatmap-cover";
import { EmptyState } from "./ui";
import { SheetIcon } from "./sheet-icon";
import { useUnsavedWorkspace, useWorkspaceSave } from "./player-workspace-save";
import styles from "./player-workspace.module.css";

type Entry = NonNullable<PracticeWorkspace["pool"]>["entries"][number];
const empty: PracticeValue = { score: null, feel: null, comment: "" };
function practiceParticipants(data: PracticeWorkspace) {
  return [
    ...data.participants.filter((player) => player.osuId === data.actorId),
    ...data.participants.filter((player) => player.osuId !== data.actorId),
  ];
}

function PracticeTabs({
  id,
  label,
  items,
  value,
  panel,
  onChange,
}: {
  id: string;
  label: string;
  items: { id: string; label: string }[];
  value: string;
  panel: (id: string) => string;
  onChange: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={root}
      className={`workspace-tabs ${styles.practiceTabs}`}
      role="tablist"
      aria-label={label}
      onKeyDown={(event) => {
        const tabs = [
          ...root.current!.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
        ];
        const index = tabs.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        const next =
          event.key === "ArrowRight"
            ? (index + 1) % tabs.length
            : event.key === "ArrowLeft"
              ? (index + tabs.length - 1) % tabs.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : null;
        if (next !== null) {
          event.preventDefault();
          tabs[next].focus();
        }
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`${id}-${item.id}`}
          aria-selected={value === item.id}
          aria-controls={panel(item.id)}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function PracticeComment({ comment }: { comment: string }) {
  const tr = useAppTranslations();
  if (comment.length <= 120 && comment.split("\n").length <= 3)
    return <p className={styles.comment}>{comment}</p>;
  return (
    <details className={styles.commentDisclosure}>
      <summary role="button" aria-label={tr("Read full comment")}>
        <span className={styles.commentPreview}>{comment}</span>
        <span className={styles.commentExpand}>
          <SheetIcon kind="expand" />
          <span>{tr("Practice comment")}</span>
        </span>
      </summary>
      <p className={styles.comment}>{comment}</p>
    </details>
  );
}

function PracticeEntry({
  entry,
  data,
  slug,
  onDirty,
}: {
  entry: Entry;
  data: PracticeWorkspace;
  slug: string;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const tr = useAppTranslations();
  const feelLabels = { bad: tr("Poor"), normal: tr("Okay"), good: tr("Good") };
  const links = beatmapLinks(entry.beatmapId, entry.metadata.setId);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [copyState]);
  const own = entry.records.find((record) => record.userId === data.actorId);
  const initial =
    own && !own.stale
      ? { score: own.score, feel: own.feel, comment: own.comment }
      : empty;
  const [value, setValue] = useState(initial),
    [saved, setSaved] = useState(initial);
  const [version, setVersion] = useState(entry.ownVersion);
  const [exists, setExists] = useState(Boolean(own));
  const [stale, setStale] = useState(Boolean(own?.stale));
  const [validation, setValidation] = useState("");
  const { save, busy, message, failed } = useWorkspaceSave(
    `/api/tournaments/${slug}/player/practice`,
  );
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  const feedback = validation || (failed || !dirty ? message : "");
  useEffect(() => {
    onDirty(entry.id, dirty || busy);
    return () => onDirty(entry.id, false);
  }, [entry.id, dirty, busy, onDirty]);
  const label = slotLabel(entry.category, entry.position);
  const disabled = data.readOnly || busy;
  const visibleRecords = [
    ...entry.records.filter((record) => record.userId !== data.actorId),
    ...(exists
      ? stale && own
        ? [own]
        : [{ ...saved, userId: data.actorId, version, stale: false }]
      : []),
  ];
  const target = {
    entryId: entry.id,
    expectedContext: entry.context,
    expectedVersion: version,
  };
  const best = Math.max(
    ...visibleRecords
      .filter((record) => !record.stale && record.score !== null)
      .map((record) => record.score!),
  );
  const deleteRecord = async () => {
    if (!window.confirm(tr("Delete your practice record?"))) return;
    setValidation("");
    const next = await save(
      { ...target, action: "delete_practice" },
      tr("Practice record deleted."),
    );
    if (next !== undefined) {
      setVersion(next);
      setExists(false);
      setStale(false);
      setValue(empty);
      setSaved(empty);
    }
  };
  const editor = (
    <form
      className={styles.practiceForm}
      aria-label={`${tr("My practice")}: ${label}`}
      onSubmit={async (event) => {
        event.preventDefault();
        setValidation("");
        const parsed = practiceValueSchema.safeParse(value);
        if (!parsed.success) {
          setValidation(tr("Enter a valid practice score, feel and comment."));
          return;
        }
        const next = await save({
          ...parsed.data,
          ...target,
          action: "save_practice",
        });
        if (next !== undefined) {
          setVersion(next);
          setValue(parsed.data);
          setSaved(parsed.data);
          setStale(false);
          setExists(true);
        }
      }}
    >
      {stale && (
        <p className="notice small">
          {tr(
            "This map or its mod policy changed. Your previous record is shown below; enter a new record for the current map.",
          )}
        </p>
      )}
      <div className={styles.practiceRow}>
        <label className="field">
          <span className="sr-only">{tr("Practice score")}</span>
          <input
            className={
              !dirty && !stale && value.score !== null && value.score === best
                ? styles.bestScore
                : undefined
            }
            type="number"
            inputMode="numeric"
            min={0}
            max={Number.MAX_SAFE_INTEGER}
            step={1}
            placeholder={tr("Practice score")}
            value={value.score ?? ""}
            disabled={disabled}
            onChange={(event) =>
              setValue({
                ...value,
                score:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </label>
        <label className="field">
          <span className="sr-only">{tr("Feel")}</span>
          <select
            value={value.feel ?? ""}
            disabled={disabled}
            onChange={(event) =>
              setValue({
                ...value,
                feel: (event.target.value || null) as PracticeFeel | null,
              })
            }
          >
            <option value="">{tr("Feel")}</option>
            {practiceFeels.map((feel) => (
              <option key={feel} value={feel}>
                {feelLabels[feel]}
              </option>
            ))}
          </select>
        </label>
        <label className={`field ${styles.practiceComment}`}>
          <span className="sr-only">{tr("Practice comment")}</span>
          <textarea
            maxLength={2000}
            rows={1}
            placeholder={tr("Practice comment")}
            value={value.comment}
            disabled={disabled}
            onChange={(event) =>
              setValue({ ...value, comment: event.target.value })
            }
          />
        </label>
        {!data.readOnly && (
          <button
            className={styles.iconButton}
            type="submit"
            disabled={busy || !dirty}
            aria-label={busy ? tr("Saving…") : tr("Save practice")}
            title={busy ? tr("Saving…") : tr("Save practice")}
          >
            <SheetIcon kind="save" />
          </button>
        )}
        {exists && (
          <button
            type="button"
            className={`secondary ${styles.deleteButton}`}
            aria-label={tr("Delete practice record")}
            title={tr("Delete practice record")}
            disabled={busy}
            onClick={deleteRecord}
          >
            <SheetIcon kind="delete" />
          </button>
        )}
      </div>
      {dirty && (
        <span className={styles.draftMark} role="status">
          {tr("Unsaved changes")}
        </span>
      )}
      {feedback && (
        <p
          role={validation || failed ? "alert" : "status"}
          className={validation || failed ? "error-text small" : "muted small"}
        >
          {feedback}
        </p>
      )}
      {stale && own && (
        <details className={styles.previousRecord}>
          <summary>{tr("Previous map context")}</summary>
          <p>
            {own.score?.toLocaleString(tr.locale) ?? "—"}
            {own.feel ? ` · ${feelLabels[own.feel]}` : ""}
          </p>
          {own.comment && <PracticeComment comment={own.comment} />}
        </details>
      )}
    </form>
  );
  return (
    <tbody className={styles.practiceMap} aria-labelledby={`map-${entry.id}`}>
      <tr>
        <th scope="row" className={styles.mapColumn}>
          <div className={styles.mapArtwork} aria-hidden="true">
            <BeatmapCover setId={entry.metadata.setId} compact />
          </div>
          <div className={styles.mapHeading}>
            <div className={styles.mapTop}>
              <span className="badge">{label}</span>
              <div className={styles.mapTools}>
                <BeatmapActions
                  beatmapId={entry.beatmapId}
                  setId={entry.metadata.setId}
                  searchTitle={entry.metadata.title}
                  name={`${label} ${entry.metadata.title}`}
                  compact
                  showWeb={false}
                />
                <button
                  type="button"
                  className={`secondary ${styles.copyButton}`}
                  aria-label={`${tr("Copy beatmap ID")}: ${entry.beatmapId}`}
                  title={
                    copyState === "failed"
                      ? tr("Could not copy the beatmap ID.")
                      : tr("Copy beatmap ID")
                  }
                  data-copied={copyState === "copied"}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        String(entry.beatmapId),
                      );
                      setCopyState("copied");
                    } catch {
                      setCopyState("failed");
                    }
                  }}
                >
                  <span className={styles.copyValue} aria-hidden="true">
                    {entry.beatmapId}
                  </span>
                  <SheetIcon kind={copyState === "copied" ? "check" : "copy"} />
                </button>
              </div>
            </div>
            <div className={styles.identity}>
              <h2
                id={`map-${entry.id}`}
                title={`${entry.metadata.artist} — ${entry.metadata.title}`}
              >
                <a
                  href={links.web ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={tr("Open on osu!")}
                >
                  {entry.metadata.artist} — {entry.metadata.title}
                </a>
              </h2>
              <p
                className={styles.mapMetadata}
                title={`${entry.metadata.difficulty} · ${entry.metadata.mapper}`}
              >
                {entry.metadata.difficulty} · {entry.metadata.mapper}
              </p>
              {entry.category === "FM" && data.pool?.fmMode && (
                <p className="muted small">
                  {fmPolicyName(data.pool.fmMode)}
                  {data.pool.fmRestrictions
                    ? ` · ${data.pool.fmRestrictions}`
                    : ""}
                </p>
              )}
            </div>
            {copyState === "copied" && (
              <span className="sr-only" role="status">
                {tr("Copied")}
              </span>
            )}
            {copyState === "failed" && (
              <p className="error-text small" role="alert">
                {tr("Could not copy the beatmap ID.")}
              </p>
            )}
          </div>
        </th>
        {practiceParticipants(data).map((player) => {
          const record = visibleRecords.find(
            (value) => value.userId === player.osuId,
          );

          return (
            <td key={player.osuId} data-own={player.osuId === data.actorId}>
              {player.osuId === data.actorId && !data.readOnly ? (
                editor
              ) : record ? (
                <div className={styles.comparisonRecord}>
                  {record.stale && (
                    <span className="badge">{tr("Previous map context")}</span>
                  )}
                  <div className={styles.comparisonValues}>
                    <strong
                      className={
                        !record.stale &&
                        record.score !== null &&
                        record.score === best
                          ? styles.bestScore
                          : undefined
                      }
                    >
                      <span className="sr-only">{tr("Practice score")}: </span>
                      {record.score?.toLocaleString(tr.locale) ?? "—"}
                    </strong>

                    {record.feel && (
                      <span className={styles.feel}>
                        <span className="sr-only">{tr("Feel")}: </span>
                        {feelLabels[record.feel]}
                      </span>
                    )}
                  </div>
                  {record.comment && (
                    <PracticeComment comment={record.comment} />
                  )}
                </div>
              ) : (
                <span className={styles.noRecord} title={tr("Not submitted")}>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">{tr("Not submitted")}</span>
                </span>
              )}
            </td>
          );
        })}
      </tr>
    </tbody>
  );
}

export function PlayerPractice({
  slug,
  data,
}: {
  slug: string;
  data: PracticeWorkspace;
}) {
  const tr = useAppTranslations(),
    router = useRouter();
  const [dirtyIds, setDirtyIds] = useState<string[]>([]);
  const [onDirty] = useState(
    () => (id: string, dirty: boolean) =>
      setDirtyIds((ids) =>
        dirty
          ? ids.includes(id)
            ? ids
            : [...ids, id]
          : ids.filter((value) => value !== id),
      ),
  );
  const dirty = dirtyIds.length > 0;
  useUnsavedWorkspace(dirty);
  const proceed = () =>
    !dirty || window.confirm(tr("Discard your unsaved changes?"));
  const mods = categories.filter((category) =>
    data.pool?.entries.some((entry) => entry.category === category),
  );
  const [selectedMod, setSelectedMod] = useState<string>(mods[0] ?? "");
  const mod = mods.includes(selectedMod as (typeof mods)[number])
    ? selectedMod
    : mods[0];
  return (
    <div className={styles.workspace}>
      <div className={styles.practiceToolbar}>
        <div className={styles.poolTabs}>
          {data.pools.length ? (
            <PracticeTabs
              id="practice-pool-tab"
              label={tr("Published mappool")}
              items={data.pools.map((pool) => ({
                id: pool.id,
                label:
                  pool.roundName && pool.roundName !== pool.name
                    ? `${pool.roundName} · ${pool.name}`
                    : pool.name,
              }))}
              value={data.pool?.id ?? ""}
              panel={() => "practice-pool-panel"}
              onChange={(id) => {
                if (id !== data.pool?.id && proceed())
                  router.push(
                    `/tournaments/${slug}/player/practice?pool=${id}`,
                  );
              }}
            />
          ) : (
            <p className="muted small">{tr("No published mappools yet")}</p>
          )}
        </div>
        <button
          type="button"
          className={`secondary ${styles.reloadButton}`}
          aria-label={tr("Reload team records")}
          title={tr("Reload team records")}
          onClick={() => window.location.reload()}
        >
          <SheetIcon kind="reload" />
        </button>
      </div>
      <p className={`muted small ${styles.sharing}`}>
        {data.team
          ? tr("Shared with {value0}. Only you can edit your own records.", {
              value0: data.team.name,
            })
          : tr(
              "You can save practice before joining a team. Your records become visible to your team when assigned.",
            )}
      </p>
      {data.readOnly && (
        <p className="notice">{tr("This player workspace is read-only.")}</p>
      )}
      {data.pool?.entries.length ? (
        <section
          id="practice-pool-panel"
          role="tabpanel"
          aria-labelledby={`practice-pool-tab-${data.pool.id}`}
          className={styles.practicePool}
        >
          <PracticeTabs
            id="practice-mod-tab"
            label={tr("Mods")}
            items={mods.map((category) => ({ id: category, label: category }))}
            value={mod}
            panel={(category) => `practice-mod-panel-${category}`}
            onChange={setSelectedMod}
          />
          {mods.map((category) => (
            <div
              key={category}
              id={`practice-mod-panel-${category}`}
              role="tabpanel"
              aria-labelledby={`practice-mod-tab-${category}`}
              hidden={category !== mod}
              className={styles.modPanel}
            >
              <div
                className={styles.comparisonViewport}
                role="region"
                aria-label={`${tr("Team practice records")} · ${category}`}
                tabIndex={0}
              >
                <table
                  className={styles.comparisonTable}
                  style={{
                    minWidth: `calc(var(--practice-map-width) + var(--practice-own-width) + ${(data.participants.length - 1) * 13}rem)`,
                  }}
                >
                  <colgroup>
                    <col style={{ width: "var(--practice-map-width)" }} />
                    {practiceParticipants(data).map((player) => (
                      <col
                        key={player.osuId}
                        style={{
                          width:
                            player.osuId === data.actorId
                              ? "var(--practice-own-width)"
                              : "13rem",
                        }}
                      />
                    ))}
                  </colgroup>
                  <caption className="sr-only">
                    {tr("Team practice records")} · {category}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{tr("Beatmap")}</th>
                      {practiceParticipants(data).map((player) => (
                        <th
                          scope="col"
                          key={player.osuId}
                          data-own={player.osuId === data.actorId}
                        >
                          {player.username}
                          {player.osuId === data.actorId && (
                            <small>{tr("My practice")}</small>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  {data
                    .pool!.entries.filter(
                      (entry) => entry.category === category,
                    )
                    .map((entry) => (
                      <PracticeEntry
                        key={`${entry.id}-${entry.context}-${entry.ownVersion}`}
                        slug={slug}
                        data={data}
                        entry={entry}
                        onDirty={onDirty}
                      />
                    ))}
                </table>
              </div>
            </div>
          ))}
        </section>
      ) : (
        <EmptyState title={tr("No practice maps yet")}>
          {tr("Published mappool entries will appear here automatically.")}
        </EmptyState>
      )}
    </div>
  );
}
