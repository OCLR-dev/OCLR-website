"use client";
import { useAppTranslations } from "@/i18n/shared";

import { beatmapCoverSources } from "@/lib/beatmap-artwork";
import Image from "next/image";
import { useState } from "react";
export function BeatmapCover({
  setId,
  coverPath,
  backgroundSetId,
  fallbackSetId,
  compact = false,
}: {
  setId: number | null | undefined;
  coverPath?: string;
  backgroundSetId?: number | null;
  fallbackSetId?: number | null;
  compact?: boolean;
}) {
  const tr = useAppTranslations();

  const sources = beatmapCoverSources({
    setId,
    coverPath,
    backgroundSetId,
    fallbackSetId,
  });
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const src = sources.find((value) => !failedSources.includes(value));
  return (
    <div className="beatmap-cover">
      {!src ? (
        <span
          className="muted small"
          aria-label={compact ? tr("Cover unavailable") : undefined}
          title={compact ? tr("Cover unavailable") : undefined}
        >
          {compact ? "—" : tr("Cover unavailable")}
        </span>
      ) : (
        <Image
          src={src}
          alt=""
          width={180}
          height={100}
          unoptimized
          onError={() =>
            setFailedSources((value) =>
              value.includes(src) ? value : [...value, src],
            )
          }
        />
      )}
    </div>
  );
}
