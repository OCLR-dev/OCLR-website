"use client";
import { useAppTranslations } from "@/i18n/shared";

import Image from "next/image";
import { useState } from "react";
export function EventArtwork({ src, name }: { src: string; name: string }) {
  const tr = useAppTranslations();

  const [failed, setFailed] = useState(false);
  // Keep the stored, whitelisted branding value and existing editions compatible.
  const enhanced = src === "/oclr-s11-key-visual.webp";
  const image = (
    <Image
      src={enhanced ? "/oclr-s11-key-visual-enhanced-3840.webp" : src}
      alt={tr("{value0} key visual", { value0: name })}
      width={enhanced ? 3840 : 1672}
      height={enhanced ? 2160 : 941}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
  return (
    <div className="event-artwork">
      {failed ? (
        <div className="event-artwork-fallback">
          <span>OCLR</span>
          <p>{name}</p>
        </div>
      ) : enhanced ? (
        <picture>
          <source
            type="image/webp"
            srcSet={[640, 960, 1280, 1920, 2560, 3840]
              .map(
                (width) =>
                  `/oclr-s11-key-visual-enhanced-${width}.webp ${width}w`,
              )
              .join(", ")}
            sizes="(max-width: 1360px) calc(100vw - clamp(2rem, 7vw, 6rem)), (max-width: 1496px) calc(55vw - 3.3rem), 770px"
          />
          {image}
        </picture>
      ) : (
        image
      )}
    </div>
  );
}
