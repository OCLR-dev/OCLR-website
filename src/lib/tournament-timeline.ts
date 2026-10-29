import type { Edition } from "./editions";
import { formatDate } from "./editions";
import type { PlannedStage } from "./tournament-stages";

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
  const date = (at?: string | null) =>
    at ? formatDate(at, edition.timeZone, locale) : tr("TBA");
  const range = (at?: string | null, end?: string | null) =>
    `${tr("Start time")}: ${date(at)} · ${tr("End time")}: ${date(end)}`;
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
    const detail = event.kind ? range(event.at, event.endAt) : date(event.at);
    // Exact event identity only; authored labels are never interpreted as phase types.
    // Suppress repeated rows at render time without mutating stored milestones.
    if (
      rows.some(
        (row) =>
          row.event === event.label &&
          (row.date === detail ||
            (!event.kind &&
              row.at &&
              event.at &&
              Date.parse(row.at) === Date.parse(event.at))),
      )
    )
      return;
    rows.push({
      event: event.label,
      date: detail,
      at: event.at ?? event.endAt,
      order: event.kind === "group" ? 2 : event.kind === "knockout" ? 3 : 4,
    });
    stages.push({
      id: `schedule-${index}`,
      label: event.label,
      detail,
      at: event.at ?? undefined,
      endAt: event.endAt,
      interval: Boolean(event.kind),
      order: event.kind === "group" ? 2 : event.kind === "knockout" ? 3 : 4,
      authoritative: edition.status === "completed",
      href: `${base}/schedule`,
      action: tr("View schedule"),
    });
  });
  rows.sort(
    (a, b) =>
      (a.at ? Date.parse(a.at) : Infinity) -
        (b.at ? Date.parse(b.at) : Infinity) || a.order - b.order,
  );
  return { schedule: rows.map(({ event, date }) => ({ event, date })), stages };
}
