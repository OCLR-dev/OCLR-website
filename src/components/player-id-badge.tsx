"use client";

import { useEffect, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";

/**
 * The mappool beatmap-id pill, reused for the player's osu! id on their profile
 * card. Clicking copies the id; the rank tier gradient scrolls underneath.
 */
export function PlayerIdBadge({
  osuId,
  palette,
  className,
}: {
  osuId: number;
  palette: { from: string; to: string; ink: string } | null;
  className?: string;
}) {
  const tr = useAppTranslations();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(String(osuId));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <>
      <button
        type="button"
        className={[
          "profile-id-badge",
          palette ? "profile-id-badge--tier" : "",
          copyState === "copied" ? "profile-id-badge--copied" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          palette
            ? ({
                "--rank-tier-from": palette.from,
                "--rank-tier-to": palette.to,
                "--profile-id-ink": palette.ink,
              } as React.CSSProperties)
            : undefined
        }
        title={
          copyState === "failed"
            ? tr("Could not copy the player ID.")
            : tr("Copy player ID")
        }
        aria-label={`${tr("Copy player ID")}: ${osuId}`}
        onClick={() => void copyId()}
      >
        <span className="profile-id-badge-value">#{osuId}</span>
        {copyState === "copied" ? (
          <svg
            className="profile-id-badge-icon"
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
          <span className="profile-id-badge-error">
            {tr("Could not copy the player ID.")}
          </span>
        ) : (
          <svg
            className="profile-id-badge-icon"
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
      <span className="sr-only" role="status">
        {copyState === "copied"
          ? tr("Player ID copied.")
          : copyState === "failed"
            ? tr("Could not copy the player ID.")
            : ""}
      </span>
    </>
  );
}
