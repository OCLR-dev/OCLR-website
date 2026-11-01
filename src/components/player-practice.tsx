"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import type { PracticeWorkspace } from "@/lib/player-workspace";
import {
  practiceValueSchema,
  type PracticeValue,
} from "@/lib/player-workspace-model";
import { categories, slotLabel, fmPolicyName } from "@/lib/mappool-model";
import { BeatmapCover } from "./beatmap-cover";
import { BeatmapActions } from "./beatmap-actions";
import { EmptyState } from "./ui";
import { useUnsavedWorkspace, useWorkspaceSave } from "./player-workspace-save";
import styles from "./player-workspace.module.css";

type Entry = NonNullable<PracticeWorkspace["pool"]>["entries"][number];
const empty: PracticeValue = { score: null, rating: null, comment: "" };

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
      ? { score: own.score, rating: own.rating, comment: own.comment }
      : empty;
  const [value, setValue] = useState(initial),
    [saved, setSaved] = useState(initial);
  const [version, setVersion] = useState(entry.ownVersion);
  const [exists, setExists] = useState(Boolean(own));
  const [stale, setStale] = useState(Boolean(own?.stale));
  const [validation, setValidation] = useState("");
  const [ratingOpen, setRatingOpen] = useState(false);
  const ratingRoot = useRef<HTMLFieldSetElement>(null);
  const ratingToggle = useRef<HTMLButtonElement>(null);
  const { save, busy, message, failed } = useWorkspaceSave(
    `/api/tournaments/${slug}/player/practice`,
  );
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  useEffect(() => {
    if (!ratingOpen) return;
    const close = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !ratingRoot.current?.contains(event.target)
      )
        setRatingOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [ratingOpen]);
  const chooseRating = (rating: number | null) => {
    setValue({ ...value, rating });
    if (ratingOpen) {
      setRatingOpen(false);
      ratingToggle.current?.focus();
    }
  };
  useEffect(() => {
    onDirty(entry.id, dirty || busy);
    return () => onDirty(entry.id, false);
  }, [entry.id, dirty, busy, onDirty]);
  const label = slotLabel(entry.category, entry.position);
  const disabled = data.readOnly || busy;
  const players = new Map(
    data.participants.map((player) => [player.osuId, player.username]),
  );
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
        aria-label={`${tr("My practice")}: ${label}`}
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
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            />
          </label>
          <fieldset
            ref={ratingRoot}
            className={styles.rating}
            disabled={disabled}
            data-open={ratingOpen}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setRatingOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && ratingOpen) {
                event.preventDefault();
                setRatingOpen(false);
                ratingToggle.current?.focus();
              }
            }}
          >
            <legend className="sr-only">{tr("Practice rating")}</legend>
            <button
              ref={ratingToggle}
              type="button"
              className={`secondary ${styles.ratingToggle}`}
              aria-label={`${tr("Practice rating")}${value.rating === null ? "" : `: ${tr("{value0} out of 5 stars", { value0: value.rating })}`}`}
              title={tr("Practice rating")}
              aria-expanded={ratingOpen}
              aria-controls={`practice-rating-${entry.id}`}
              onClick={() => setRatingOpen(!ratingOpen)}
            >
              <span aria-hidden="true">
                {value.rating === null ? "☆" : `★ ${value.rating}`}
              </span>
            </button>
            <div className={styles.stars} id={`practice-rating-${entry.id}`}>
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
                    onChange={() => chooseRating(rating)}
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
                className={`secondary ${styles.iconButton}`}
                type="button"
                aria-label={tr("Clear rating")}
                title={tr("Clear rating")}
                disabled={disabled || value.rating === null}
                onClick={() => chooseRating(null)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="m6 6 12 12M6 18 18 6" />
                </svg>
              </button>
            </div>
          </fieldset>
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
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z" />
                <path d="M7 3v6h10V3M7 21v-8h10v8" />
              </svg>
            </button>
          )}
        </div>
        <span className="sr-only">{dirty ? tr("Unsaved changes") : ""}</span>
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
      <details open className={styles.teamRecords}>
        <summary>
          {tr("Team practice records")}{" "}
          <span className="muted small">({visibleRecords.length})</span>
        </summary>
        {visibleRecords.length ? (
          <ul>
            {visibleRecords.map((record) => (
              <li key={record.userId}>
                <div className={styles.recordHeading}>
                  <strong>{players.get(record.userId)}</strong>
                  {record.stale && (
                    <span className="badge">{tr("Previous map context")}</span>
                  )}
                  {record.userId === data.actorId && !data.readOnly && (
                    <button
                      type="button"
                      className="secondary destructive-action"
                      disabled={busy}
                      onClick={async () => {
                        if (!window.confirm(tr("Delete your practice record?")))
                          return;
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
                      }}
                    >
                      {tr("Delete practice record")}
                    </button>
                  )}
                </div>
                <dl className={styles.recordValues}>
                  <div>
                    <dt>{tr("Practice score")}</dt>
                    <dd>{record.score?.toLocaleString(tr.locale) ?? "—"}</dd>
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
        ) : (
          <p className="muted small">{tr("No practice records yet.")}</p>
        )}
      </details>
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
              {data
                .pool!.entries.filter((entry) => entry.category === category)
                .map((entry) => (
                  <PracticeEntry
                    key={`${entry.id}-${entry.context}-${entry.ownVersion}`}
                    slug={slug}
                    data={data}
                    entry={entry}
                    onDirty={onDirty}
                  />
                ))}
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
