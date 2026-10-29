"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { beatmapCoverUrl } from "@/lib/beatmap-artwork";
import { starColor, starInk } from "@/lib/beatmap-star-color";
import { slotModInfo } from "@/lib/mod-colors";
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
  beatmapMissing,
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
  beatmapMissing?: boolean;
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
  const slotMod = slotModInfo(slot);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copyBeatmapId() {
    if (!beatmapId) return;
    try {
      await navigator.clipboard.writeText(String(beatmapId));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

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
        <span
          className="map-slot-badge"
          style={{ background: slotMod.bg, color: slotMod.color }}
        >
          {slot}
        </span>
        {beatmapId ? (
          <button
            type="button"
            className={[
              "map-card-id",
              copyState === "copied" ? "map-card-id--copied" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            title={
              copyState === "failed"
                ? tr("Could not copy the beatmap ID.")
                : tr("Copy beatmap ID")
            }
            aria-label={`${tr("Copy beatmap ID")}: ${beatmapId}`}
            onClick={(event) => {
              event.stopPropagation();
              void copyBeatmapId();
            }}
          >
            <span className="map-card-id-value">{beatmapId}</span>
            {copyState === "copied" ? (
              <svg
                className="map-card-id-icon"
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M4 12.5 9.5 18 20 6.5" />
              </svg>
            ) : copyState === "failed" ? (
              <span className="map-card-id-error">
                {tr("Could not copy the beatmap ID.")}
              </span>
            ) : (
              <svg
                className="map-card-id-icon"
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <rect x="9" y="9" width="12" height="12" rx="2.5" />
                <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
              </svg>
            )}
          </button>
        ) : null}
        <span className="sr-only" role="status">
          {copyState === "copied"
            ? tr("Beatmap ID copied.")
            : copyState === "failed"
              ? tr("Could not copy the beatmap ID.")
              : ""}
        </span>
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
          <div className="map-card-stats-row">
            <p className="map-card-meta map-card-meta--stats">
              <span className="map-card-star">
                {formatBeatmapNumber(stars)} ★
              </span>
              <span className="map-card-difficulty">[{difficulty ?? "—"}]</span>
              {mapper ? (
                <span className="map-card-mapper">({mapper})</span>
              ) : null}
            </p>
            {note ? (
              <div className="map-card-note">
                <button
                  type="button"
                  className="map-card-note-trigger"
                  aria-label={tr("Explanation")}
                  aria-describedby={`${id}-note`}
                >
                  <svg
                    className="map-card-note-icon"
                    viewBox="0 0 16 16"
                    width="18"
                    height="18"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <circle
                      cx="8"
                      cy="8"
                      r="6.4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
                    <path
                      d="M8 7.1v4.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <div
                  className="map-card-note-panel"
                  id={`${id}-note`}
                  role="note"
                >
                  {note}
                </div>
              </div>
            ) : null}
          </div>
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
          beatmapMissing={beatmapMissing}
          name={slot}
        />
      </div>
    </Tag>
  );
}
