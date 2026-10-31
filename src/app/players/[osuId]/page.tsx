import { PlayerCompetition } from "@/components/player-competition";
import { PlayerMapPerformance } from "@/components/player-map-performance";
import { PlayerProfile } from "@/components/player-profile";
import { Avatar } from "@/components/avatar";
import { collapseAliases, previousUsernames } from "@/lib/player-aliases";
import { playerCompetitionRecord } from "@/lib/player-competition";
import { playerMapPerformance } from "@/lib/player-map-performance";
import { RoundRatings } from "@/components/round-ratings";
import { getAppTranslations } from "@/i18n/server";
import { frontendProfile } from "@/lib/frontend-data";
import { publicRoundRatings } from "@/lib/ratings";
import { remotePage } from "@/lib/remote-page";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "./profile.module.css";

import { HttpError } from "@/lib/http";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Player profile") };
}

async function ProfileContent({
  params,
  searchParams,
}: {
  params: Promise<{ osuId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tr = await getAppTranslations();

  const { osuId } = await params;
  const query = await searchParams;
  if (
    Object.keys(query).some((key) => key !== "edition") ||
    (query.edition !== undefined &&
      (typeof query.edition !== "string" ||
        !/^[a-z0-9-]+$/.test(query.edition)))
  )
    notFound();
  let data;
  try {
    data = await frontendProfile(osuId, query.edition as string | undefined);
  } catch (e) {
    if (e instanceof HttpError && [400, 404].includes(e.status)) notFound();
    throw e;
  }
  const profile = data.snapshot?.profile;
  const country = profile?.countryName ?? profile?.countryCode;
  const ratingHistory =
    typeof query.edition === "string"
      ? (await publicRoundRatings(query.edition))
          .filter((r) =>
            r.report.players.some((p) => p.userId === Number(osuId)),
          )
          .map((r) => ({
            ...r,
            report: {
              ...r.report,
              players: r.report.players.filter(
                (p) => p.userId === Number(osuId),
              ),
            },
          }))
      : [];
  // osu! supplies the aliases on the fetched profile; roster/archive names add to them.
  const aliases = previousUsernames(
    profile?.previousUsernames ?? [],
    data.identity.names.map((name) => name.username),
    data.identity.currentUsername ?? data.identity.username,
  );
  const aliasesInline = aliases.join(", ");
  const collapsedAliases = collapseAliases(aliases);
  const heading = (
    <header className={styles.heading}>
      <a
        href={data.identity.canonicalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${styles.identityLink} ${styles.avatarLink}`}
        aria-label={tr("View on osu! ↗")}
      >
        <Avatar
          osuId={data.identity.osuId}
          username={data.identity.username}
          avatarUrl={profile?.avatarUrl ?? undefined}
        />
      </a>
      <div className={styles.headingText}>
        <div className={styles.nameRow}>
          <h1>
            <a
              href={data.identity.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.identityLink}
            >
              {data.identity.username}
            </a>
          </h1>
          {aliases.length > 0 &&
            (collapsedAliases ? (
              <span className={styles.previousNames}>
                <button
                  type="button"
                  className={styles.previousNamesTrigger}
                  aria-label={tr("Previous usernames")}
                >
                  {tr("Previous usernames")} (+{aliases.length})
                  <svg
                    className={styles.previousNamesIcon}
                    viewBox="0 0 16 16"
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
                <ul className={styles.previousNamesList}>
                  {aliases.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </span>
            ) : (
              <span className={styles.previousNames}>
                {tr("Previous usernames")}: {aliasesInline}
              </span>
            ))}
        </div>
        <p className="muted">
          {country}
          {profile?.countryName && profile.countryCode
            ? ` (${profile.countryCode})`
            : ""}
        </p>
      </div>
    </header>
  );
  const [competition, mapPerformance] = data.participation.length
    ? await Promise.all([
        playerCompetitionRecord(data.participation),
        playerMapPerformance(data.participation),
      ])
    : [null, null];
  return (
    <div
      className={
        query.edition
          ? "public-tournament public-player-page"
          : "container page"
      }
    >
      <Link
        className="context-link"
        href={
          query.edition
            ? `/tournaments/${query.edition}/players`
            : "/tournaments"
        }
      >
        {query.edition ? tr("← Tournament players") : tr("← Tournaments")}
      </Link>
      {data.snapshot ? (
        <PlayerProfile
          heading={heading}
          snapshot={{
            ...data.snapshot,
            profile: {
              ...data.snapshot.profile,
              username: data.identity.username,
              previousUsernames: aliases,
            },
          }}
          bws={data.bws}
        />
      ) : (
        <>
          {heading}
          <p className="notice" role="status">
            {tr("osu! statistics are temporarily unavailable.")}
          </p>
        </>
      )}
      {typeof query.edition === "string" && (
        <RoundRatings data={ratingHistory} slug={query.edition} />
      )}
      {competition && (
        <PlayerCompetition
          record={competition}
          resetHref={
            typeof query.edition === "string" ? `/players/${osuId}` : null
          }
        />
      )}
      {mapPerformance && <PlayerMapPerformance record={mapPerformance} />}
    </div>
  );
}

export default function Profile(props: Parameters<typeof ProfileContent>[0]) {
  return remotePage(() => ProfileContent(props));
}
