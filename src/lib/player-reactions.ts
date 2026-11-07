import catalog from "./player-reaction-catalog.json";

export type PlayerReaction = {
  id: string;
  name: string;
  group: string;
  src: string;
  animatedSrc?: string;
  keywords: string;
};

// The reviewed shortlist leads; every remaining entry has a bundled image.
export const playerReactions: readonly PlayerReaction[] = catalog;
export const playerReactionById = new Map(
  playerReactions.map((reaction) => [reaction.id, reaction]),
);

// Keep already-saved Unicode readable/removable, without adding image-less
// candidates or rewriting other players' local data.
const legacyReactions = new Set([
  "💜",
  "🔥",
  "👏",
  "🐧",
  "✨",
  "💪",
  "😂",
  "😍",
  "🥹",
  "😎",
  "🤔",
  "👀",
  "🎉",
  "🚀",
  "🏆",
  "🥇",
  "🍀",
  "🫶",
  "👍",
  "❤️",
  "🎵",
  "⭐",
  "🌸",
  "🦆",
  "😈",
  "😭",
  "🤯",
  "🙏",
  "💯",
  "🎯",
  "🍵",
  "🐱",
]);

export function parsePlayerReactions(snapshot: string): string[] {
  try {
    const value: unknown = JSON.parse(snapshot);
    if (Array.isArray(value))
      return [
        ...new Set(
          value.filter(
            (id): id is string =>
              typeof id === "string" &&
              (playerReactionById.has(id) || legacyReactions.has(id)),
          ),
        ),
      ];
  } catch {}
  return [];
}

export function parsePlayerReactionPicks(snapshot: string) {
  const picks = new Map<string, number>();
  try {
    const value: unknown = JSON.parse(snapshot);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [id, count] of Object.entries(value)) {
        if (
          playerReactionById.has(id) &&
          typeof count === "number" &&
          Number.isSafeInteger(count) &&
          count > 0
        ) {
          picks.set(id, count);
        }
      }
    }
  } catch {}
  return picks;
}

export function searchPlayerReactions(
  query: string,
  picks?: ReadonlyMap<string, number>,
) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = playerReactions.filter((reaction) => {
    if (picks && !picks.has(reaction.id)) return false;
    if (!terms.length) return true;
    const text =
      `${reaction.name} ${reaction.id} ${reaction.keywords}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
  // Stable sort preserves catalog order for equally frequent reactions.
  return picks
    ? matches.sort((a, b) => (picks.get(b.id) ?? 0) - (picks.get(a.id) ?? 0))
    : matches;
}
