/**
 * Official osu! star-rating colour scale.
 *
 * Mirrors the scale used by the osu! website and the reference beatmap card:
 * star ratings are bucketed to one decimal, then the colour is interpolated
 * between fixed stops in gamma space.
 */
import { contrastInk } from "./color-contrast";

const GAMMA = 2.2;

const STOPS: readonly (readonly [number, number, number, number])[] = [
  [0.1, 66, 144, 251],
  [1.25, 79, 192, 255],
  [2, 79, 255, 213],
  [2.5, 124, 255, 79],
  [3.3, 246, 240, 92],
  [4.2, 255, 104, 104],
  [4.9, 255, 78, 111],
  [5.8, 198, 69, 184],
  [6.7, 101, 99, 222],
  [7.7, 24, 21, 142],
  [9, 0, 0, 0],
];

const UNKNOWN = "#aaaaaa";

function channel(value: number) {
  return Math.round(value).toString(16).padStart(2, "0");
}

/**
 * Background colour for a star rating. Missing or invalid ratings fall back to
 * a neutral grey so the card keeps a stable layout.
 */
export function starColor(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return UNKNOWN;
  const index = Math.round(value * 10);
  if (index < 1) return UNKNOWN;
  if (index >= 90) return "#000000";

  const star = index / 10;
  // The scale ends at the 9-star stop, so every lower rating has an upper
  // stop to interpolate towards.
  const upper = STOPS.findIndex(([stop]) => star < stop);
  if (upper < 1) return "#000000";

  const [bottom, r0, g0, b0] = STOPS[upper - 1];
  const [top, r1, g1, b1] = STOPS[upper];
  const ratio = (star - bottom) / (top - bottom);
  const mix = (c0: number, c1: number) =>
    channel(
      Math.pow(
        (1 - ratio) * Math.pow(c0, GAMMA) + ratio * Math.pow(c1, GAMMA),
        1 / GAMMA,
      ),
    );

  return `#${mix(r0, r1)}${mix(g0, g1)}${mix(b0, b1)}`;
}

/** Text colour that stays readable on top of {@link starColor}. */
export function starInk(value: number | null | undefined) {
  return contrastInk(starColor(value));
}
