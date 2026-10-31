import { z } from "zod";
import content from "@/content/season-timeline.json" with { type: "json" };
import { seasonAppearances, type SeasonAppearance } from "./preferences";

/**
 * Player profile timeline model.
 *
 * The axis always starts at osu!'s release month (July 2007) and ends at the
 * request time, so every mark and period is placed on one absolute scale. Season
 * windows come from the organizer-editable `src/content/season-timeline.json`;
 * until a season has both bounds, a player who played it falls back to the span
 * of their own recorded matches and the span is flagged as inferred.
 */

const DAY = 86_400_000;
/** 2007-07-01T00:00:00Z, the month osu! launched. */
export const timelineOrigin = Date.UTC(2007, 6, 1);

/**
 * Narrow screens squeeze nineteen years into ~350px, where every season after
 * 2018 shares the last third of the bar. The log scale is anchored at the right
 * edge, so equal visual steps mean equal "time before now": recent seasons
 * spread out and the early years give the space back.
 */
export const timelineLogPivot = 180 * DAY;

/** Position of `at` on a linear axis between `start` and `end`. */
export function axisFraction(at: number, start: number, end: number): number {
  const distance = end - start;
  if (!Number.isFinite(at) || !(distance > 0)) return 0;
  return Math.min(1, Math.max(0, (at - start) / distance));
}

/** Position of `at` on the log axis, anchored at `end` and clamped to `start`. */
export function logAxisFraction(
  at: number,
  start: number,
  end: number,
  pivot: number = timelineLogPivot,
): number {
  const distance = end - start;
  if (!Number.isFinite(at) || !(distance > 0)) return 0;
  const before = Math.max(0, end - at) / pivot;
  return Math.min(
    1,
    Math.max(0, 1 - Math.log1p(before) / Math.log1p(distance / pivot)),
  );
}

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const zonedTime = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** A `YYYY-MM-DD` bound covers that whole UTC day; an instant must carry a zone. */
function boundary(value: string | null | undefined, edge: "start" | "end") {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const iso = dateOnly.test(text)
    ? `${text}T${edge === "end" ? "23:59:59.999" : "00:00:00.000"}Z`
    : zonedTime.test(text)
      ? text
      : null;
  if (iso === null) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

const recordSchema = z.object({
  season: z.number().int().min(1).max(99),
  appearance: z.enum(seasonAppearances).nullish().catch(null),
  start: z.string().nullish().catch(null),
  end: z.string().nullish().catch(null),
});

export type SeasonWindow = {
  season: number;
  appearance: SeasonAppearance | null;
  /** ISO instant, or null while the organizer has not fixed that bound. */
  start: string | null;
  end: string | null;
};

/** Read the editable season file leniently: one bad row never hides the rest. */
export function readSeasonWindows(raw: unknown): SeasonWindow[] {
  const file = z.object({ seasons: z.array(z.unknown()) }).safeParse(raw);
  if (!file.success) return [];
  const windows: SeasonWindow[] = [];
  const seen = new Set<number>();
  for (const item of file.data.seasons) {
    const record = recordSchema.safeParse(item);
    if (!record.success || seen.has(record.data.season)) continue;
    seen.add(record.data.season);
    windows.push({
      season: record.data.season,
      appearance: record.data.appearance ?? null,
      start: boundary(record.data.start, "start"),
      end: boundary(record.data.end, "end"),
    });
  }
  return windows;
}

/** Stored season values are inconsistent ("10", "S9", " 3 "). */
export function seasonNumber(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === "number")
    return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const match = /^(?:s|season)?\s*0*(\d{1,3})$/i.exec(value.trim());
  if (!match) return null;
  const season = Number(match[1]);
  return season > 0 ? season : null;
}

export type TimelineMarkKind = "joined" | "lastSeen" | "updated";

export type TimelineMark = { kind: TimelineMarkKind; at: string };

export type TimelineSpan = {
  key: string;
  season: number;
  /** Registered theme of that season, when the file names one. */
  appearance: SeasonAppearance | null;
  /** Authored edition name, when the player took part in that edition. */
  editionName: string | null;
  /** Published edition of that season, so the span can open its page. */
  editionSlug: string | null;
  start: string;
  end: string;
  /** A single confirmed instant (an open season window) instead of a range. */
  point: boolean;
  /** Derived from recorded match dates because the season window is unknown. */
  provisional: boolean;
  participated: boolean;
};

export type PlayerTimeline = {
  start: string;
  end: string;
  marks: TimelineMark[];
  spans: TimelineSpan[];
};

export type TimelineEdition = {
  editionSlug: string;
  editionName: string;
  season: string | null;
  matches: readonly { at: string | null }[];
};

/** Any published edition, used to link seasons the player did not enter. */
export type TimelineEditionRef = {
  season: string | number | null;
  slug: string;
};

const configuredWindows = readSeasonWindows(content);

function instant(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** First and last recorded match of a season, when it has any dated match. */
function recordedMatches(editions: readonly TimelineEdition[]) {
  let first = Infinity;
  let last = -Infinity;
  for (const edition of editions)
    for (const match of edition.matches) {
      const at = instant(match.at);
      if (at === null) continue;
      first = Math.min(first, at);
      last = Math.max(last, at);
    }
  return Number.isFinite(first) && first <= last ? { first, last } : null;
}

export function buildPlayerTimeline({
  editions,
  editionPool = [],
  joinedAt,
  lastSeenAt,
  updatedAt,
  now = new Date(),
  windows = configuredWindows,
}: {
  editions: readonly TimelineEdition[];
  editionPool?: readonly TimelineEditionRef[];
  joinedAt?: string | null;
  lastSeenAt?: string | null;
  updatedAt?: string | null;
  now?: Date;
  windows?: readonly SeasonWindow[];
}): PlayerTimeline {
  const end = Math.max(timelineOrigin + DAY, now.getTime());

  const publishedSlug = new Map<number, string>();
  for (const edition of editionPool) {
    const season = seasonNumber(edition.season);
    if (season !== null && !publishedSlug.has(season))
      publishedSlug.set(season, edition.slug);
  }

  const bySeason = new Map<number, TimelineEdition[]>();
  for (const edition of editions) {
    const season = seasonNumber(edition.season);
    if (season === null) continue;
    const list = bySeason.get(season) ?? [];
    list.push(edition);
    bySeason.set(season, list);
  }

  const spans: TimelineSpan[] = [];
  const covered = new Set<number>();
  for (const window of windows) {
    covered.add(window.season);
    const participants = bySeason.get(window.season) ?? [];
    const participated = participants.length > 0;
    const start = instant(window.start);
    const finish = instant(window.end);
    const editionName = participants[0]?.editionName ?? null;
    const editionSlug =
      participants[0]?.editionSlug ?? publishedSlug.get(window.season) ?? null;
    const base = {
      key: `season-${window.season}`,
      season: window.season,
      appearance: window.appearance,
      editionName,
      editionSlug,
      participated,
    };
    if (start !== null && finish !== null && finish > start) {
      spans.push({
        ...base,
        start: new Date(start).toISOString(),
        end: new Date(finish).toISOString(),
        point: false,
        provisional: false,
      });
      continue;
    }
    // One confirmed bound is still a real date: draw it as a dated point.
    const single = start ?? finish;
    if (single !== null) {
      const at = new Date(single).toISOString();
      spans.push({
        ...base,
        start: at,
        end: at,
        point: true,
        provisional: false,
      });
      continue;
    }
    if (!participated) continue;
    const recorded = recordedMatches(participants);
    if (recorded === null) continue;
    spans.push({
      ...base,
      start: new Date(recorded.first).toISOString(),
      end: new Date(recorded.last).toISOString(),
      point: false,
      provisional: true,
    });
  }
  // A played season the file does not list yet still deserves its recorded span.
  for (const [season, participants] of bySeason) {
    if (covered.has(season)) continue;
    const recorded = recordedMatches(participants);
    if (recorded === null) continue;
    const editionSlug =
      participants[0]?.editionSlug ?? publishedSlug.get(season) ?? null;
    spans.push({
      key: `season-${season}`,
      season,
      appearance: null,
      editionName: participants[0]?.editionName ?? null,
      editionSlug,
      start: new Date(recorded.first).toISOString(),
      end: new Date(recorded.last).toISOString(),
      point: false,
      provisional: true,
      participated: true,
    });
  }
  spans.sort(
    (left, right) =>
      Date.parse(left.start) - Date.parse(right.start) ||
      left.season - right.season,
  );

  const marks: TimelineMark[] = [];
  for (const [kind, value] of [
    ["joined", joinedAt],
    ["lastSeen", lastSeenAt],
    ["updated", updatedAt],
  ] as const) {
    const at = instant(value);
    if (at !== null) marks.push({ kind, at: new Date(at).toISOString() });
  }

  return {
    start: new Date(timelineOrigin).toISOString(),
    end: new Date(end).toISOString(),
    marks,
    spans,
  };
}
