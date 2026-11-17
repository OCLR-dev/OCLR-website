"use client";

import Image from "next/image";
import { useState } from "react";
import type { WikiGalleryFigure } from "@/lib/wiki-articles";

export function WikiGallery({
  figures,
  initialIndex,
  showAnotherLabel,
  instructions,
}: {
  figures: WikiGalleryFigure[];
  initialIndex: number;
  showAnotherLabel: string;
  instructions: string;
}) {
  const [index, setIndex] = useState(initialIndex);
  const figure = figures[index];

  function showAnother() {
    // Draw from one fewer slot, then skip the currently displayed index.
    const draw = Math.floor(Math.random() * (figures.length - 1));
    setIndex((current) => (draw < current ? draw : draw + 1));
  }

  return (
    <div className="wiki-gallery">
      <div className="wiki-gallery-controls">
        <h2 id="wiki-gallery-caption" aria-live="polite">
          {figure.caption}
        </h2>
        <button
          className="wiki-gallery-shuffle"
          type="button"
          onClick={showAnother}
          disabled={figures.length < 2}
        >
          <span className="wiki-gallery-shuffle-icon" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              focusable="false"
            >
              <path d="M3 7h3c2 0 3.1 1.1 4.3 2.7M3 17h3c2.6 0 4-2 6-5s3.4-5 6-5h3M14.5 14.9c1 1.4 2 2.1 3.5 2.1h3m-3-13 3 3-3 3m0 4 3 3-3 3" />
            </svg>
          </span>
          {showAnotherLabel}
        </button>
        <p>{instructions}</p>
      </div>
      <figure aria-labelledby="wiki-gallery-caption">
        <a href={figure.src} target="_blank" rel="noreferrer">
          <Image
            key={figure.src}
            src={figure.previewSrc}
            alt={figure.alt}
            width={figure.width}
            height={figure.height}
            loading="eager"
            unoptimized
          />
        </a>
      </figure>
    </div>
  );
}
