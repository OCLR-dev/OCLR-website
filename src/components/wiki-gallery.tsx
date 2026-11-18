"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { WikiGalleryFigure } from "@/lib/wiki-articles";
import { EmojiReactions } from "./player-reactions";
import { WikiGalleryCard } from "./wiki-gallery-card";

const WikiGalleryLightbox = dynamic(() => import("./wiki-gallery-lightbox"));

export function WikiGallery({
  figures,
  initialIndex,
  showAnotherLabel,
}: {
  figures: WikiGalleryFigure[];
  initialIndex: number;
  showAnotherLabel: string;
}) {
  const tr = useAppTranslations();
  const [index, setIndex] = useState(initialIndex);
  const [previewOpen, setPreviewOpen] = useState(false);
  const cardRef = useRef<SVGSVGElement>(null);
  const figure = figures[index];
  const enlargeLabel = tr("Click to enlarge");

  function showAnother() {
    // Draw from one fewer slot, then skip the currently displayed index.
    const draw = Math.floor(Math.random() * (figures.length - 1));
    setIndex((current) => (draw < current ? draw : draw + 1));
  }

  return (
    <div className="wiki-gallery">
      <figure>
        <a
          className="wiki-gallery-preview"
          href={figure.src}
          target="_blank"
          rel="noreferrer"
          aria-haspopup="dialog"
          aria-label={`${enlargeLabel}: ${figure.caption} (${figure.rarity})`}
          onClick={(event) => {
            if (
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            setPreviewOpen(true);
          }}
        >
          <WikiGalleryCard figure={figure} cardRef={cardRef} />
          <span className="wiki-gallery-preview-hint" aria-hidden="true">
            {enlargeLabel}
          </span>
        </a>
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
      <div className="wiki-gallery-controls">
        <button
          className="wiki-gallery-shuffle"
          type="button"
          onClick={showAnother}
          disabled={figures.length < 2}
        >
          <svg
            width="36"
            height="36"
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
      {previewOpen && (
        <WikiGalleryLightbox
          figure={figure}
          cardRef={cardRef}
          close={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
