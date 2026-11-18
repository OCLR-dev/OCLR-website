"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { LiruCollectionEntry } from "@/lib/liru-collection";
import { WikiGalleryPreview } from "./wiki-gallery-preview";
import { countLiruCards, LiruCardDisplay } from "./liru-card-display";
import styles from "./liru-card-display.module.css";

const pageSize = 12;

export function LiruProfileCollection({
  cards,
}: {
  cards: LiruCollectionEntry[];
}) {
  const tr = useAppTranslations();
  const [index, setIndex] = useState(0);
  const pages = Math.max(1, Math.ceil(cards.length / pageSize));
  const page = Math.min(index, pages - 1);

  return (
    <LiruCardDisplay
      id="liru-collection"
      headingId="liru-collection-title"
      title={tr("Liru Gallery")}
      counts={countLiruCards(
        cards.map(({ figure, count }) => ({ rarity: figure.rarity, count })),
      )}
      action={
        <Link href="/gallery" className={styles.drawLink}>
          {tr("Liru daily draw")} <span aria-hidden="true">↗</span>
        </Link>
      }
    >
      {cards.length > 0 && (
        <ul className={styles.cards} role="list">
          {cards
            .slice(page * pageSize, (page + 1) * pageSize)
            .map(({ figure, count }) => (
              <li
                className={styles.card}
                key={`${figure.src}:${figure.rarity}`}
                data-rarity={figure.rarity}
              >
                <div className={styles.surface}>
                  <WikiGalleryPreview figure={figure} />
                </div>
                <div className={styles.caption}>
                  <span className={styles.name} aria-hidden="true">
                    {figure.caption}
                  </span>
                  <span className={styles.count}>×{count}</span>
                </div>
              </li>
            ))}
        </ul>
      )}
      {pages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            className="secondary"
            disabled={page === 0}
            onClick={() => setIndex(page - 1)}
          >
            {tr("← Previous")}
          </button>
          <span role="status">
            {tr("Page {page} of {pages}", { page: page + 1, pages })}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page === pages - 1}
            onClick={() => setIndex(page + 1)}
          >
            {tr("Next →")}
          </button>
        </div>
      )}
    </LiruCardDisplay>
  );
}
