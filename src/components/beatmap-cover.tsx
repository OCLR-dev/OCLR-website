"use client";
import { useAppTranslations } from "@/i18n/shared";

import { beatmapCoverUrl } from "@/lib/beatmap-artwork";
import Image from "next/image";
import { useState } from "react";
export function BeatmapCover({
  setId,
  compact = false,
}: {
  setId: number | null | undefined;
  compact?: boolean;
}) {
  const tr = useAppTranslations();

  const src = beatmapCoverUrl(setId);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <div className="beatmap-cover">
      {!src || failedSource === src ? (
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
          onError={() => setFailedSource(src)}
        />
      )}
    </div>
  );
}
