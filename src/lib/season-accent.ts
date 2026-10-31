import type { SeasonAppearance } from "./preferences";

/**
 * Accent colours of the registered season themes, mirroring the `--site-accent`
 * each theme declares for the light block and the `[data-theme="dark"]` block.
 * A component cannot reuse the theme variable per element (the selectors need
 * `html[data-appearance="…"]`), so the timeline needs its own copy; the unit
 * test in `tests/unit/season-accent.test.ts` re-reads the shipped stylesheets
 * and fails when the two drift apart.
 */
export type SeasonAccent = { light: string; dark: string };

export const seasonAccents: Record<SeasonAppearance, SeasonAccent> = {
  "chromatic-origins": { light: "#744d8b", dark: "#d5b8ff" },
  "verdant-prelude": { light: "#2d634d", dark: "#9bcfc1" },
  "frost-waltz": { light: "#174a78", dark: "#91d8ef" },
  "azure-brush": { light: "#176ca4", dark: "#9dcced" },
  "prism-overture": { light: "#6943ac", dark: "#d5b8ff" },
  "orbital-pulse": { light: "#b4324c", dark: "#ff8d9a" },
  "graphite-arena": { light: "#796000", dark: "#eacb49" },
  "sakura-circuit": { light: "#a92e62", dark: "#ffa6cf" },
  "glacier-blue": { light: "#1748d5", dark: "#88dfff" },
  "skyline-pop": { light: "#006395", dark: "#83e7ff" },
};

export function seasonAccentPair(
  appearance: SeasonAppearance | null | undefined,
): SeasonAccent | null {
  return appearance ? seasonAccents[appearance] : null;
}
