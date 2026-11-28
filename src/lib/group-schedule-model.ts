import { localDateTime, zonedInstants } from "./edition-time";
import { HttpError } from "./http-error";

export const defaultGroupScheduleTimes = ["20:00", "21:00", "22:00"] as const;
const weekendDays = [6, 7];

type Group = { name: string; teamIds: readonly string[] };
type Pairing = { group: string; homeTeamId: string; awayTeamId: string };
type ExistingMatch = {
  roundId: string;
  position: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  scheduledAt: Date | null;
  status: string;
};

function pairKey(a: string, b: string) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function roundRobin(group: Group) {
  if (group.teamIds.length < 2) return [];
  const rotation: (string | null)[] = [...group.teamIds];
  if (rotation.length % 2) rotation.push(null);
  return Array.from({ length: rotation.length - 1 }, () => {
    const pairs: Pairing[] = [];
    for (let i = 0; i < rotation.length / 2; i++) {
      const homeTeamId = rotation[i];
      const awayTeamId = rotation[rotation.length - i - 1];
      if (homeTeamId && awayTeamId)
        pairs.push({ group: group.name, homeTeamId, awayTeamId });
    }
    rotation.splice(1, 0, rotation.pop() ?? null);
    return pairs;
  });
}

const dayMs = 86_400_000;
function monday(date: number) {
  return date - ((new Date(date).getUTCDay() + 6) % 7) * dayMs;
}

export function planGroupSchedule({
  groups,
  existing,
  groupRoundIds,
  roundId,
  startDate,
  times,
  timeZone,
}: {
  groups: readonly Group[];
  existing: readonly ExistingMatch[];
  groupRoundIds: ReadonlySet<string>;
  roundId: string;
  startDate: string;
  times: readonly string[];
  timeZone: string;
}) {
  const covered = new Set<string>();
  const reservedSlots = new Set<number>();
  const busyByWeek = new Map<number, Set<string>>();
  let position = 0;
  for (const match of existing) {
    if (match.roundId === roundId)
      position = Math.max(position, match.position);
    if (match.status === "cancelled") continue;
    const { homeTeamId, awayTeamId, scheduledAt } = match;
    if (groupRoundIds.has(match.roundId) && homeTeamId && awayTeamId)
      covered.add(pairKey(homeTeamId, awayTeamId));
    if (!scheduledAt) continue;
    reservedSlots.add(Math.floor(scheduledAt.getTime() / 60_000));
    const localDay = localDateTime(scheduledAt.toISOString(), timeZone).slice(
      0,
      10,
    );
    const week = monday(Date.parse(`${localDay}T00:00:00Z`));
    const busy = busyByWeek.get(week) ?? new Set<string>();
    if (homeTeamId) busy.add(homeTeamId);
    if (awayTeamId) busy.add(awayTeamId);
    busyByWeek.set(week, busy);
  }

  const roundsByGroup = groups.map(roundRobin);
  const roundCount = Math.max(
    0,
    ...roundsByGroup.map((rounds) => rounds.length),
  );
  const pending = Array.from({ length: roundCount }, (_, round) =>
    roundsByGroup.flatMap((rounds) => rounds[round] ?? []),
  )
    .flat()
    .filter(
      ({ homeTeamId, awayTeamId }) =>
        !covered.has(pairKey(homeTeamId, awayTeamId)),
    );
  if (pending.length && position + pending.length > 999)
    throw new HttpError(
      400,
      "Choose a round with enough fixture positions for the group schedule.",
    );

  const planned: (Pairing & { scheduledAt: string; position: number })[] = [];
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const orderedTimes = [...times].sort();
  // Each non-blocked week can place at least one match. Allow for local clock changes.
  const maxWeeks = pending.length + busyByWeek.size + 2;
  for (let weekIndex = 0; pending.length && weekIndex < maxWeeks; weekIndex++) {
    const week = monday(start) + weekIndex * 7 * dayMs;
    const busy = busyByWeek.get(week) ?? new Set<string>();
    for (const weekday of weekendDays) {
      const day = week + (weekday - 1) * dayMs;
      if (day < start) continue;
      const date = new Date(day).toISOString().slice(0, 10);
      for (const time of orderedTimes) {
        const next = pending.findIndex(
          ({ homeTeamId, awayTeamId }) =>
            !busy.has(homeTeamId) && !busy.has(awayTeamId),
        );
        if (next < 0) break;
        const [scheduledAt] = zonedInstants(`${date}T${time}`, timeZone);
        if (!scheduledAt || reservedSlots.has(Date.parse(scheduledAt) / 60_000))
          continue;
        const [match] = pending.splice(next, 1);
        busy.add(match.homeTeamId);
        busy.add(match.awayTeamId);
        planned.push({ ...match, scheduledAt, position: ++position });
      }
    }
  }
  if (pending.length)
    throw new HttpError(
      400,
      "Choose different dates or time slots to fit the group schedule.",
    );
  return planned;
}
