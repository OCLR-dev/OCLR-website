import { zonedInstants } from "./edition-time";
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
  endDate,
  times,
  timeZone,
}: {
  groups: readonly Group[];
  existing: readonly ExistingMatch[];
  groupRoundIds: ReadonlySet<string>;
  roundId: string;
  startDate: string;
  endDate: string;
  times: readonly string[];
  timeZone: string;
}) {
  if (endDate < startDate)
    throw new HttpError(
      400,
      "The end date must be on or after the start date.",
    );

  const covered = new Set<string>();
  const reservedSlots = new Set<number>();
  let position = 0;
  for (const match of existing) {
    if (match.roundId === roundId)
      position = Math.max(position, match.position);
    if (match.status === "cancelled") continue;
    const { homeTeamId, awayTeamId, scheduledAt } = match;
    if (groupRoundIds.has(match.roundId) && homeTeamId && awayTeamId)
      covered.add(pairKey(homeTeamId, awayTeamId));
    if (scheduledAt)
      reservedSlots.add(Math.floor(scheduledAt.getTime() / 60_000));
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
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const orderedTimes = [...times].sort();
  for (
    let week = monday(start);
    week <= end && planned.length < pending.length;
    week += 7 * dayMs
  ) {
    for (const weekday of weekendDays) {
      const day = week + (weekday - 1) * dayMs;
      if (day < start || day > end) continue;
      const date = new Date(day).toISOString().slice(0, 10);
      for (const time of orderedTimes) {
        const match = pending[planned.length];
        if (!match) return planned;
        const [scheduledAt] = zonedInstants(`${date}T${time}`, timeZone);
        if (!scheduledAt || reservedSlots.has(Date.parse(scheduledAt) / 60_000))
          continue;
        planned.push({ ...match, scheduledAt, position: ++position });
      }
    }
  }
  if (planned.length < pending.length)
    throw new HttpError(
      400,
      "The date range has too few available weekend slots. Extend it or add match times.",
    );
  return planned;
}
