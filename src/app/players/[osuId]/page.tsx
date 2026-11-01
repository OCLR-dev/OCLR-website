import { PlayerEditionView } from "@/components/player-edition-view";
import { Avatar } from "@/components/avatar";
import { CountryFlag } from "@/components/country-flag";
import { collapseAliases, previousUsernames } from "@/lib/player-aliases";
import {
  participatedTournamentEditions,
  playerCompetitionRecord,
} from "@/lib/player-competition";
import {
  playerMapPerformance,
  summarizeMapPerformance,
  type PlayerMapPerformance,
} from "@/lib/player-map-performance";
import {
  buildPlayerTimeline,
  type PlayerTimeline,
} from "@/lib/player-timeline";
import { getPublicEditions } from "@/lib/content";
import { getAppTranslations } from "@/i18n/server";
import { frontendProfile } from "@/lib/frontend-data";
import { remoteMode } from "@/lib/data-source";
import { profileBws } from "@/lib/bws";
import { publicRoundRatings } from "@/lib/ratings";
import { remotePage } from "@/lib/remote-page";
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
  const edition = typeof query.edition === "string" ? query.edition : null;
  let data: Awaited<ReturnType<typeof frontendProfile>>;
  let publishedEditions: Awaited<ReturnType<typeof getPublicEditions>>;
  try {
    [data, publishedEditions] = await Promise.all([
      frontendProfile(osuId),
      getPublicEditions(),
    ]);
  } catch (e) {
    if (e instanceof HttpError && [400, 404].includes(e.status)) notFound();
    throw e;
  }
  const profile = data.snapshot?.profile;
  const country = profile?.countryName ?? profile?.countryCode;
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
          <CountryFlag
            code={profile?.countryCode}
            decorative={Boolean(country)}
          />{" "}
          {country}
          {profile?.countryName && profile.countryCode
            ? ` (${profile.countryCode})`
            : ""}
        </p>
      </div>
    </header>
  );
  const participation = data.participation;
  const participatedEditions = participatedTournamentEditions(
    participation,
    publishedEditions,
  );
  const publishedSlugs = new Set(
    publishedEditions.map((published) => published.slug),
  );
  const selectableEditions = participatedEditions.filter((entry) =>
    publishedSlugs.has(entry.editionSlug),
  );
  // Keep the old filtered URLs bounded to a published edition this person
  // appears in; the strip may still show an unpublished fallback name.
  if (
    edition &&
    !selectableEditions.some((entry) => entry.editionSlug === edition)
  )
    notFound();

  const [competition, mapPerformance, ratingsByEdition] = await Promise.all([
    participation.length ? playerCompetitionRecord(participation) : null,
    participation.length ? playerMapPerformance(participation) : null,
    Promise.all(
      selectableEditions.map(async (entry) => {
        const playerId = Number(osuId);
        const rows = (await publicRoundRatings(entry.editionSlug))
          .filter((rating) =>
            rating.report.players.some((person) => person.userId === playerId),
          )
          .map((rating) => ({
            ...rating,
            report: {
              ...rating.report,
              players: rating.report.players.filter(
                (person) => person.userId === playerId,
              ),
            },
          }));
        return [entry.editionSlug, rows] as const;
      }),
    ).then(
      (entries) =>
        Object.fromEntries(entries) as Record<
          string,
          Awaited<ReturnType<typeof publicRoundRatings>>
        >,
    ),
  ]);

  // BWS review is edition-scoped, so each panel needs its own computation.
  // The remote adapter has no public badge-review resource; it keeps the
  // profile-wide value rather than issuing one full profile read per edition.
  const bwsByEdition: Record<string, Awaited<ReturnType<typeof profileBws>>> =
    {};
  if (data.snapshot) {
    if (remoteMode()) {
      for (const entry of selectableEditions)
        bwsByEdition[entry.editionSlug] = data.bws;
    } else {
      await Promise.all(
        selectableEditions.map(async (entry) => {
          bwsByEdition[entry.editionSlug] = await profileBws(
            data.snapshot!,
            entry.editionSlug,
          );
        }),
      );
    }
  }

  const mapByEdition: Record<string, PlayerMapPerformance> = {};
  if (mapPerformance) {
    for (const entry of selectableEditions) {
      mapByEdition[entry.editionSlug] = summarizeMapPerformance(
        mapPerformance.editions.filter(
          (season) => season.editionSlug === entry.editionSlug,
        ),
      );
    }
  }

  const editionPool = publishedEditions.map(({ slug, season }) => ({
    slug,
    season,
  }));
  const timelineInput = {
    editionPool,
    joinedAt: profile?.joinedAt,
    lastSeenAt: profile?.lastSeenAt,
  };
  const allTimeline = buildPlayerTimeline({
    editions: competition?.editions ?? [],
    ...timelineInput,
  });
  // The filtered timeline keeps every participated season's accent colour but
  // draws only the selected edition's match marks.
  const timelines: Record<string, PlayerTimeline> = {};
  for (const entry of selectableEditions) {
    const matches =
      competition?.editions.find(
        (record) => record.editionSlug === entry.editionSlug,
      )?.matches ?? [];
    timelines[entry.editionSlug] = buildPlayerTimeline({
      editions: participatedEditions.map((season) => ({
        ...season,
        matches: season.editionSlug === entry.editionSlug ? matches : [],
      })),
      ...timelineInput,
    });
  }

  const snapshot = data.snapshot
    ? {
        ...data.snapshot,
        profile: {
          ...data.snapshot.profile,
          username: data.identity.username,
          previousUsernames: aliases,
        },
      }
    : null;

  return (
    <PlayerEditionView
      osuId={osuId}
      editions={participatedEditions}
      initial={edition}
      snapshot={snapshot}
      heading={heading}
      bws={data.bws}
      bwsByEdition={bwsByEdition}
      competition={competition}
      mapPerformance={mapPerformance}
      mapByEdition={mapByEdition}
      timelines={timelines}
      allTimeline={allTimeline}
      ratingsByEdition={ratingsByEdition}
    />
  );
}

export default function Profile(props: Parameters<typeof ProfileContent>[0]) {
  return remotePage(() => ProfileContent(props));
}
