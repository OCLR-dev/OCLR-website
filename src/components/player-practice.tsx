"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import type { PracticeWorkspace } from "@/lib/player-workspace";
import {
  practiceValueSchema,
  type PracticeValue,
} from "@/lib/player-workspace-model";
import { slotLabel, fmPolicyName } from "@/lib/mappool-model";
import { BeatmapCover } from "./beatmap-cover";
import { BeatmapActions } from "./beatmap-actions";
import { EmptyState } from "./ui";
import { useUnsavedWorkspace, useWorkspaceSave } from "./player-workspace-save";
import styles from "./player-workspace.module.css";

type Entry = NonNullable<PracticeWorkspace["pool"]>["entries"][number];
const empty: PracticeValue = {
  score: null,
  accuracy: null,
  rating: null,
  comment: "",
};
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
  const own = entry.records.find((record) => record.userId === data.actorId);
  const initial =
    own && !own.stale
      ? {
          score: own.score,
          accuracy: own.accuracy,
          rating: own.rating,
          comment: own.comment,
        }
      : empty;
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [version, setVersion] = useState(own?.version ?? 0);
  const [stale, setStale] = useState(Boolean(own?.stale));
  const [validation, setValidation] = useState("");
  const { save, busy, message, failed } = useWorkspaceSave(
    `/api/tournaments/${slug}/player/practice`,
  );
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  useEffect(() => {
    onDirty(entry.id, dirty);
    return () => onDirty(entry.id, false);
  }, [entry.id, dirty, onDirty]);
  const label = slotLabel(entry.category, entry.position);
  const disabled = data.readOnly || busy;
  const players = new Map(
    data.participants.map((player) => [player.osuId, player.username]),
  );
  const visibleRecords =
    version > 0 && !stale
      ? [
          ...entry.records.filter((record) => record.userId !== data.actorId),
          { ...saved, userId: data.actorId, version, stale: false },
        ]
      : entry.records;
  const field = (key: "score" | "accuracy", text: string) => (
    <label className="field">
      <span>{text}</span>
      <input
        type="number"
        inputMode={key === "score" ? "numeric" : "decimal"}
        min={0}
        max={key === "accuracy" ? 100 : Number.MAX_SAFE_INTEGER}
        step={key === "score" ? 1 : "any"}
        value={value[key] ?? ""}
        disabled={disabled}
        onChange={(event) =>
          setValue({
            ...value,
            [key]:
              event.target.value === "" ? null : Number(event.target.value),
          })
        }
      />
    </label>
  );
  return (
    <article className={styles.map} aria-labelledby={`map-${entry.id}`}>
      <header className={styles.mapHeading}>
        <BeatmapCover setId={entry.metadata.setId} compact />
        <div className={styles.identity}>
          <span className="badge">{label}</span>
          <h2 id={`map-${entry.id}`}>
            {entry.metadata.artist} — {entry.metadata.title}
          </h2>
          <p className="muted small">
            {entry.metadata.difficulty} · {entry.metadata.mapper}
          </p>
          {entry.category === "FM" && data.pool?.fmMode && (
            <p className="muted small">
              {fmPolicyName(data.pool.fmMode)}
              {data.pool.fmRestrictions ? ` · ${data.pool.fmRestrictions}` : ""}
            </p>
          )}
        </div>
        <BeatmapActions
          beatmapId={entry.beatmapId}
          setId={entry.metadata.setId}
          name={`${label} ${entry.metadata.title}`}
          compact
        />
      </header>
      <form
        className={styles.practiceForm}
        onSubmit={async (event) => {
          event.preventDefault();
          setValidation("");
          const parsed = practiceValueSchema.safeParse(value);
          if (!parsed.success) {
            setValidation(
              tr("Enter a valid practice score, rating and comment."),
            );
            return;
          }
          const next = await save({
            ...parsed.data,
            action: "save_practice",
            entryId: entry.id,
            expectedContext: entry.context,
            expectedVersion: version,
          });
          if (next !== undefined) {
            setVersion(next);
            setValue(parsed.data);
            setSaved(parsed.data);
            setStale(false);
          }
        }}
      >
        <div className={styles.formHeading}>
          <h3>{tr("My practice")}</h3>
          <span className="muted small">
            {tr("Visible to your current team")}
          </span>
        </div>
        {stale && (
          <p className="notice small">
            {tr(
              "This map or its mod policy changed. Your previous record is shown below; enter a new record for the current map.",
            )}
          </p>
        )}
        <div className={styles.scoreFields}>
          {field("score", tr("Practice score"))}
          {field("accuracy", tr("Accuracy (%)"))}
        </div>
        <fieldset className={styles.rating} disabled={disabled}>
          <legend>{tr("Practice rating")}</legend>
          <div className={styles.stars}>
            {[1, 2, 3, 4, 5].map((rating) => (
              <label
                key={rating}
                title={tr("{value0} out of 5 stars", { value0: rating })}
              >
                <input
                  type="radio"
                  name={`rating-${entry.id}`}
                  value={rating}
                  checked={value.rating === rating}
                  onChange={() => setValue({ ...value, rating })}
                />
                <span
                  className={
                    value.rating !== null && rating <= value.rating
                      ? styles.starSelected
                      : undefined
                  }
                  aria-hidden="true"
                >
                  ★
                </span>
                <span className="sr-only">
                  {tr("{value0} out of 5 stars", { value0: rating })}
                </span>
              </label>
            ))}
            <button
              className="secondary"
              type="button"
              disabled={disabled || value.rating === null}
              onClick={() => setValue({ ...value, rating: null })}
            >
              {tr("Clear rating")}
            </button>
          </div>
        </fieldset>
        <label className="field">
          <span>{tr("Practice comment")}</span>
          <textarea
            maxLength={2000}
            rows={2}
            value={value.comment}
            disabled={disabled}
            onChange={(event) =>
              setValue({ ...value, comment: event.target.value })
            }
          />
        </label>
        {!data.readOnly && (
          <div className={styles.saveRow}>
            <button type="submit" disabled={busy || !dirty}>
              {busy ? tr("Saving…") : tr("Save practice")}
            </button>
            <span className="muted small">
              {dirty ? tr("Unsaved changes") : ""}
            </span>
          </div>
        )}
        {(validation || message) && (
          <p
            role={validation || failed ? "alert" : "status"}
            className={
              validation || failed ? "error-text small" : "muted small"
            }
          >
            {validation || message}
          </p>
        )}
      </form>
      {visibleRecords.length > 0 && (
        <details className={styles.teamRecords}>
          <summary>
            {tr("Team practice records")}{" "}
            <span className="muted small">({visibleRecords.length})</span>
          </summary>
          <ul>
            {visibleRecords.map((record) => (
              <li key={record.userId}>
                <div className={styles.recordHeading}>
                  <strong>{players.get(record.userId)}</strong>
                  {record.stale && (
                    <span className="badge">{tr("Previous map context")}</span>
                  )}
                </div>
                <dl className={styles.recordValues}>
                  <div>
                    <dt>{tr("Practice score")}</dt>
                    <dd>{record.score?.toLocaleString(tr.locale) ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{tr("Accuracy (%)")}</dt>
                    <dd>{record.accuracy ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{tr("Practice rating")}</dt>
                    <dd>
                      {record.rating === null ? "—" : `${record.rating}/5`}
                    </dd>
                  </div>
                </dl>
                {record.comment && (
                  <p className={styles.comment}>{record.comment}</p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
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
  return (
    <div className={styles.workspace}>
      <div className={styles.toolbar}>
        <label className="field">
          <span>{tr("Published mappool")}</span>
          <select
            value={data.pool?.id ?? ""}
            disabled={!data.pools.length}
            onChange={(event) => {
              if (proceed())
                router.push(
                  `/tournaments/${slug}/player/practice?pool=${event.target.value}`,
                );
            }}
          >
            {!data.pools.length && (
              <option value="">{tr("No published mappools yet")}</option>
            )}
            {data.pools.map((pool) => (
              <option value={pool.id} key={pool.id}>
                {pool.roundName ? `${pool.roundName} · ` : ""}
                {pool.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => window.location.reload()}
        >
          {tr("Reload team records")}
        </button>
      </div>
      <p className="muted small">
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
        data.pool.entries.map((entry) => (
          <PracticeEntry
            key={`${entry.id}-${entry.context}-${entry.records.find((record) => record.userId === data.actorId)?.version ?? 0}`}
            slug={slug}
            data={data}
            entry={entry}
            onDirty={onDirty}
          />
        ))
      ) : (
        <EmptyState title={tr("No practice maps yet")}>
          {tr("Published mappool entries will appear here automatically.")}
        </EmptyState>
      )}
    </div>
  );
}
