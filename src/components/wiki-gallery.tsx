"use client";

import { useId, useState } from "react";
import type { WikiGalleryFigure } from "@/lib/wiki-articles";
import { LiruGalleryPanel } from "./liru-card-display";
import { EmojiReactions } from "./player-reactions";
import { WikiGalleryPreview } from "./wiki-gallery-preview";

export function WikiGallery({
  title,
  figures,
  initialIndex,
  showAnotherLabel,
}: {
  title: string;
  figures: WikiGalleryFigure[];
  initialIndex: number;
  showAnotherLabel: string;
}) {
  const headingId = useId();
  const [index, setIndex] = useState(initialIndex);
  const figure = figures[index];

  function showAnother() {
    // Draw from one fewer slot, then skip the currently displayed index.
    const draw = Math.floor(Math.random() * (figures.length - 1));
    setIndex((current) => (draw < current ? draw : draw + 1));
  }

  return (
    <LiruGalleryPanel
      className="wiki-gallery"
      title={title}
      headingId={headingId}
    >
      <figure className="wiki-gallery-layout">
        <WikiGalleryPreview figure={figure} showHint />
        <div className="wiki-gallery-controls">
          <button
            className="wiki-gallery-shuffle"
            type="button"
            onClick={showAnother}
            disabled={figures.length < 2}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              focusable="false"
              aria-hidden="true"
            >
              <path d="M3 7h3c2 0 3.1 1.1 4.3 2.7M3 17h3c2.6 0 4-2 6-5s3.4-5 6-5h3M14.5 14.9c1 1.4 2 2.1 3.5 2.1h3m-3-13 3 3-3 3m0 4 3 3-3 3" />
            </svg>
            <span>{showAnotherLabel}</span>
          </button>
        </div>
        <figcaption>
          <span className="sr-only" aria-live="polite">
            {figure.caption} ({figure.rarity})
          </span>
          <EmojiReactions
            key={figure.src}
            storageKey={`oclr-liru-gallery-reactions:${figure.src}`}
            name={figure.caption}
          />
        </figcaption>
      </figure>
    </LiruGalleryPanel>
  );
}
