import type { CSSProperties } from "react";
import type { PublicTournamentSummary } from "@/lib/read-api-contract";
import { getAppTranslations } from "@/i18n/server";
import { registrationAvailability } from "@/lib/registration-reads";
import { archiveKeyVisual } from "@/lib/archive-key-visual";
import { seasonAppearanceFor, seasonNumber } from "@/lib/player-timeline";
import { seasonAccentPair } from "@/lib/season-accent";
import { Action, Badge } from "./ui";
import { EditionArtwork } from "./edition-artwork";
import PendingLink from "./pending-link";
import { formatDate, publicEditionSummary, type Edition } from "@/lib/editions";
import styles from "./edition-card.module.css";

const leagueName = "osu! Chinese League Rookie";

export async function EditionCard({
  edition,
  href,
}: {
  edition: Edition | PublicTournamentSummary;
  href?: string;
}) {
  const tr = await getAppTranslations();

  const historical = edition.status === "completed";
  const state = historical
    ? "closed"
    : "source" in edition
      ? (edition.registration?.state ?? "unannounced")
      : await registrationAvailability(edition);
  const summary = publicEditionSummary(edition.summary);
  const archive = "archive" in edition ? edition.archive : null;
  const artwork =
    edition.branding.logo ??
    (archive ? (archiveKeyVisual(archive, null)?.src ?? null) : null);
  const tournamentHref = href ?? `/tournaments/${edition.slug}`;
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
      className={`edition-card ${styles.card}${historical ? ` ${styles.historical}` : ` ${styles.current}`}`}
      style={
        accent
          ? ({
              "--edition-accent-light": accent.light,
              "--edition-accent-dark": accent.dark,
            } as CSSProperties)
          : undefined
      }
    >
      <PendingLink
        className="edition-card-link"
        href={tournamentHref}
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
            <span>{leagueName}</span>
          </div>
          <h2>{title}</h2>
        </div>
        {historical ? (
          <nav className={styles.links} aria-label={edition.name}>
            {links.map(({ path, label }) => (
              <PendingLink
                key={path}
                href={`/tournaments/${edition.slug}/${path}`}
              >
                {label}
              </PendingLink>
            ))}
          </nav>
        ) : (
          <div className={styles.registration}>
            {summary && summary !== `${leagueName} — ${title}.` && (
              <p className={`muted ${styles.summary}`}>{summary}</p>
            )}
            <div className={styles.registrationDetails}>
              {state === "open" ? (
                <div className="actions">
                  <Action href={`/tournaments/${edition.slug}/register`}>
                    {tr("Register")}
                  </Action>
                </div>
              ) : (
                <Badge>
                  {tr("Registration: ")}
                  {tr(state)}
                </Badge>
              )}
              <dl className={styles.facts}>
                <div>
                  <dt>{tr("Registration opens")}</dt>
                  <dd>
                    {tr(
                      formatDate(
                        edition.registration?.opensAt ?? null,
                        edition.timeZone,
                        tr.locale,
                      ),
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{tr("Registration closes")}</dt>
                  <dd>
                    {tr(
                      formatDate(
                        edition.registration?.closesAt ?? null,
                        edition.timeZone,
                        tr.locale,
                      ),
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
