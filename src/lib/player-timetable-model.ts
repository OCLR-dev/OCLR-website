import { localDateTime } from "./edition-time";
import {
  normalizeSeasonAvailability,
  type AvailabilityState,
  type SeasonAvailabilityInterval,
} from "./player-workspace-model";

export type CellState = AvailabilityState | "unfilled" | "mixed";
export const slotMilliseconds = 30 * 60 * 1000;
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function weekStart(instant: string, timeZone: string) {
  const date = localDateTime(instant, timeZone).slice(0, 10);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDate(date, -((weekday + 6) % 7));
}

const dayCache = new Map<string, ReturnType<typeof makeDaySlots>>();
function makeDaySlots(date: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "shortOffset",
  });
  const noon = Date.parse(`${date}T12:00:00Z`);
  const slots: { start: string; end: string; time: string; offset: string }[] =
    [];
  // Enumerate real instants, retaining both repeated hours and skipping missing
  // hours. Quarter-hour offsets (e.g. Kathmandu) retain :00/:30 wall times.
  for (
    let instant = noon - 30 * 3600000;
    instant < noon + 30 * 3600000;
    instant += 15 * 60000
  ) {
    const parts = formatter.formatToParts(instant);
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    if (
      `${part("year")}-${part("month")}-${part("day")}` !== date ||
      !["00", "30"].includes(part("minute"))
    )
      continue;
    slots.push({
      start: new Date(instant).toISOString(),
      end: new Date(instant + slotMilliseconds).toISOString(),
      time: `${part("hour")}:${part("minute")}`,
      offset: part("timeZoneName").replace("GMT", "UTC"),
    });
  }
  return slots;
}
export function daySlots(date: string, timeZone: string) {
  const key = `${date}|${timeZone}`;
  if (!dayCache.has(key)) {
    if (dayCache.size >= 128) dayCache.delete(dayCache.keys().next().value!);
    dayCache.set(key, makeDaySlots(date, timeZone));
  }
  return dayCache.get(key)!;
}

/** Partial old ranges remain intact until the user deliberately paints them. */
export function cellState(
  intervals: SeasonAvailabilityInterval[],
  start: string,
  end: string,
): CellState {
  const a = Date.parse(start),
    b = Date.parse(end);
  const ranges = intervals
    .filter((i) => Date.parse(i.start) < b && Date.parse(i.end) > a)
    .sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
  if (!ranges.length) return "unfilled";
  const states = new Set(ranges.map((i) => i.status ?? "available"));
  let covered = a;
  for (const range of ranges) {
    if (Date.parse(range.start) > covered) return "mixed";
    covered = Math.max(covered, Date.parse(range.end));
  }
  return states.size === 1 && covered >= b ? [...states][0] : "mixed";
}
export function nextCellState(state: CellState): Exclude<CellState, "mixed"> {
  return state === "available"
    ? "unsure"
    : state === "unsure"
      ? "unavailable"
      : state === "unavailable"
        ? "unfilled"
        : "available";
}
export function paintAvailability(
  intervals: SeasonAvailabilityInterval[],
  start: string,
  end: string,
  status: Exclude<CellState, "mixed">,
) {
  const a = Date.parse(start),
    b = Date.parse(end);
  const remaining = intervals.flatMap((interval) => {
    const x = Date.parse(interval.start),
      y = Date.parse(interval.end);
    if (y <= a || x >= b) return [interval];
    return [
      ...(x < a ? [{ ...interval, end: start }] : []),
      ...(y > b ? [{ ...interval, start: end }] : []),
    ];
  });
  if (status !== "unfilled")
    remaining.push({
      start,
      end,
      ...(status !== "available" ? { status } : {}),
    });
  return normalizeSeasonAvailability(remaining).reduce<
    SeasonAvailabilityInterval[]
  >((all, interval) => {
    const previous = all.at(-1);
    if (
      previous &&
      (previous.status ?? "available") === (interval.status ?? "available") &&
      Date.parse(interval.start) <= Date.parse(previous.end)
    ) {
      if (Date.parse(interval.end) > Date.parse(previous.end))
        previous.end = interval.end;
    } else all.push({ ...interval });
    return all;
  }, []);
}
