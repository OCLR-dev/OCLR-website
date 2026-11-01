"use client";

import { InfoNote } from "@/components/info-note";

import { useAppTranslations } from "@/i18n/shared";

import { useEffect, useState } from "react";
import type {
  BeatmapSnapshot,
  DifficultyConfiguration,
} from "@/lib/mappool-model";
import { BeatmapDetails } from "./beatmap-details";
export function BeatmapPreview({
  id,
  url,
  onReady,
  difficultyConfiguration = null,
  showDetails = true,
}: {
  id: number;
  difficultyConfiguration?: DifficultyConfiguration | null;
  showDetails?: boolean;
  url: string;
  onReady: (snapshot: BeatmapSnapshot | null) => void;
}) {
  const tr = useAppTranslations();

  const [result, setResult] = useState<{
    snapshot?: BeatmapSnapshot;
    error?: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            beatmap: String(id),
            difficultyConfiguration,
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Beatmap lookup failed. Please retry.");
        if (data.beatmapId !== id)
          throw new Error(
            "The beatmap response did not match your input. Please retry.",
          );
        if (active) {
          setResult({ snapshot: data });
          onReady(data);
        }
      } catch (error) {
        if (active) {
          setResult({
            error:
              error instanceof Error
                ? error.message
                : "Beatmap lookup is unavailable. Please retry.",
          });
          onReady(null);
        }
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [id, url, attempt, onReady, difficultyConfiguration]);
  if (result?.snapshot && !showDetails) return null;
  return (
    <div
      aria-label={tr("Beatmap preview")}
      aria-busy={!result}
      className="stack"
      aria-live="polite"
    >
      {!result && (
        <p role="status" className="muted small">
          {tr("Looking up beatmap ")}
          {id}…
        </p>
      )}
      {result?.error && (
        <>
          <p role="alert" className="notice error-text">
            {tr(result.error)}
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              onReady(null);
              setResult(null);
              setAttempt((a) => a + 1);
            }}
          >
            {tr("Retry beatmap lookup")}
          </button>
        </>
      )}
      {result?.snapshot && (
        <>
          <BeatmapDetails {...result.snapshot} />
          <InfoNote>
            <p className="muted small">
              {tr(
                "Base ratings and any explicitly configured official attributes are labeled separately. BPM and duration describe the base map.",
              )}
            </p>
          </InfoNote>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              onReady(null);
              setResult(null);
              setAttempt((a) => a + 1);
            }}
          >
            {tr("Refresh preview")}
          </button>
        </>
      )}
    </div>
  );
}
