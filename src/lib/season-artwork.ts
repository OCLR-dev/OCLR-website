import type { SeasonAppearance } from "./preferences";

/**
 * Page-heading artwork of the registered season themes, mirroring the image
 * each theme paints into `.page-heading` (the faint illustrated layer behind
 * the title). A component cannot reuse the theme variable per element because
 * the selectors need `html[data-appearance="…"]`, so the timeline keeps its own
 * copy; the unit test in `tests/unit/season-artwork.test.ts` re-reads the
 * shipped stylesheets and fails when the filenames drift apart.
 */
export type SeasonArtwork = { light: string; dark: string };

export const seasonArtwork: Record<SeasonAppearance, SeasonArtwork> = {
  "chromatic-origins": {
    light: "/themes/chromatic-origins/ink-diffusion.webp",
    dark: "/themes/chromatic-origins/ink-diffusion.webp",
  },
  "verdant-prelude": {
    light: "/themes/verdant-prelude/paper-light.svg",
    dark: "/themes/verdant-prelude/paper-dark.svg",
  },
  "frost-waltz": {
    light: "/themes/frost-waltz/frost-field-light.svg",
    dark: "/themes/frost-waltz/frost-field-dark.svg",
  },
  "azure-brush": {
    light: "/themes/azure-brush/ink-brush.webp",
    dark: "/themes/azure-brush/ink-brush.webp",
  },
  "prism-overture": {
    light: "/themes/prism-overture/prism-field-light.svg",
    dark: "/themes/prism-overture/prism-field-dark.svg",
  },
  "orbital-pulse": {
    light: "/themes/orbital-pulse/circuit-light.svg",
    dark: "/themes/orbital-pulse/circuit-dark.svg",
  },
  "graphite-arena": {
    light: "/themes/graphite-arena/honeycomb.svg",
    dark: "/themes/graphite-arena/honeycomb.svg",
  },
  "sakura-circuit": {
    light: "/themes/sakura-circuit/heroine-half-20261028.webp",
    dark: "/themes/sakura-circuit/heroine-half-20261028.webp",
  },
  "glacier-blue": {
    light: "/themes/glacier-blue/cirno-ice-fairy.webp",
    dark: "/themes/glacier-blue/cirno-ice-fairy.webp",
  },
  "skyline-pop": {
    light: "/themes/skyline-pop/coast.webp",
    dark: "/themes/skyline-pop/coast.webp",
  },
};

export function seasonArtworkPair(
  appearance: SeasonAppearance | null | undefined,
): SeasonArtwork | null {
  return appearance ? seasonArtwork[appearance] : null;
}
