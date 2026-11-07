import type {
  BracketDisplay,
  BracketDisplayMatch,
  ResolvedMatch,
} from "./bracket-model";
import type { HistoricalArchive } from "./historical-archive";

const rounds = [
  {
    label: "SF",
    matches: [
      [21, "Winners bracket", "A1", "B2"],
      [22, "Winners bracket", "B1", "A2"],
      [23, "Losers bracket", "A3", "B4"],
      [24, "Losers bracket", "B3", "A4"],
    ],
  },
  {
    label: "Finals",
    matches: [
      [27, "Winners bracket final", [21, "winner"], [22, "winner"]],
      [26, "Losers bracket", [21, "loser"], [24, "winner"]],
      [25, "Losers bracket", [22, "loser"], [23, "winner"]],
    ],
  },
  {
    label: "Finals",
    matches: [[28, "Losers bracket", [25, "winner"], [26, "winner"]]],
  },
  {
    label: "Losers bracket final",
    matches: [[29, null, [27, "loser"], [28, "winner"]]],
  },
  {
    label: "Grand final",
    matches: [[30, null, [27, "winner"], [29, "winner"]]],
  },
] as const;

type Round = BracketDisplay["groups"][number]["rounds"][number];
type MatchInput = (typeof rounds)[number]["matches"][number][2 | 3];

/** The S10 workbook and rulebook establish the paths recorded in #997. */
export function s10KnockoutRounds(
  archive: HistoricalArchive,
  matches: ResolvedMatch[],
): Round[] | null {
  if (
    archive.editionSlug !== "s10" ||
    !/^https:\/\/docs\.google\.com\/spreadsheets\/d\/12BGS8WRnl10OdeUKyvmOypFzpTYCpHgx9QY1mw-0hlw(?:\/edit)?$/.test(
      archive.sourceUrl,
    ) ||
    matches.length !== 10
  )
    return null;

  const byId = new Map(matches.map((match) => [match.id, match]));
  function matchByNumber(number: number) {
    return byId.get(`match-${number}`);
  }
  function inputSlot(
    match: ResolvedMatch,
    input: MatchInput,
  ): BracketDisplayMatch["slots"][number] | null {
    if (typeof input === "string") {
      const standings = archive.standings.filter(
        (standing) => `${standing.group}${standing.rank}` === input,
      );
      if (standings.length !== 1) return null;
      const slot = match.slots.find((s) => s.teamId === standings[0].teamId);
      return slot ? { ...slot, sourceMatchId: null, groupSeed: input } : null;
    }

    const [number, kind] = input;
    const source = matchByNumber(number);
    if (!source || source.winnerSlot === null) return null;
    const position =
      kind === "winner" ? source.winnerSlot : 1 - source.winnerSlot;
    const slot = match.slots.find(
      (s) => s.teamId === source.slots[position].teamId,
    );
    return slot ? { ...slot, sourceMatchId: source.id, kind } : null;
  }

  const verified: Round[] = [];
  for (const [index, round] of rounds.entries()) {
    const verifiedMatches: BracketDisplayMatch[] = [];
    for (const [number, note, inputA, inputB] of round.matches) {
      const match = matchByNumber(number);
      if (!match || match.winnerSlot === null) return null;
      const a = inputSlot(match, inputA);
      const b = inputSlot(match, inputB);
      if (!a || !b || a.teamId === b.teamId) return null;
      verifiedMatches.push({
        ...match,
        note,
        slots: a.teamId === match.slots[0].teamId ? [a, b] : [b, a],
      });
    }
    verified.push({
      id: `round-${index}`,
      label: round.label,
      matches: verifiedMatches,
    });
  }
  return verified;
}
