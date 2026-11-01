/**
 * Preliminary split between gameplay badges (tournament placements) and
 * non-gameplay badges (mapping, contests, community work).
 *
 * This is a keyword heuristic for display or review triage, not an
 * authoritative classification: badge descriptions come from osu! and are not
 * structured, so unknown wording stays "unknown".
 */
export type BadgeActivity = "gameplay" | "mapping" | "contest" | "unknown";

// A contest is never a gameplay result, even when it is a mapping contest.
const CONTEST = /\bcontests?\b/i;
// Any badge that names a tournament is treated as a gameplay result.
const TOURNAMENT = /\btournaments?\b/i;
// World Cup badges come in player and staff flavours, so the wording alone is
// not enough; the placement below decides.
const WORLD_CUP = /\b(?:[otmc]wc|world\s+cup)\b/i;
const WORLD_CUP_PLACEMENT =
  /\b(?:1st|2nd|3rd|first|second|third|top\s?[123])\b|\b(?:winner|winning|champion|victor(?:y|ious)|runner[- ]?up)\b/i;
const MAPPING =
  /\bmapp(?:er|ing|ool)|\bbeatmaps?\b|\bmod(?:ding|der)\b|\bstoryboards?\b|\bskins?\b|\bnominators?\b|\bspotlights?\b|\bproject\s+loved\b|\bwikis?\b/i;

export function classifyBadgeActivity(
  name: string | null | undefined,
): BadgeActivity {
  const badge = name?.trim();
  if (!badge) return "unknown";
  if (CONTEST.test(badge)) return "contest";
  if (TOURNAMENT.test(badge)) return "gameplay";
  // A World Cup ribbon only proves play when it records a podium finish;
  // staff and participation ribbons without one stay unknown.
  if (WORLD_CUP.test(badge) && WORLD_CUP_PLACEMENT.test(badge))
    return "gameplay";
  if (MAPPING.test(badge)) return "mapping";
  return "unknown";
}

/** True only when the badge description points at a gameplay result. */
export function isGameplayBadge(name: string | null | undefined): boolean {
  return classifyBadgeActivity(name) === "gameplay";
}
