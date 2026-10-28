"use client";

import type { CSSProperties, ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { beatmapCoverUrl } from "@/lib/beatmap-artwork";
import { starColor, starInk } from "@/lib/beatmap-star-color";
import {
  beatmapModeNames,
  formatBeatmapDuration,
  formatBeatmapNumber,
} from "@/lib/mappool-model";
import { BeatmapActions } from "./beatmap-actions";
import { BeatmapCover } from "./beatmap-cover";

/**
 * Wide beatmap card: star-coloured rail, flush cover, then title, credits and
 * a compact stats row. Shared by the live pools and the historical archive so
 * both entry points keep the same hierarchy.
 */
export function MapCardBand({
  as: Tag = "article",
  className,
  id,
  dataCategory,
  slot,
  title,
  artist,
  difficulty,
  mapper,
  beatmapId,
  setId,
  originalBeatmapId,
  originalSetId,
  stars,
  bpm,
  durationSeconds,
  cs,
  ar,
  od,
  mode,
  headingLevel = 3,
  openLabel,
  onOpen,
  chips,
  note,
}: {
  as?: "article" | "li";
  className?: string;
  id: string;
  dataCategory: string;
  slot: string;
  title: string;
  artist?: string | null;
  difficulty?: string | null;
  mapper?: string | null;
  beatmapId?: number | null;
  setId?: number | null;
  originalBeatmapId?: number | null;
  originalSetId?: number | null;
  stars?: number | null;
  bpm?: number | null;
  durationSeconds?: number | null;
  cs?: number | null;
  ar?: number | null;
  od?: number | null;
  mode?: keyof typeof beatmapModeNames;
  headingLevel?: 2 | 3 | 4 | 5;
  openLabel: string;
  onOpen: () => void;
  chips?: ReactNode;
  note?: ReactNode;
}) {
  const tr = useAppTranslations();
  const Heading = `h${headingLevel}` as "h3";
  const art = beatmapCoverUrl(setId ?? originalSetId);
  return (
    <Tag
      className={["map-browse-card", "map-browse-card--band", className]
        .filter(Boolean)
        .join(" ")}
      id={id}
      data-category={dataCategory}
      style={
        {
          "--map-star": starColor(stars),
          "--map-star-ink": starInk(stars),
        } as CSSProperties
      }
    >
      <div
        className="map-card-art"
        aria-hidden="true"
        style={art ? { backgroundImage: `url("${art}")` } : undefined}
      />
      <div className="map-card-cover">
        <BeatmapCover setId={setId} fallbackSetId={originalSetId} />
        <span className="map-slot-badge">{slot}</span>
        {beatmapId ? <span className="map-card-id">{beatmapId}</span> : null}
      </div>
      <div className="map-card-copy">
        <div className="map-card-title-row">
          <Heading>
            <button
              className="map-open-button"
              type="button"
              aria-label={openLabel}
              onClick={onOpen}
            >
              <span className="map-card-title">{title}</span>
            </button>
          </Heading>
        </div>
        <p className="map-card-meta map-card-meta--artist">
          <span className="map-card-artist">{artist ?? "—"}</span>
        </p>
        <div className="map-card-footer">
          {note ? <div className="map-card-note">{note}</div> : null}
          <p className="map-card-meta map-card-meta--stats">
            <span className="map-card-star">
              {formatBeatmapNumber(stars)} ★
            </span>
            <span className="map-card-difficulty">[{difficulty ?? "—"}]</span>
            {mapper ? (
              <span className="map-card-mapper">({mapper})</span>
            ) : null}
          </p>
          <div className="map-card-values">
            <span>
              {formatBeatmapNumber(bpm)} {tr("BPM")}
            </span>
            <span>{formatBeatmapDuration(durationSeconds)}</span>
            <span>
              {tr("CS")} {formatBeatmapNumber(cs, 1)}
            </span>
            <span>
              {tr("AR")} {formatBeatmapNumber(ar, 1)}
            </span>
            <span>
              {tr("OD")} {formatBeatmapNumber(od, 1)}
            </span>
            {chips}
          </div>
        </div>
        <span className="map-card-mode">{beatmapModeNames[mode ?? "osu"]}</span>
        <BeatmapActions
          compact
          beatmapId={beatmapId}
          setId={setId}
          originalBeatmapId={originalBeatmapId}
          originalSetId={originalSetId}
          name={slot}
        />
      </div>
    </Tag>
  );
}
