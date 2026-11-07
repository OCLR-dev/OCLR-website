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

export function searchPlayerReactions(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return playerReactions.filter((reaction) => {
    const text =
      `${reaction.name} ${reaction.id} ${reaction.keywords}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
