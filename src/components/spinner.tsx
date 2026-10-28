"use client";

import Image from "next/image";
import { useState } from "react";
import { spinnerArtwork, type SpinnerArtwork } from "@/lib/spinner-artwork";
import { useAppearanceScope } from "./appearance-provider";
import styles from "./spinner.module.css";

// A non-animated candidate prevents downloading a GIF when it must stay hidden.
const transparentStill =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='1'%20height='1'/%3E";

function Ring({ marker = false }: { marker?: boolean }) {
  return (
    <span
      className={styles.spinner}
      aria-hidden="true"
      data-spinner={marker ? "" : undefined}
    />
  );
}

function ArtworkSpinner({ artwork }: { artwork: SpinnerArtwork }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const animated =
    artwork.animated ?? /\.(?:gif|apng)(?:[?#]|$)/i.test(artwork.src);
  const reducedFallback = animated && !artwork.reducedMotionSrc;
  const reducedSource =
    artwork.reducedMotionSrc ?? (animated ? transparentStill : artwork.src);
  return (
    <span
      className={styles.artwork}
      style={{ width: artwork.width, height: artwork.height }}
      aria-hidden="true"
      data-spinner=""
      data-spinner-artwork=""
      data-ready={loaded && !failed ? "" : undefined}
      data-reduced-fallback={reducedFallback ? "" : undefined}
    >
      <span className={styles.fallback}>
        <Ring />
      </span>
      <picture className={styles.picture}>
        <source media="(forced-colors: active)" srcSet={transparentStill} />
        <source
          media="(prefers-reduced-motion: reduce)"
          srcSet={reducedSource}
        />
        <Image
          className={styles.image}
          src={artwork.src}
          width={artwork.width}
          height={artwork.height}
          alt=""
          unoptimized
          loading="eager"
          draggable={false}
          onLoad={() => {
            setLoaded(true);
            setFailed(false);
          }}
          onError={() => setFailed(true)}
        />
      </picture>
    </span>
  );
}

/** Shared behavior; optional artwork follows the existing resolved theme. */
export function Spinner() {
  const appearance = useAppearanceScope()?.appearance ?? "default";
  const artwork = spinnerArtwork[appearance];
  return artwork ? (
    <ArtworkSpinner key={appearance} artwork={artwork} />
  ) : (
    <Ring marker />
  );
}
