"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { TimetableWorkspace } from "@/lib/player-workspace";
import { availabilityWrite } from "@/lib/player-workspace-contracts";
import {
  normalizeSeasonAvailability,
  seasonAvailabilitySchema,
  seasonIntervalLimit,
  type SeasonAvailabilityInterval,
} from "@/lib/player-workspace-model";
import { localDateTime, zonedInstants } from "@/lib/edition-time";
import {
  cellState,
  daySlots,
  nextCellState,
  paintAvailability,
  shiftDate,
  weekStart,
  selectableTimetableDate,
  type CellState,
} from "@/lib/player-timetable-model";
import { useUnsavedWorkspace, useWorkspaceSave } from "./player-workspace-save";
import styles from "./player-timetable.module.css";
import { SheetIcon } from "./sheet-icon";

const subscribe = () => () => {};
const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const symbols: Record<CellState, string> = {
  available: "✓",
  unsure: "?",
  unavailable: "×",
  unfilled: "·",
  mixed: "≋",
};
type Drag = {
  pointer: number;
  date: string;
  first: string;
  last: string;
  moved: boolean;
  base: SeasonAvailabilityInterval[];
  status: Exclude<CellState, "mixed">;
};

export function PlayerTimetable({
  slug,
  data,
}: {
  slug: string;
  data: TimetableWorkspace;
}) {
  const tr = useAppTranslations();
  const deviceZone = useSyncExternalStore(
    subscribe,
    localZone,
    () => data.timeZone,
  );
  const [utc, setUtc] = useState(false);
  const [weekView, setWeekView] = useState(false);
  const timeZone = utc ? "UTC" : deviceZone;
  const [anchor, setAnchor] = useState(
    () =>
      data.intervals[0]?.start ??
      data.teamAvailability.flatMap((p) => p.intervals)[0]?.start ??
      new Date().toISOString(),
  );
  const [intervals, setIntervals] = useState(() =>
    normalizeSeasonAvailability(data.intervals),
  );
  const [saved, setSaved] = useState(intervals);
  const [version, setVersion] = useState(data.version);
  const [history, setHistory] = useState<SeasonAvailabilityInterval[][]>([]);
  const [validation, setValidation] = useState("");
  const drag = useRef<Drag | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const weekDaysRef = useRef<HTMLDivElement>(null);
  const { save, busy, message, failed } = useWorkspaceSave(
    availabilityWrite,
    slug,
  );
  const dirty = JSON.stringify(intervals) !== JSON.stringify(saved);
  useUnsavedWorkspace(dirty);
  const disabled = !data.canEdit || busy;
  const feedback = validation || (failed || !dirty ? message : "");
  const startDate = weekStart(anchor, timeZone);
  const selectedDate = selectableTimetableDate(
    localDateTime(anchor, timeZone).slice(0, 10),
  );
  const dates = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i) => {
        const date = shiftDate(startDate, i);
        return { date, slots: daySlots(date, timeZone) };
      }),
    [startDate, timeZone],
  );
  useEffect(() => {
    const root = viewportRef.current;
    const strip = weekDaysRef.current;
    if (!root || !strip) return;
    const align = () => {
      const selected = strip?.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]',
      );
      if (strip && selected)
        strip.scrollLeft = weekView
          ? 0
          : selected.offsetLeft - strip.clientWidth + selected.clientWidth;
      const date = weekView ? startDate : selectedDate;
      const scrollInstant = weekView
        ? (zonedInstants(
            `${date}T${localDateTime(anchor, timeZone).slice(11, 16)}`,
            timeZone,
          )[0] ?? anchor)
        : anchor;
      const day = root?.querySelector<HTMLElement>(`[data-day="${date}"]`);
      if (!root || !day) return;
      root.scrollTop +=
        day.getBoundingClientRect().top - root.getBoundingClientRect().top;
      const columns = [
        ...day.querySelectorAll<HTMLElement>("thead th[data-start]"),
      ];
      const column = columns.reduce<HTMLElement | null>(
        (closest, value) =>
          !closest ||
          Math.abs(
            Date.parse(value.dataset.start!) - Date.parse(scrollInstant),
          ) <
            Math.abs(
              Date.parse(closest.dataset.start!) - Date.parse(scrollInstant),
            )
            ? value
            : closest,
        null,
      );
      if (column) {
        const width = column.getBoundingClientRect().width;
        const nameWidth =
          day.querySelector("thead th")?.getBoundingClientRect().width ?? 0;
        const desired =
          root.scrollLeft +
          column.getBoundingClientRect().left -
          root.getBoundingClientRect().left -
          nameWidth -
          width * 2;
        root.scrollLeft = Math.max(
          0,
          Math.floor(
            Math.min(root.scrollWidth - root.clientWidth, desired) / width,
          ) * width,
        );
      }
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(root);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [anchor, selectedDate, startDate, timeZone, weekView]);
  const visibleDates = weekView
    ? dates
    : dates.filter(({ date }) => date === selectedDate);
  const people = (
    data.teamAvailability.length
      ? data.teamAvailability
      : [{ userId: data.owner.osuId, username: data.owner.username, intervals }]
  ).map((person) =>
    person.userId === data.owner.osuId ? { ...person, intervals } : person,
  );
  const names: Record<CellState, string> = {
    available: tr("Available"),
    unsure: tr("Unsure"),
    unavailable: tr("Unavailable"),
    unfilled: tr("Not filled in"),
    mixed: tr("Partly filled or mixed states"),
  };
  const goToDate = (date: string) => {
    const instant = zonedInstants(
      `${selectableTimetableDate(date)}T12:00`,
      timeZone,
    )[0];
    if (instant) setAnchor(instant);
  };
  const commit = (next: SeasonAvailabilityInterval[], base = intervals) => {
    if (JSON.stringify(next) === JSON.stringify(base)) return;
    if (!seasonAvailabilitySchema.safeParse(next).success) {
      setIntervals(base);
      setValidation(tr("Choose valid availability time slots."));
      return;
    }
    setHistory((all) => [...all.slice(-49), base]);
    setIntervals(next);
    setValidation("");
  };
  const cancelDrag = () => {
    if (drag.current) setIntervals(drag.current.base);
    drag.current = null;
  };
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat(tr.locale, {
      timeZone: "UTC",
      dateStyle: "full",
    }).format(new Date(`${date}T12:00:00Z`));
  const instantLabel = (instant: string) =>
    new Intl.DateTimeFormat(tr.locale, {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(instant));
  return (
    <div className={styles.workspace}>
      <div className={styles.controls}>
        <div className={styles.dates}>
          <button
            type="button"
            className="secondary"
            aria-label={tr("Previous week")}
            title={tr("Previous week")}
            onClick={() => goToDate(shiftDate(selectedDate, -7))}
          >
            ‹
          </button>
          <label className="field">
            <span className="sr-only">{tr("Week containing")}</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                if (event.target.value) goToDate(event.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="secondary"
            aria-label={tr("Next week")}
            title={tr("Next week")}
            onClick={() => goToDate(shiftDate(selectedDate, 7))}
          >
            ›
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setAnchor(new Date().toISOString())}
          >
            {tr("Today")}
          </button>
        </div>
        <div className={styles.tools}>
          <fieldset className={styles.zone}>
            <legend className="sr-only">{tr("Time zone")}</legend>
            <label>
              <input
                type="radio"
                name="timetable-zone"
                checked={!utc}
                onChange={() => setUtc(false)}
              />
              {tr("Local time")}
            </label>
            <label>
              <input
                type="radio"
                name="timetable-zone"
                checked={utc}
                onChange={() => setUtc(true)}
              />
              {tr("UTC+0")}
            </label>
          </fieldset>
          <button
            type="button"
            className={`secondary ${styles.iconButton}`}
            aria-label={tr("Reload")}
            title={tr("Reload")}
            disabled={busy}
            onClick={() => window.location.reload()}
          >
            <SheetIcon kind="reload" />
          </button>
          <details
            className={styles.help}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary role="button" aria-label={tr("Notes")} title={tr("Notes")}>
              <SheetIcon kind="help" />
            </summary>
            <div role="note">
              <p>
                {data.teamAvailability.length
                  ? tr(
                      "Your team's availability is shown together. You can only edit your own time slots.",
                    )
                  : tr(
                      "Your timetable is visible to you and your current captain. Saved slots apply to the whole season.",
                    )}
              </p>
              <p id="timetable-help">
                {tr(
                  "Click a cell to cycle its state. Drag from a filled cell to copy its state. Scroll across the hours; use arrow keys and Space on your row.",
                )}
              </p>
            </div>
          </details>
        </div>
      </div>
      <div className={styles.context}>
        <span>{tr("Friday–Monday")}</span>
        <span>
          {startDate} — {shiftDate(startDate, 3)}
        </span>
        <span>{timeZone}</span>
      </div>
      {!data.canEdit && (
        <p className="notice">
          {data.owner.osuId !== data.actorId
            ? tr(
                "You can view this player's timetable. Only the player can edit it.",
              )
            : tr("This player workspace is read-only.")}
        </p>
      )}
      <div
        ref={weekDaysRef}
        className={styles.weekDays}
        role="group"
        aria-label={tr("Week")}
      >
        <button
          type="button"
          className="secondary"
          aria-pressed={weekView}
          onClick={() => setWeekView(true)}
        >
          {tr("Overview")}
        </button>
        {dates.map(({ date }) => (
          <button
            key={date}
            type="button"
            className="secondary"
            aria-label={dateLabel(date)}
            title={dateLabel(date)}
            aria-pressed={!weekView && selectedDate === date}
            onClick={() => {
              setWeekView(false);
              goToDate(date);
            }}
          >
            <span>
              {new Intl.DateTimeFormat(tr.locale, {
                timeZone: "UTC",
                weekday: "short",
              }).format(new Date(`${date}T12:00:00Z`))}
            </span>
            <strong>
              {new Intl.DateTimeFormat(tr.locale, {
                timeZone: "UTC",
                month: "numeric",
                day: "numeric",
              }).format(new Date(`${date}T12:00:00Z`))}
            </strong>
          </button>
        ))}
      </div>
      <div className={styles.editBar}>
        <div
          className={styles.legend}
          role="group"
          aria-label={tr("Availability states")}
        >
          {(["available", "unsure", "unavailable", "unfilled"] as const).map(
            (status) => (
              <span key={status}>
                <i data-state={status} aria-hidden="true">
                  {symbols[status]}
                </i>
                {names[status]}
              </span>
            ),
          )}
        </div>
        {data.canEdit && (
          <div className={styles.actions}>
            <button
              type="button"
              className={`secondary ${styles.iconButton}`}
              aria-label={tr("Undo")}
              title={tr("Undo")}
              disabled={busy || !history.length}
              onClick={() => {
                setIntervals(history.at(-1)!);
                setHistory(history.slice(0, -1));
                setValidation("");
              }}
            >
              <SheetIcon kind="undo" />
            </button>
            <button
              type="button"
              className={styles.saveButton}
              aria-label={busy ? tr("Saving…") : tr("Save season timetable")}
              title={tr("Save season timetable")}
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
                  setHistory([]);
                }
              }}
            >
              <SheetIcon kind="save" />
              <span>{busy ? tr("Saving…") : tr("Save")}</span>
            </button>
          </div>
        )}
      </div>
      {(dirty || feedback) && (
        <div className={styles.feedback} aria-live="polite">
          {dirty && (
            <span className={styles.draftMark}>{tr("Unsaved changes")}</span>
          )}
          {feedback && (
            <p
              role={validation || failed ? "alert" : "status"}
              className={
                validation || failed ? "error-text small" : "muted small"
              }
            >
              {feedback}
            </p>
          )}
        </div>
      )}
      <div
        ref={viewportRef}
        className={styles.viewport}
        role="region"
        aria-label={
          data.teamAvailability.length
            ? tr("Team availability")
            : tr("My availability")
        }
        tabIndex={0}
      >
        {visibleDates.map(({ date, slots }) => (
          <section
            key={`${date}-${timeZone}`}
            className={styles.day}
            data-day={date}
            aria-labelledby={`day-${date}`}
            onPointerDown={(event) => {
              if (
                disabled ||
                event.button !== 0 ||
                !(event.target instanceof Element)
              )
                return;
              const cell =
                event.target.closest<HTMLButtonElement>("button[data-slot]");
              if (!cell) return;
              const slot = slots[Number(cell.dataset.slot)];
              const state = cellState(intervals, slot.start, slot.end);
              drag.current = {
                pointer: event.pointerId,
                date,
                first: slot.start,
                last: slot.start,
                moved: false,
                base: intervals,
                status:
                  state === "mixed" || state === "unfilled"
                    ? "available"
                    : state,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const current = drag.current;
              if (!current || current.pointer !== event.pointerId) return;
              const cell = document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest<HTMLButtonElement>("button[data-slot]");
              if (!cell || cell.dataset.date !== current.date) return;
              const slot = slots[Number(cell.dataset.slot)];
              if (slot.start !== current.first) current.moved = true;
              if (!current.moved) return;
              current.last = slot.start;
              setIntervals(
                paintAvailability(
                  current.base,
                  slot.start < current.first ? slot.start : current.first,
                  slot.end > current.first
                    ? slot.end
                    : new Date(
                        Date.parse(current.first) + 30 * 60000,
                      ).toISOString(),
                  current.status,
                ),
              );
            }}
            onPointerUp={(event) => {
              const current = drag.current;
              if (!current || current.pointer !== event.pointerId) return;
              drag.current = null;
              const a =
                current.last < current.first ? current.last : current.first;
              const b = new Date(
                Date.parse(
                  current.last > current.first ? current.last : current.first,
                ) +
                  30 * 60000,
              ).toISOString();
              const status = current.moved
                ? current.status
                : nextCellState(cellState(current.base, a, b));
              commit(
                paintAvailability(current.base, a, b, status),
                current.base,
              );
            }}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={cancelDrag}
          >
            <h2 id={`day-${date}`} className={styles.dayHeading}>
              <span className={styles.dateTitle} title={dateLabel(date)}>
                {dateLabel(date)}
              </span>
              <span className={styles.offset}>
                {[...new Set(slots.map((slot) => slot.offset))].join(" → ")}
              </span>
            </h2>
            <table
              className={styles.table}
              style={{
                width: `calc(var(--timetable-name-width) + ${slots.length} * var(--timetable-cell-size))`,
              }}
            >
              <caption className="sr-only">
                {dateLabel(date)} · {timeZone}
              </caption>
              <colgroup>
                <col style={{ width: "var(--timetable-name-width)" }} />
                <col
                  span={slots.length}
                  style={{ width: "var(--timetable-cell-size)" }}
                />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">{tr("Player")}</th>
                  {slots.map((slot) => (
                    <th
                      key={slot.start}
                      scope="col"
                      data-start={slot.start}
                      title={`${slot.time} ${slot.offset}`}
                      aria-label={`${slot.time} ${slot.offset}`}
                      data-hour={slot.time.endsWith(":00")}
                    >
                      <span>{slot.time}</span>
                      {slots.filter((value) => value.time === slot.time)
                        .length > 1 && <small>{slot.offset}</small>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const states = slots.map((slot) =>
                    cellState(person.intervals, slot.start, slot.end),
                  );
                  return (
                    <tr
                      key={person.userId}
                      data-own={person.userId === data.owner.osuId}
                    >
                      <th scope="row">
                        <strong title={person.username}>
                          {person.username}
                        </strong>
                        {(person.userId === data.owner.osuId ||
                          !person.intervals.length) && (
                          <small>
                            {person.userId === data.owner.osuId &&
                              tr("My availability")}
                            {person.userId === data.owner.osuId &&
                              !person.intervals.length &&
                              " · "}
                            {!person.intervals.length && tr("Not submitted")}
                          </small>
                        )}
                      </th>
                      {slots.map((slot, index) => {
                        const state = states[index];
                        const showSymbol =
                          index === 0 ||
                          states[index - 1] !== state ||
                          slot.time.endsWith(":00");
                        const label = `${person.username} · ${date} · ${slot.time} ${slot.offset} · ${names[state]}`;
                        return (
                          <td
                            key={slot.start}
                            data-state={state}
                            data-hour={slot.time.endsWith(":00")}
                            data-run-start={
                              index === 0 || states[index - 1] !== state
                            }
                            title={label}
                          >
                            {person.userId === data.owner.osuId && !disabled ? (
                              <button
                                type="button"
                                data-slot={index}
                                data-date={date}
                                data-start={slot.start}
                                aria-label={label}
                                aria-describedby="timetable-help"
                                tabIndex={index === 0 ? 0 : -1}
                                onClick={(event) => {
                                  if (event.detail === 0)
                                    commit(
                                      paintAvailability(
                                        intervals,
                                        slot.start,
                                        slot.end,
                                        nextCellState(state),
                                      ),
                                    );
                                }}
                                onKeyDown={(event) => {
                                  const next =
                                    event.key === "ArrowRight"
                                      ? index + 1
                                      : event.key === "ArrowLeft"
                                        ? index - 1
                                        : event.key === "Home"
                                          ? 0
                                          : event.key === "End"
                                            ? slots.length - 1
                                            : null;
                                  if (next !== null) {
                                    event.preventDefault();
                                    event.currentTarget
                                      .closest("tr")
                                      ?.querySelector<HTMLButtonElement>(
                                        `button[data-slot="${Math.max(0, Math.min(slots.length - 1, next))}"]`,
                                      )
                                      ?.focus();
                                  }
                                }}
                              >
                                <span aria-hidden="true">
                                  {showSymbol && state !== "unfilled"
                                    ? symbols[state]
                                    : ""}
                                </span>
                              </button>
                            ) : (
                              <span
                                className={styles.readCell}
                                role="img"
                                aria-label={label}
                              >
                                {showSymbol && state !== "unfilled"
                                  ? symbols[state]
                                  : ""}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <details className={styles.savedRanges}>
        <summary>
          {tr("Season availability")} ·{" "}
          {tr("{value0} / {value1} time slots", {
            value0: intervals.length,
            value1: seasonIntervalLimit,
          })}
        </summary>
        {!intervals.length ? (
          <p className="muted small">
            {tr("No available time slots saved yet.")}
          </p>
        ) : (
          <ul>
            {intervals.map((slot, index) => (
              <li key={`${slot.start}-${slot.end}`}>
                <span>
                  <strong>{names[slot.status ?? "available"]}</strong> ·{" "}
                  {instantLabel(slot.start)} → {instantLabel(slot.end)}
                </span>
                {!disabled && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      commit(intervals.filter((_, i) => i !== index))
                    }
                  >
                    {tr("Remove")}
                    <span className="sr-only"> {instantLabel(slot.start)}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
