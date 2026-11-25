import {
  milestoneName,
  isMilestoneName,
  isSingleTimeMilestone,
} from "./milestone-names";
import type { Edition } from "./editions";
import { createUtcOffsetFormatter, formatDate } from "./editions";
import type { PlannedStage } from "./tournament-stages";

const phaseOrder = { draft: 2, group: 3, knockout: 4, exhibition: 5 };

export function scheduleTimeZoneLabel(
  timeZone: string,
  stages: PlannedStage[],
) {
  const formatOffset = createUtcOffsetFormatter(timeZone);
  let offset: string | undefined;
  for (const { at, endAt } of stages) {
    for (const value of [at, endAt]) {
      if (!value) continue;
      const next = formatOffset(value);
      if (offset !== undefined && offset !== next) return timeZone;
      offset = next;
    }
  }
  return offset ?? timeZone;
}

/** One presentation model for the overview's stage browser and schedule table. */
export function tournamentTimeline(
  edition: Pick<Edition, "slug" | "timeZone" | "schedule"> & {
    status?: Edition["status"];
  } & {
    registration: Pick<
      NonNullable<Edition["registration"]>,
      "opensAt" | "closesAt"
    > | null;
  },
  tr: (message: string) => string,
  locale: string,
) {
  const base = `/tournaments/${edition.slug}`;
  const date = (at?: string | null, precision?: "day" | "instant") =>
    at
      ? precision === "day"
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeZone: edition.timeZone,
          }).format(new Date(at))
        : formatDate(at, edition.timeZone, locale)
      : tr("TBA");
  const range = (
    at?: string | null,
    end?: string | null,
    precision?: "day" | "instant",
  ) =>
    `${tr("Start time")}: ${date(at, precision)} · ${tr("End time")}: ${date(end, precision)}`;
  const rows: {
    event: string;
    date: string;
    at?: string | null;
    order: number;
  }[] = [];
  const stages: PlannedStage[] = [];
  if (edition.registration) {
    const r = edition.registration;
    rows.push(
      {
        event: tr("Registration opens"),
        date: date(r.opensAt),
        at: r.opensAt,
        order: 0,
      },
      {
        event: tr("Registration closes"),
        date: date(r.closesAt),
        at: r.closesAt,
        order: 1,
      },
    );
    stages.push({
      id: "registration",
      label: tr("Registration phase"),
      detail: range(r.opensAt, r.closesAt),
      at: r.opensAt,
      endAt: r.closesAt,
      interval: true,
      authoritative: true,
      href: `${base}/register`,
      action: tr("View registration"),
    });
  }
  const registrationRows = rows.slice();
  const seenEventKeys = new Set<string>();
  edition.schedule.forEach((event, index) => {
    const label = isMilestoneName(event.kind, event.label)
      ? milestoneName(event.label, tr)
      : event.label;
    const order = event.kind ? phaseOrder[event.kind] : 6;
    const singleTime = isSingleTimeMilestone(event.kind);
    const interval = Boolean(event.kind && !singleTime);
    const endAt = interval ? event.endAt : undefined;
    const detail = interval
      ? range(event.at, event.endAt, event.precision)
      : date(event.at, singleTime ? "instant" : event.precision);
    const at = event.at ? Date.parse(event.at) : null;
    if (
      !event.kind &&
      at !== null &&
      registrationRows.some(
        (row) => row.event === label && row.at && Date.parse(row.at) === at,
      )
    )
      return;
    const key = JSON.stringify([
      event.kind,
      event.label,
      at,
      endAt ? Date.parse(endAt) : null,
      singleTime ? "instant" : (event.precision ?? "instant"),
    ]);
    if (seenEventKeys.has(key)) return;
    seenEventKeys.add(key);
    rows.push({
      event: label,
      date: detail,
      at: event.at ?? endAt,
      order,
    });
    stages.push({
      id: `schedule-${index}`,
      label,
      detail,
      at: event.at ?? undefined,
      endAt,
      interval,
      order,
      authoritative: edition.status === "completed",
      ...(event.kind === "draft"
        ? { href: `${base}/draft`, action: tr("Draft results") }
        : { href: `${base}/schedule`, action: tr("View schedule") }),
    });
  });
  rows.sort(
    (a, b) =>
      (a.at ? Date.parse(a.at) : Infinity) -
        (b.at ? Date.parse(b.at) : Infinity) || a.order - b.order,
  );
  return { schedule: rows.map(({ event, date }) => ({ event, date })), stages };
}
