"use client";

import Link from "next/link";
import type { CSSProperties, MouseEvent } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { seasonArtworkPair } from "@/lib/season-artwork";
import type { ParticipatedTournamentEdition } from "@/lib/player-competition";
import { seasonAppearances, type SeasonAppearance } from "@/lib/preferences";
import { trophyEditionLabel } from "./player-trophy";
import styles from "./player-participated-tournaments.module.css";

function isSeasonAppearance(
  appearance: ParticipatedTournamentEdition["defaultAppearance"],
): appearance is SeasonAppearance {
  return (
    appearance !== null &&
    appearance !== undefined &&
    (seasonAppearances as readonly string[]).includes(appearance)
  );
}

/**
 * The player's tournaments as one horizontal strip. The parent may handle a
 * plain click without a navigation, so every card keeps a real href for new
 * tabs and for the editions the parent cannot switch to in place.
 */
export function PlayerParticipatedTournaments({
  editions,
  osuId,
  selected,
  onSelect,
}: {
  editions: ParticipatedTournamentEdition[];
  osuId: string;
  selected?: string | null;
  /** Return true when the parent handled the switch; false lets the href load. */
  onSelect?: (slug: string | null) => boolean;
}) {
  const tr = useAppTranslations();
  if (!editions.length) return null;
  const filtered = Boolean(selected);
  const choose = (
    event: MouseEvent<HTMLAnchorElement>,
    slug: string | null,
  ) => {
    if (!onSelect || event.defaultPrevented) return;
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (onSelect(slug)) event.preventDefault();
  };
  return (
    <section className="spaced" aria-labelledby="participated-tournaments">
      <div className={styles.titleRow}>
        <h2 id="participated-tournaments">{tr("Participated tournaments")}</h2>
      </div>
      <ul className={styles.row} data-filtered={filtered || undefined}>
        <li
          className={styles.allSlot}
          data-open={filtered || undefined}
          aria-hidden={filtered ? undefined : true}
          inert={!filtered}
        >
          <div className={styles.allContents}>
            <Link
              className={`button ${styles.showAll}`}
              href={`/players/${osuId}`}
              onClick={(event) => choose(event, null)}
              tabIndex={filtered ? undefined : -1}
            >
              {tr("Show all seasons")}
            </Link>
            <span aria-hidden="true" className={styles.divider} />
          </div>
        </li>
        {editions.map((edition) => {
          const artwork = isSeasonAppearance(edition.defaultAppearance)
            ? seasonArtworkPair(edition.defaultAppearance)
            : null;
          const current = edition.editionSlug === selected;
          return (
            <li key={edition.editionSlug}>
              <Link
                className={`${styles.card} ${current ? styles.selected : ""}`}
                href={`/players/${osuId}?edition=${edition.editionSlug}`}
                aria-current={current ? "page" : undefined}
                onClick={(event) => choose(event, edition.editionSlug)}
                style={
                  {
                    "--card-art-light": artwork
                      ? `url("${artwork.light}")`
                      : "none",
                    "--card-art-dark": artwork
                      ? `url("${artwork.dark}")`
                      : "none",
                  } as CSSProperties
                }
              >
                <span className={styles.art} aria-hidden="true" />
                <span className={styles.label}>
                  {trophyEditionLabel(edition, tr)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
