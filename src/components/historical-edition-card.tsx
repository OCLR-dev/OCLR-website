import type { CSSProperties } from "react";
import type { PublicTournamentSummary } from "@/lib/read-api-contract";
import type { Edition } from "@/lib/editions";
import { getAppTranslations } from "@/i18n/server";
import { archiveKeyVisual } from "@/lib/archive-key-visual";
import { seasonAppearanceFor, seasonNumber } from "@/lib/player-timeline";
import { seasonAccentPair } from "@/lib/season-accent";
import { EditionArtwork } from "./edition-artwork";
import Link from "./pending-link";
import styles from "./historical-edition-card.module.css";

export async function HistoricalEditionCard({
  edition,
  href,
}: {
  edition: Edition | PublicTournamentSummary;
  href?: string;
}) {
  const tr = await getAppTranslations();
  const base = `/tournaments/${edition.slug}`;
  const archive = "archive" in edition ? edition.archive : null;
  const artwork =
    edition.branding.logo ??
    (archive ? (archiveKeyVisual(archive, null)?.src ?? null) : null);
  const accent = seasonAccentPair(seasonAppearanceFor(edition.season));
  const season = seasonNumber(edition.season);
  const title = season === null ? edition.name : `Season ${season}`;
  const links = [
    { path: "teams", label: tr("Teams") },
    { path: "players", label: tr("Players") },
    { path: "schedule", label: tr("Matches") },
    { path: "mappools", label: tr("Pools") },
    { path: "statistics", label: tr("Statistics") },
  ];
  return (
    <article
      className={`edition-card ${styles.card}`}
      style={
        accent
          ? ({
              "--edition-accent-light": accent.light,
              "--edition-accent-dark": accent.dark,
            } as CSSProperties)
          : undefined
      }
    >
      <Link
        className="edition-card-link"
        href={href ?? base}
        aria-label={`${tr("View tournament")}: ${edition.name}`}
      />
      <span className="edition-card-glow" aria-hidden="true" />
      <div className={styles.artwork}>
        <EditionArtwork slug={edition.slug} logo={artwork} />
      </div>
      <div className={styles.content}>
        <div className={styles.heading}>
          <div className={styles.brand}>
            <strong>OCLR</strong>
            <span>osu! Chinese League Rookie</span>
          </div>
          <h2>{title}</h2>
        </div>
        <nav className={styles.links} aria-label={edition.name}>
          {links.map(({ path, label }) => (
            <Link key={path} href={`${base}/${path}`}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </article>
  );
}
