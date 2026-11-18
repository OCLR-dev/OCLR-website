"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  liruDrawSize,
  liruGachaPath,
  liruGachaStatusSchema,
  liruRarityRates,
  type LiruGachaAction,
  type LiruGachaStatus,
} from "@/lib/liru-gacha-model";
import type { WikiGalleryFigure } from "@/lib/wiki-articles";
import { WikiGalleryCard } from "./wiki-gallery-card";
import { countLiruCards, LiruCardDisplay } from "./liru-card-display";
import styles from "./liru-card-display.module.css";

async function loadStatus(signal?: AbortSignal) {
  const response = await fetch(liruGachaPath, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Could not load draw status");
  return liruGachaStatusSchema.parse(await response.json());
}

export function LiruGacha({
  profileHref,
  figures,
}: {
  profileHref?: string;
  figures: WikiGalleryFigure[];
}) {
  const tr = useAppTranslations();
  const [status, setStatus] = useState<LiruGachaStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const showcase = figures.find((figure) =>
    figure.src.endsWith("/galaxy-dream.webp"),
  );

  useEffect(() => {
    if (!profileHref) return;
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
  }, [profileHref]);

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
      <div className="liru-gacha-stage">
        <div className="liru-gacha-copy">
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
          <div className="liru-gacha-action" aria-busy={busy}>
            {!profileHref ? (
              <Link className="liru-gacha-primary" href="/login">
                {tr("Sign in with osu!")}
              </Link>
            ) : status?.cards ? (
              <button
                className="liru-gacha-primary"
                type="button"
                onClick={() => void act()}
                disabled={busy}
              >
                {tr("Refresh")}
              </button>
            ) : status ? (
              <button
                className="liru-gacha-primary"
                type="button"
                onClick={() => void act(status.checkedIn ? "draw" : "check-in")}
                disabled={busy}
              >
                {status.checkedIn ? tr("Draw 10 cards") : tr("Daily check-in")}
              </button>
            ) : error ? (
              <button
                className="liru-gacha-primary"
                type="button"
                onClick={() => void act()}
                disabled={busy}
              >
                {tr("Try again")}
              </button>
            ) : (
              <span className="liru-gacha-status" role="status">
                {tr("Loading…")}
              </span>
            )}
            <span className="liru-gacha-status" role="status">
              {status?.cards
                ? tr("Today's ten-pull is complete.")
                : status?.checkedIn
                  ? tr("One ten-pull available.")
                  : ""}
            </span>
            {profileHref && (
              <Link className="text-link" href={profileHref} prefetch={false}>
                {tr("View my Liru gallery")}
              </Link>
            )}
            {error && (
              <span role="alert">
                {tr("This request could not be completed. Please try again.")}
              </span>
            )}
          </div>
        </div>
        {showcase && (
          <div className="liru-gacha-art" aria-hidden="true">
            <div className="liru-gacha-orbit" />
            <div className="liru-gacha-card-back liru-gacha-card-back-left" />
            <div className="liru-gacha-card-back liru-gacha-card-back-right" />
            <div className="liru-gacha-featured-card">
              <WikiGalleryCard figure={showcase} cardRef={null} />
            </div>
          </div>
        )}
      </div>
      {status?.cards && (
        <LiruCardDisplay
          title={tr("Results")}
          headingId="liru-gacha-results-title"
          counts={countLiruCards(status.cards)}
        >
          <ol
            className={`liru-gacha-results ${styles.cards} ${styles.results}`}
            role="list"
          >
            {status.cards.map(({ src, rarity }, index) => {
              const figure = figures.find((item) => item.src === src);
              const guaranteed = index === liruDrawSize - 1;
              return (
                <li
                  className={styles.card}
                  key={`${status.day}:${index}`}
                  data-rarity={rarity}
                  data-guaranteed={guaranteed ? "" : undefined}
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className={styles.surface}>
                    {figure ? (
                      <WikiGalleryCard
                        figure={{ ...figure, rarity }}
                        cardRef={null}
                      />
                    ) : (
                      <span>{rarity}</span>
                    )}
                  </div>
                  <div className={styles.caption}>
                    <span className={styles.ordinal} aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className={styles.name}>
                      {figure?.caption ?? rarity}
                    </span>
                    {figure && <span className="sr-only"> ({rarity})</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        </LiruCardDisplay>
      )}
    </section>
  );
}
