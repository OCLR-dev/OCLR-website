import type { ResolvedBracket } from "./bracket-model";

type Group = ResolvedBracket["groups"][number];
export type BracketEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  sourceSlot: number | null;
  targetSlot: number;
  kind: "winner" | "loser" | "appearance";
};

/** Only explicit outcomes are advancement edges. Archives use the existing
 * kind=team wire format for appearance references; keep these behind an opt-in. */
export function bracketRouting(group: Group, showAppearances = false) {
  const matches = new Map(
    group.rounds.flatMap((r, column) =>
      r.matches.map((match) => [match.id, { match, column }] as const),
    ),
  );
  const edges: BracketEdge[] = [];
  for (const { match: target, column: targetColumn } of matches.values()) {
    target.slots.forEach((slot, targetSlot) => {
      const source = slot.sourceMatchId
        ? matches.get(slot.sourceMatchId)
        : null;
      if (!source || source.column >= targetColumn) return;
      const kind =
        slot.kind === "winner" || slot.kind === "loser"
          ? slot.kind
          : "appearance";
      if (kind === "appearance" && !showAppearances) return;
      let sourceSlot: number | null = null;
      if (kind === "appearance") {
        const position = source.match.slots.findIndex(
          (s) => slot.teamId && s.teamId === slot.teamId,
        );
        if (position < 0) return;
        sourceSlot = position;
      } else if (
        source.match.status === "completed" &&
        source.match.winnerSlot !== null
      ) {
        sourceSlot =
          kind === "winner"
            ? source.match.winnerSlot
            : 1 - source.match.winnerSlot;
        const team = source.match.slots[sourceSlot].teamId;
        if (team && slot.teamId && team !== slot.teamId) return;
      }
      edges.push({
        id: `${target.id}:${targetSlot}`,
        sourceId: source.match.id,
        targetId: target.id,
        sourceSlot,
        targetSlot,
        kind,
      });
    });
  }
  return { edges };
}
