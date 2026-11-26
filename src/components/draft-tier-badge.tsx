import type { CSSProperties } from "react";
import styles from "./draft-tier-badge.module.css";

const hues = [220, 165, 215, 282, 43, 338];

export function DraftTierBadge({
  tier,
  className,
}: {
  tier: number;
  className?: string;
}) {
  const hue = hues[tier] ?? (tier * 137.508) % 360;
  return (
    <span
      className={className ? `${styles.badge} ${className}` : styles.badge}
      data-draft-tier={tier}
      style={{ "--tier-hue": hue } as CSSProperties}
    >
      {tier === 0 ? "Captain" : `Tier ${tier}`}
    </span>
  );
}
