import type { CSSProperties } from "react";
import { RATING_COLORS } from "./rating-colors";

/**
 * Border colours for a panel. The light tone sits on the top edge and the
 * darker tone on the bottom edge, matching the three-quarter gauges.
 */
export function accentForScore(
  score: number | null,
): CSSProperties | undefined {
  if (score === null || !Number.isFinite(score) || score <= 0) return undefined;
  const colors =
    score < 0.45
      ? RATING_COLORS.red
      : score > 0.55
        ? RATING_COLORS.green
        : RATING_COLORS.blue;
  return accentForColors(colors[1], colors[0]);
}

/** A lighter tint on top of the supplied base colour, with the base below. */
export function accentForColor(base: string): CSSProperties {
  return accentForColors(`color-mix(in srgb, ${base} 55%, white)`, base);
}

export function accentForColors(light: string, dark: string): CSSProperties {
  return {
    "--accent-top": light,
    "--accent-bottom": dark,
  } as CSSProperties;
}

/** Average of the finite values; null when nothing is available. */
export function averageOf(values: (number | null)[]): number | null {
  const present = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  return present.length
    ? present.reduce((total, value) => total + value, 0) / present.length
    : null;
}
