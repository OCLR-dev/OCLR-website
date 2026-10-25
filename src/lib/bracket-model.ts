import { z } from "zod";
const key = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .max(80);
const slot = z.discriminatedUnion("type", [
  z.object({ type: z.literal("team"), teamId: z.uuid() }).strict(),
  z.object({ type: z.enum(["winner", "loser"]), matchId: key }).strict(),
  z.object({ type: z.literal("tba") }).strict(),
  z.object({ type: z.literal("bye") }).strict(),
]);
const matchSchema = z
  .object({
    id: key,
    label: z.string().min(1).max(100),
    status: z.enum(["pending", "completed"]),
    slots: z.tuple([slot, slot]),
    scores: z.tuple([
      z.number().int().nonnegative().nullable(),
      z.number().int().nonnegative().nullable(),
    ]),
    winnerSlot: z.union([z.literal(0), z.literal(1)]).nullable(),
    note: z.string().max(500).nullable(),
  })
  .strict();
export const bracketSchema = z
  .object({
    editionSlug: key,
    published: z.boolean(),
    formatLabel: z.string().min(1).max(120),
    source: z
      .object({
        label: z.string().min(1).max(200),
        url: z
          .url()
          .refine((value) => new URL(value).protocol === "https:")
          .nullable(),
      })
      .strict(),
    updatedAt: z.iso.datetime({ offset: true }),
    groups: z
      .array(
        z
          .object({
            id: key,
            label: z.string().min(1).max(80),
            rounds: z
              .array(
                z
                  .object({
                    id: key,
                    label: z.string().min(1).max(80),
                    matches: z.array(matchSchema).min(1).max(256),
                  })
                  .strict(),
              )
              .min(1)
              .max(32),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
export type Bracket = z.infer<typeof bracketSchema>;
type Match = z.infer<typeof matchSchema>;
export type ResolvedSlot = {
  avatarKey?: string | null;
  teamId: string | null;
  label: string;
  // Only winner/loser declare progression. For kind=team, a source is a
  // previous recorded appearance, not a qualification rule (archive wire format).
  sourceMatchId: string | null;
  kind: "team" | "winner" | "loser" | "tba" | "bye";
};
export type ResolvedMatch = Omit<Match, "slots"> & {
  detailsUrl?: string;
  slots: [ResolvedSlot, ResolvedSlot];
};
export type ResolvedBracket = Omit<Bracket, "groups"> & {
  groups: {
    id: string;
    label: string;
    layout?: "grid";
    rounds: { id: string; label: string; matches: ResolvedMatch[] }[];
  }[];
};
export function bracketTeamIds(bracket: Bracket) {
  return [
    ...new Set(
      bracket.groups.flatMap((g) =>
        g.rounds.flatMap((r) =>
          r.matches.flatMap((m) =>
            m.slots.flatMap((s) => (s.type === "team" ? [s.teamId] : [])),
          ),
        ),
      ),
    ),
  ];
}
export function resolveBracket(
  bracket: Bracket,
  identities: { id: string; name: string; avatarKey?: string | null }[],
): ResolvedBracket {
  const matches = bracket.groups.flatMap((g) =>
    g.rounds.flatMap((r) => r.matches),
  );
  const all = new Map(matches.map((m) => [m.id, m]));
  const names = new Map(identities.map((t) => [t.id, t.name]));
  if (
    all.size !== matches.length ||
    new Set(bracket.groups.map((g) => g.id)).size !== bracket.groups.length ||
    bracket.groups.some(
      (g) => new Set(g.rounds.map((r) => r.id)).size !== g.rounds.length,
    )
  )
    throw new Error("Bracket match, group and round IDs must be unique.");
  const cache = new Map<string, ResolvedMatch>();
  const visiting = new Set<string>();
  function resolve(id: string): ResolvedMatch {
    if (cache.has(id)) return cache.get(id)!;
    if (visiting.has(id))
      throw new Error("Bracket progression contains a cycle.");
    const match = all.get(id);
    if (!match) throw new Error("Bracket references an unknown source match.");
    visiting.add(id);
    const slots = match.slots.map((value): ResolvedSlot => {
      if (value.type === "team") {
        const label = names.get(value.teamId);
        if (!label)
          throw new Error(
            "Bracket references an unpublished or unfinalized team.",
          );
        return {
          teamId: value.teamId,
          avatarKey:
            identities.find((t) => t.id === value.teamId)?.avatarKey ?? null,
          label,
          sourceMatchId: null,
          kind: "team",
        };
      }
      if (value.type === "tba" || value.type === "bye")
        return {
          teamId: null,
          label: value.type === "bye" ? "Bye" : "To be announced",
          sourceMatchId: null,
          kind: value.type,
        };
      const previous = resolve(value.matchId);
      if (previous.status === "completed" && previous.winnerSlot !== null) {
        const position =
          value.type === "winner"
            ? previous.winnerSlot
            : 1 - previous.winnerSlot;
        const team = previous.slots[position];
        if (team.teamId)
          return { ...team, sourceMatchId: value.matchId, kind: value.type };
      }
      return {
        teamId: null,
        label: `${value.type === "winner" ? "Winner" : "Loser"} of ${previous.label}`,
        sourceMatchId: value.matchId,
        kind: value.type,
      };
    }) as [ResolvedSlot, ResolvedSlot];
    if (slots[0].teamId && slots[0].teamId === slots[1].teamId)
      throw new Error("A team cannot play itself.");
    if (slots.every((s) => s.kind === "bye"))
      throw new Error("A match cannot have two byes.");
    if (match.status === "pending" && match.winnerSlot !== null)
      throw new Error("Pending matches cannot declare a winner.");
    if (match.winnerSlot !== null) {
      if (!slots[match.winnerSlot].teamId)
        throw new Error("The winner must resolve to a finalized team.");
      const winning = match.scores[match.winnerSlot];
      const losing = match.scores[1 - match.winnerSlot];
      if (
        winning !== null &&
        losing !== null &&
        winning <= losing &&
        !match.note
      )
        throw new Error(
          "A score exception requires an explicit reviewed result note.",
        );
    }
    const resolved = { ...match, slots };
    visiting.delete(id);
    cache.set(id, resolved);
    return resolved;
  }
  return {
    ...bracket,
    groups: bracket.groups.map((g) => ({
      ...g,
      rounds: g.rounds.map((r) => ({
        ...r,
        matches: r.matches.map((m) => resolve(m.id)),
      })),
    })),
  };
}
export const bracketsSchema = z
  .array(bracketSchema)
  .superRefine((values, context) => {
    if (new Set(values.map((v) => v.editionSlug)).size !== values.length)
      context.addIssue({
        code: "custom",
        message: "Only one bracket per edition is supported.",
      });
    for (const bracket of values) {
      try {
        resolveBracket(
          bracket,
          bracketTeamIds(bracket).map((id) => ({ id, name: id })),
        );
      } catch (error) {
        context.addIssue({
          code: "custom",
          message:
            error instanceof Error
              ? error.message
              : "Invalid bracket progression.",
        });
      }
    }
  });
