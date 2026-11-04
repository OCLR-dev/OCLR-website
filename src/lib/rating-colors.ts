/**
 * Shared rating palette: low ratings are red, values around 1 are blue and
 * above-average ratings are green. Each pair runs from a deeper shade to a
 * lighter one so bars and the summary ring read consistently.
 */
export const RATING_COLORS = {
  red: ["#d32f2f", "#fd5392"],
  blue: ["#4facfe", "#00f2fe"],
  green: ["#5edc5b", "#caf881"],
} as const;

export type RatingBand = keyof typeof RATING_COLORS;

export function ratingBand(value: number | null): RatingBand {
  if (value !== null && Number.isFinite(value) && value < 0.9) return "red";
  if (value !== null && Number.isFinite(value) && value >= 1.1) return "green";
  return "blue";
}

export function ratingColors(value: number | null) {
  return RATING_COLORS[ratingBand(value)];
}
