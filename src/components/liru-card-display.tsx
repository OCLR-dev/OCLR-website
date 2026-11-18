import type { ReactNode } from "react";
import type { WikiGalleryFigure } from "@/lib/wiki-articles";
import styles from "./liru-card-display.module.css";

type Rarity = WikiGalleryFigure["rarity"];

export function countLiruCards(
  entries: readonly { rarity: Rarity; count?: number }[],
) {
  const counts = { UR: 0, SSR: 0, SR: 0, R: 0 };
  for (const { rarity, count = 1 } of entries) counts[rarity] += count;
  return counts;
}

export function LiruCardDisplay({
  title,
  headingId,
  counts,
  action,
  children,
  id,
}: {
  title: string;
  headingId: string;
  counts: ReturnType<typeof countLiruCards>;
  action?: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <div
      className={styles.display}
      id={id}
      role="region"
      aria-labelledby={headingId}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.emblem} aria-hidden="true">
            ✦
          </span>
          <h2 className={styles.title} id={headingId}>
            {title}
          </h2>
        </div>
        {action}
        <ul className={styles.rarities} role="list">
          {Object.entries(counts).map(([rarity, count]) => (
            <li key={rarity} data-rarity={rarity}>
              <span>{rarity}</span>
              <strong>{count}</strong>
            </li>
          ))}
        </ul>
      </header>
      {children}
    </div>
  );
}
