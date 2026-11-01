"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { useAppTranslations } from "@/i18n/shared";
import type { TimetableWorkspace } from "@/lib/player-workspace";
import {
  normalizeSeasonAvailability,
  seasonAvailabilitySchema,
  seasonIntervalLimit,
} from "@/lib/player-workspace-model";
import { ZonedDateInput } from "./zoned-date-input";
import { useUnsavedWorkspace, useWorkspaceSave } from "./player-workspace-save";
import "./schedule.css";
import styles from "./player-workspace.module.css";
const Calendar = dynamic(() => import("./schedule-calendar"), { ssr: false });

export function PlayerTimetable({
  slug,
  data,
}: {
  slug: string;
  data: TimetableWorkspace;
}) {
  const tr = useAppTranslations();
  const [intervals, setIntervals] = useState(data.intervals);
  const [saved, setSaved] = useState(data.intervals);
  const [version, setVersion] = useState(data.version);
  const [start, setStart] = useState<string | null>(null),
    [end, setEnd] = useState<string | null>(null);
  const [startValid, setStartValid] = useState(false),
    [endValid, setEndValid] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [validation, setValidation] = useState("");
  const { save, busy, message, failed } = useWorkspaceSave(
    `/api/tournaments/${slug}/player/availability`,
  );
  const dirty = JSON.stringify(intervals) !== JSON.stringify(saved);
  useUnsavedWorkspace(dirty);
  const disabled = !data.canEdit || busy;
  const people = data.teamAvailability.map((person) =>
    person.userId === data.owner.osuId
      ? { ...person, intervals: saved }
      : person,
  );
  const teamView = people.length > 0;
  const teammates = people.filter(
    (person) => person.userId !== data.owner.osuId,
  );
  const time = (value: string) =>
    new Intl.DateTimeFormat(tr.locale, {
      timeZone: data.timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const clear = () => {
    setStart(null);
    setEnd(null);
    setStartValid(false);
    setEndValid(false);
    setEditing(null);
  };
  return (
    <div className={styles.workspace}>
      <div className={styles.toolbar}>
        <p className="muted small">{data.timeZone}</p>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => window.location.reload()}
        >
          {tr("Reload")}
        </button>
      </div>
      <p className="muted small">
        {teamView
          ? tr(
              "Your team's availability is shown together. You can only edit your own time slots.",
            )
          : tr(
              "Your timetable is visible to you and your current captain. Saved slots apply to the whole season.",
            )}
      </p>
      {!data.canEdit && (
        <p className="notice">
          {data.owner.osuId !== data.actorId
            ? tr(
                "You can view this player's timetable. Only the player can edit it.",
              )
            : tr("This player workspace is read-only.")}
        </p>
      )}
      {teamView && (
        <section
          aria-labelledby="team-availability-heading"
          className={styles.teamAvailability}
        >
          <h2 id="team-availability-heading">{tr("Team availability")}</h2>
          <ul>
            {people.map((person) => (
              <li
                key={person.userId}
                className={
                  person.userId === data.owner.osuId
                    ? styles.teamOwn
                    : undefined
                }
              >
                <strong>{person.username}</strong>
                {!person.intervals.length && (
                  <span className="small">{tr("Not submitted")}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Calendar
        timeZone={data.timeZone}
        official={null}
        initialDate={
          data.intervals[0]?.start ??
          teammates.flatMap((person) => person.intervals)[0]?.start
        }
        intervals={intervals}
        teammates={teammates}
        selection={
          startValid && endValid && start && end ? { start, end } : null
        }
        editingIndex={editing}
        summary={[]}
        editable={!disabled}
        availabilityLabel={
          teamView
            ? data.owner.username
            : data.owner.osuId === data.actorId
              ? tr("My availability")
              : tr("Player availability")
        }
        onSelect={(a, b) => {
          setStart(a);
          setEnd(b);
          setEditing(null);
          setStartValid(true);
          setEndValid(true);
        }}
      />
      {data.canEdit && (
        <form
          className={styles.slotEditor}
          onSubmit={(event) => {
            event.preventDefault();
            setValidation("");
            const next =
              editing === null
                ? [...intervals, { start: start ?? "", end: end ?? "" }]
                : intervals.map((slot, index) =>
                    index === editing
                      ? { start: start ?? "", end: end ?? "" }
                      : slot,
                  );
            const parsed = seasonAvailabilitySchema.safeParse(next);
            if (!startValid || !endValid || !parsed.success) {
              setValidation(tr("Choose valid availability time slots."));
              return;
            }
            setIntervals(normalizeSeasonAvailability(parsed.data));
            clear();
          }}
        >
          <h2>
            {editing === null ? tr("Add time slot") : tr("Edit time slot")}
          </h2>
          <p className="muted small">
            {tr(
              "Select a range on the calendar or use the date and time fields, then add the time slot.",
            )}
          </p>
          <fieldset disabled={disabled} className={styles.slotFields}>
            <ZonedDateInput
              label={tr("Available from")}
              value={start}
              timeZone={data.timeZone}
              onChange={setStart}
              onValidityChange={setStartValid}
              hideEmptyError
            />
            <ZonedDateInput
              label={tr("Available until")}
              value={end}
              timeZone={data.timeZone}
              onChange={setEnd}
              onValidityChange={setEndValid}
              hideEmptyError
            />
          </fieldset>
          <div className={styles.saveRow}>
            <button
              type="submit"
              className="secondary"
              disabled={
                disabled ||
                !startValid ||
                !endValid ||
                (editing === null && intervals.length >= seasonIntervalLimit)
              }
            >
              {editing === null ? tr("Add time slot") : tr("Update time slot")}
            </button>
            {(editing !== null || start !== null || end !== null) && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={clear}
              >
                {tr("Cancel")}
              </button>
            )}
            <span className="muted small">
              {tr("{value0} / {value1} time slots", {
                value0: intervals.length,
                value1: seasonIntervalLimit,
              })}
            </span>
          </div>
        </form>
      )}
      <section
        className={styles.slotList}
        aria-labelledby="season-slots-heading"
      >
        <h2 id="season-slots-heading">
          {teamView ? tr("My availability") : tr("Season availability")}
        </h2>
        {!intervals.length ? (
          <p className="muted">{tr("No available time slots saved yet.")}</p>
        ) : (
          <ul>
            {intervals.map((slot, index) => (
              <li key={`${slot.start}-${slot.end}`}>
                <span>
                  {time(slot.start)} <span aria-hidden="true">→</span>
                  <span className="sr-only">{tr("until")}</span>{" "}
                  {time(slot.end)}
                </span>
                {data.canEdit && (
                  <div className={styles.saveRow}>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditing(index);
                        setStart(slot.start);
                        setEnd(slot.end);
                        setStartValid(true);
                        setEndValid(true);
                      }}
                    >
                      {tr("Edit")}
                      <span className="sr-only"> {time(slot.start)}</span>
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setIntervals((values) =>
                          values.filter((_, i) => i !== index),
                        );
                        clear();
                      }}
                    >
                      {tr("Remove")}
                      <span className="sr-only"> {time(slot.start)}</span>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {data.canEdit && (
        <div className={styles.saveRow}>
          <button
            disabled={busy || !dirty}
            onClick={async () => {
              setValidation("");
              const next = await save({
                action: "save_availability",
                intervals,
                expectedVersion: version,
              });
              if (next !== undefined) {
                setVersion(next);
                setSaved(intervals);
              }
            }}
          >
            {busy ? tr("Saving…") : tr("Save season timetable")}
          </button>
          <span className="muted small">
            {dirty ? tr("Unsaved changes") : ""}
          </span>
        </div>
      )}
      {(validation || message) && (
        <p
          role={validation || failed ? "alert" : "status"}
          className={validation || failed ? "error-text" : "muted"}
        >
          {validation || message}
        </p>
      )}
    </div>
  );
}
