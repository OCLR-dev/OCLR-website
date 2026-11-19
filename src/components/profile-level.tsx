"use client";

import { useAppTranslations } from "@/i18n/shared";

// osu! level tiers: the hexagon ring is tinted by the level, from iron up to
// lustrous. Each pair runs from the darker stop to the lighter one.
const LEVEL_TIERS: [minimum: number, from: string, to: string][] = [
  [110, "#ed82ff", "#ffe600"],
  [105, "#ed82ff", "#97dcff"],
  [100, "#a0cf96", "#d9f8d3"],
  [80, "#52e0df", "#a8f0ef"],
  [60, "#e0c952", "#f0e4a8"],
  [40, "#a3a3c2", "#e0e0eb"],
  [20, "#855c47", "#b88f7a"],
  [0, "#bab3ab", "#dddddd"],
];

function levelTier(level: number) {
  for (const [minimum, from, to] of LEVEL_TIERS) {
    if (level >= minimum) return { from, to };
  }
  return { from: "#bab3ab", to: "#dddddd" };
}

// The outer hexagon plate behind the ring; the ring itself is osu!'s own path
// (two contours, so the fill leaves the centre open).
const HEX_PLATE =
  "M 25,0 A 11.9,11.9 0 0 0 19,1.6 L 7.7,8.1 A 12,12 0 0 0 1.7,18.5 v 13 a 12,12 0 0 0 6,10.4 l 11.3,6.5 a 12,12 0 0 0 12,0 l 11.3,-6.5 a 12,12 0 0 0 6,-10.4 v -13 A 12,12 0 0 0 42.3,8.1 L 31,1.6 A 11.9,11.9 0 0 0 25,0 Z";
const HEX_RING =
  "M 25,2.7 a 9.3,9.3 0 0 1 4.7,1.2 l 11.3,6.5 a 9.3,9.3 0 0 1 4.6,8.1 v 13 a 9.3,9.3 0 0 1 -4.6,8.1 L 29.7,46.1 a 9.3,9.3 0 0 1 -9.3,0 L 9.1,39.6 A 9.3,9.3 0 0 1 4.4,31.5 v -13 A 9.3,9.3 0 0 1 9.1,10.4 L 20.4,3.9 A 9.3,9.3 0 0 1 25,2.7 M 25,0 A 11.9,11.9 0 0 0 19,1.6 L 7.7,8.1 A 12,12 0 0 0 1.7,18.5 v 13 a 12,12 0 0 0 6,10.4 l 11.3,6.5 a 12,12 0 0 0 12,0 l 11.3,-6.5 a 12,12 0 0 0 6,-10.4 v -13 A 12,12 0 0 0 42.3,8.1 L 31,1.6 A 11.9,11.9 0 0 0 25,0 Z";

// The hexagon is painted with CSS gradients and cut out by these masks, so the
// ring can reuse the rank values' rolling gradient animation.
const hexMask = (path: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 50 50' preserveAspectRatio='none'><path d='${path}' fill='#000'/></svg>`,
  )}")`;
const PLATE_MASK = hexMask(HEX_PLATE);
const RING_MASK = hexMask(HEX_RING);

/**
 * Level readout pinned to the card's top-right corner, following osu!'s
 * profile detail bar: a slim progress bar towards the next level next to a
 * hexagonal badge holding the level number, tinted by the level tier.
 */
export function ProfileLevel({
  level,
  progress,
}: {
  level: number;
  progress: number | null;
}) {
  const tr = useAppTranslations();
  const tier = levelTier(level);
  const hasProgress = progress !== null && progress >= 0 && progress <= 100;
  const percent = hasProgress ? progress : 0;
  return (
    <div
      className="profile-level"
      role="img"
      style={
        {
          "--level-from": tier.from,
          "--level-to": tier.to,
          "--level-plate": PLATE_MASK,
          "--level-ring": RING_MASK,
        } as React.CSSProperties
      }
      aria-label={
        hasProgress
          ? `${tr("Level")} ${level} (${percent}%)`
          : `${tr("Level")} ${level}`
      }
    >
      <span className="profile-level-bar" aria-hidden="true">
        <span
          className="profile-level-bar-fill"
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="profile-level-badge" aria-hidden="true">
        <span className="profile-level-plate" />
        <span className="profile-level-ring" />
        <span className="profile-level-number">{level}</span>
      </span>
    </div>
  );
}
