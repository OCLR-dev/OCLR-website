import {
  milestoneName,
  isMilestoneName,
  isSingleTimeMilestone,
} from "./milestone-names";
import type { Edition } from "./editions";
import { formatDate } from "./editions";
import type { PlannedStage } from "./tournament-stages";

const phaseOrder = { draft: 2, group: 3, knockout: 4, exhibition: 5 };

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
    // Exact event identity only; authored labels are never interpreted as phase types.
    // Suppress repeated rows at render time without mutating stored milestones.
    if (
      rows.some(
        (row) =>
          row.event === label &&
          (row.date === detail ||
            (!event.kind &&
              row.at &&
              event.at &&
              Date.parse(row.at) === Date.parse(event.at))),
      )
    )
      return;
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
