"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { LiruCollectionEntry } from "@/lib/liru-collection";
import { WikiGalleryPreview } from "./wiki-gallery-preview";
import styles from "./liru-profile-collection.module.css";

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
    <section
      className={styles.collection}
      id="liru-collection"
      aria-labelledby="liru-collection-title"
    >
      <div className={styles.header}>
        <h2 id="liru-collection-title">{tr("Liru Gallery")}</h2>
        <Link href="/wiki/liru-gallery" className="text-link">
          {tr("Liru daily draw")} →
        </Link>
      </div>
      {cards.length > 0 && (
        <ul className={styles.cards}>
          {cards
            .slice(page * pageSize, (page + 1) * pageSize)
            .map(({ figure, count }) => (
              <li key={`${figure.src}:${figure.rarity}`}>
                <WikiGalleryPreview figure={figure} />
                <span className={styles.count}>×{count}</span>
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
    </section>
  );
}
