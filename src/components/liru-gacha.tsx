"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  liruGachaPath,
  liruGachaStatusSchema,
  liruRarityRates,
  type LiruGachaAction,
  type LiruGachaStatus,
} from "@/lib/liru-gacha-model";
import type { WikiGalleryFigure } from "@/lib/wiki-articles";
import { WikiGalleryCard } from "./wiki-gallery-card";

async function loadStatus(signal?: AbortSignal) {
  const response = await fetch(liruGachaPath, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Could not load draw status");
  return liruGachaStatusSchema.parse(await response.json());
}

export function LiruGacha({
  signedIn,
  figures,
}: {
  signedIn: boolean;
  figures: WikiGalleryFigure[];
}) {
  const tr = useAppTranslations();
  const [status, setStatus] = useState<LiruGachaStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    const abort = new AbortController();
    void loadStatus(abort.signal).then(
      (result) => {
        if (!abort.signal.aborted) setStatus(result);
      },
      () => {
        if (!abort.signal.aborted) setError(true);
      },
    );
    return () => abort.abort();
  }, [signedIn]);

  async function act(action?: LiruGachaAction["action"]) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      if (!action || !status) {
        setStatus(await loadStatus());
        return;
      }
      const response = await fetch(liruGachaPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, day: status.day }),
      });
      if (response.status === 409) {
        // A midnight rollover or a check-in in another tab changes the action.
        setStatus(await loadStatus());
        return;
      }
      if (!response.ok) throw new Error("Could not update draw status");
      setStatus(liruGachaStatusSchema.parse(await response.json()));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="liru-gacha" aria-labelledby="liru-gacha-title">
      <div className="liru-gacha-header">
        <div>
          <h2 id="liru-gacha-title">{tr("Liru daily draw")}</h2>
          <p>
            {tr(
              "Check in for one ten-pull to use that day. Resets daily at 00:00 (UTC+8).",
            )}
          </p>
          <ul className="liru-gacha-odds">
            {Object.entries(liruRarityRates).map(([rarity, rate]) => (
              <li key={rarity} data-rarity={rarity}>
                {rarity} <strong>{rate}%</strong>
              </li>
            ))}
          </ul>
          <p>{tr("The tenth card is SR or higher: UR 4%, SSR 6%, SR 90%.")}</p>
        </div>
        <div className="liru-gacha-action" aria-busy={busy}>
          {!signedIn ? (
            <Link className="text-link" href="/login">
              {tr("Sign in with osu!")}
            </Link>
          ) : status?.cards ? (
            <button type="button" onClick={() => void act()} disabled={busy}>
              {tr("Refresh")}
            </button>
          ) : status ? (
            <button
              type="button"
              onClick={() => void act(status.checkedIn ? "draw" : "check-in")}
              disabled={busy}
            >
              {status.checkedIn ? tr("Draw 10 cards") : tr("Daily check-in")}
            </button>
          ) : error ? (
            <button type="button" onClick={() => void act()} disabled={busy}>
              {tr("Try again")}
            </button>
          ) : (
            <span role="status">{tr("Loading…")}</span>
          )}
          <span role="status">
            {status?.cards
              ? tr("Today's ten-pull is complete.")
              : status?.checkedIn
                ? tr("One ten-pull available.")
                : ""}
          </span>
          {error && (
            <span role="alert">
              {tr("This request could not be completed. Please try again.")}
            </span>
          )}
        </div>
      </div>
      {status?.cards && (
        <ol className="liru-gacha-results">
          {status.cards.map(({ src, rarity }, index) => {
            const figure = figures.find((item) => item.src === src);
            return (
              <li key={`${status.day}:${index}`}>
                {figure ? (
                  <>
                    <WikiGalleryCard
                      figure={{ ...figure, rarity }}
                      cardRef={null}
                    />
                    <span className="sr-only">
                      {figure.caption} ({rarity})
                    </span>
                  </>
                ) : (
                  <span>{rarity}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
