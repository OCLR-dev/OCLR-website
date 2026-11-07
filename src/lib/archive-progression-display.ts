import type { HistoricalBracketPlan } from "./archive-progression";
import type {
  BracketDisplay,
  BracketDisplayMatch,
  ResolvedMatch,
} from "./bracket-model";
import type { HistoricalArchive } from "./historical-archive";

type MatchPath = BracketDisplay["groups"][number];
type Round = MatchPath["rounds"][number];

function workbook(url: string) {
  return url.replace(/\/edit$/, "");
}

export function verifiedHistoricalRounds(
  archive: HistoricalArchive,
  matches: ResolvedMatch[],
  plan: HistoricalBracketPlan,
): Round[] | null {
  const { bracket, advancements } = plan;
  if (
    bracket.editionSlug !== archive.editionSlug ||
    bracket.sourceUrl !== workbook(archive.sourceUrl) ||
    bracket.matchCount !== matches.length ||
    bracket.matchCount !== plan.matches.length ||
    bracket.advancementCount !== advancements.length
  )
    return null;

  const saved = new Map(matches.map((m) => [m.id, m]));
  const stages = new Map(archive.matches.map((m) => [m.id, m.stage]));
  const finals = plan.matches.filter((m) => m.lane === "grand-final");
  if (finals.length !== 1) return null;
  const finalId = finals[0].fixtureId;
  const finalists = new Set(
    advancements
      .filter(
        (edge) => edge.targetFixtureId === finalId && edge.outcome === "winner",
      )
      .map((edge) => edge.sourceFixtureId),
  );
  if (finalists.size !== 2) return null;
  const resolved = new Map<
    string,
    { match: BracketDisplayMatch; column: number }
  >();
  const columns: (typeof plan.matches)[] = [];

  // Database positions put every predecessor before its targets. Each slot
  // still has to agree with the winner or loser in the current saved archive.
  for (const item of plan.matches) {
    const match = saved.get(item.fixtureId);
    if (
      !match ||
      match.winnerSlot !== item.winnerSlot ||
      match.slots[0].teamId !== item.teamA ||
      match.slots[1].teamId !== item.teamB
    )
      return null;

    let column = 0;
    const slots: BracketDisplayMatch["slots"] = [
      {
        ...match.slots[0],
        sourceMatchId: null,
        ...(item.seedA && { groupSeed: item.seedA }),
      },
      {
        ...match.slots[1],
        sourceMatchId: null,
        ...(item.seedB && { groupSeed: item.seedB }),
      },
    ];
    for (const slot of slots) {
      if (!slot.groupSeed) continue;
      const group = slot.groupSeed.slice(0, 1);
      const ranks = archive.standings.filter(
        (s) => s.group === group && s.rank !== null,
      );
      if (!ranks.length) continue;
      const standing = ranks.filter(
        (s) => `${group}${s.rank}` === slot.groupSeed,
      );
      if (standing.length !== 1 || standing[0].teamId !== slot.teamId)
        return null;
    }
    for (const edge of advancements.filter(
      (e) => e.targetFixtureId === item.fixtureId,
    )) {
      const source = resolved.get(edge.sourceFixtureId);
      if (!source || edge.sourceFixtureId === finalId) return null;
      const winner = source.match.winnerSlot!;
      const index = edge.outcome === "winner" ? winner : 1 - winner;
      const slot = slots[edge.targetSlot];
      if (slot.groupSeed || source.match.slots[index].teamId !== slot.teamId)
        return null;
      slots[edge.targetSlot] = {
        ...slot,
        sourceMatchId: source.match.id,
        kind: edge.outcome,
      };
      column = Math.max(column, source.column + 1);
    }
    const note =
      item.lane === "grand-final" ||
      (item.lane === "lower" && finalists.has(item.fixtureId))
        ? null
        : item.lane === "lower"
          ? "Losers bracket"
          : finalists.has(item.fixtureId)
            ? "Winners bracket final"
            : "Winners bracket";
    resolved.set(item.fixtureId, { column, match: { ...match, slots, note } });
    (columns[column] ??= []).push(item);
  }

  return columns.map((items, index) => {
    const stagesInColumn = new Set(items.map((m) => stages.get(m.fixtureId)!));
    const label = items.some((m) => m.lane === "grand-final")
      ? "Grand final"
      : items.some((m) => m.lane === "lower" && finalists.has(m.fixtureId))
        ? "Losers bracket final"
        : stagesInColumn.size === 1
          ? [...stagesInColumn][0]
          : `Round ${index + 1}`;
    return {
      id: `round-${index}`,
      label,
      matches: [
        ...items.filter((m) => m.lane === "upper"),
        ...items.filter((m) => m.lane !== "upper"),
      ].map((m) => resolved.get(m.fixtureId)!.match),
    };
  });
}

/** Join the backend bracket to the same saved results used by the remote schedule. */
export function sameHistoricalMatches(current: MatchPath, incoming: MatchPath) {
  const saved = new Map(
    current.rounds.flatMap((round) => round.matches).map((m) => [m.id, m]),
  );
  const matches = incoming.rounds.flatMap((round) => round.matches);
  return (
    matches.length === saved.size &&
    new Set(matches.map((m) => m.id)).size === saved.size &&
    matches.every((match) => {
      const m = saved.get(match.id);
      return (
        m &&
        match.winnerSlot === m.winnerSlot &&
        match.slots.every(
          (slot, i) =>
            slot.teamId === m.slots[i].teamId &&
            match.scores[i] === m.scores[i],
        )
      );
    })
  );
}
