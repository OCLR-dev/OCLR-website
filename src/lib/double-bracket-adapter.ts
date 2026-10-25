import type { Match } from "@cm3tahkuh/react-tournament-brackets/dist/src/types";
import type { ResolvedBracket, ResolvedMatch } from "./bracket-model";
import { bracketRouting } from "./bracket-routing";

export type LibraryMatch = Match & { original: ResolvedMatch; stage: string };
/** Converts existing sources only; never generates matches, seeds or results.
 * A historical source is still only an appearance reference in this view. */
export function doubleBracketMatches(group: ResolvedBracket["groups"][number]) {
  const matches = group.rounds.flatMap((r) =>
    r.matches.map((m): LibraryMatch => ({
      id: m.id,
      name: m.label,
      original: m,
      stage: r.label,
      nextMatchId: null,
      startTime: "",
      state: m.status === "completed" ? "DONE" : "NO_PARTY",
      participants: m.slots.map((slot, index) => ({
        id: slot.teamId ?? `${m.id}-${index}`,
        name: slot.label,
        resultText: m.scores[index]?.toString() ?? "—",
        isWinner: m.winnerSlot === index,
        status: slot.teamId ? "PLAYED" : "NO_PARTY",
        originalSlot: index,
      })),
    })),
  );
  const all = new Map(matches.map((m) => [m.id, m]));
  const edges = bracketRouting(group, true).edges;
  const upper = new Set<string | number>();
  const lower = new Set<string | number>();
  for (const m of matches) {
    if (/敗者|败者|loser/i.test(m.stage)) lower.add(m.id);
    if (/勝者|胜者|winner|總決賽|总决赛|grand final/i.test(m.stage))
      upper.add(m.id);
  }
  for (const edge of edges) {
    const source = all.get(edge.sourceId)!;
    const outcome =
      edge.kind === "appearance"
        ? source.original.winnerSlot === null
          ? null
          : edge.sourceSlot === source.original.winnerSlot
            ? "winner"
            : "loser"
        : edge.kind;
    if (!outcome) continue;
    if (outcome === "loser") {
      if (
        source.nextLooserMatchId &&
        source.nextLooserMatchId !== edge.targetId
      )
        return null;
      source.nextLooserMatchId = edge.targetId;
      upper.add(source.id);
      lower.add(edge.targetId);
    } else {
      if (source.nextMatchId && source.nextMatchId !== edge.targetId)
        return null;
      source.nextMatchId = edge.targetId;
    }
  }
  const terminal = matches.filter((m) => !m.nextMatchId);
  if (terminal.length !== 1) return null;
  const final = terminal[0];
  upper.add(final.id);
  lower.delete(final.id);
  // Preserve upper winner chains; the remaining recorded paths belong below.
  for (let i = 0; i < matches.length; i++) {
    for (const m of matches)
      if (
        m.nextMatchId !== final.id &&
        upper.has(m.nextMatchId!) &&
        !lower.has(m.id)
      )
        upper.add(m.id);
  }
  for (const m of matches) if (!upper.has(m.id)) lower.add(m.id);
  if (!lower.size || upper.size < 2) return null;
  for (const m of matches) {
    if (upper.has(m.id) && lower.has(m.id)) return null;
    if (m.id !== final.id && !all.has(m.nextMatchId!)) return null;
    if (upper.has(m.id) && m.id !== final.id && !upper.has(m.nextMatchId!))
      return null;
    // The library assumes every winner chain reaches the common final. Missing
    // intermediates/ambiguous finals must fall back without inventing fixtures.
    let current: LibraryMatch | undefined = m;
    const visited = new Set();
    while (current && current.id !== final.id) {
      if (visited.has(current.id)) return null;
      visited.add(current.id);
      current = all.get(current.nextMatchId!);
    }
    if (!current) return null;
  }
  return {
    upper: matches.filter((m) => upper.has(m.id)),
    lower: matches.filter((m) => lower.has(m.id)),
    edges,
  };
}
