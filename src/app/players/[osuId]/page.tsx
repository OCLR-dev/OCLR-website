import { PlayerEditionView } from "@/components/player-edition-view";
import { Avatar } from "@/components/avatar";
import { CountryFlag } from "@/components/country-flag";
import { PreviousUsernames } from "@/components/previous-usernames";
import { previousUsernames } from "@/lib/player-aliases";
import {
  participatedTournamentEditions,
  playerCompetitionRecord,
} from "@/lib/player-competition";
import {
  playerMapPerformance,
  summarizeMapPerformance,
  type PlayerMapPerformance,
} from "@/lib/player-map-performance";
import { publicPlayerMra } from "@/lib/player-leaderboard";
import {
  buildPlayerTimeline,
  type PlayerTimeline,
} from "@/lib/player-timeline";
import { getPublicEditions } from "@/lib/content";
import { historicalStaffHistory } from "@/lib/archive-staff-history";
import { archiveKeyVisual } from "@/lib/archive-key-visual";
import { getAppTranslations } from "@/i18n/server";
import { frontendProfile, frontendUsernameOwner } from "@/lib/frontend-data";
import { remoteMode } from "@/lib/data-source";
import { profileBws, profileBwsMany } from "@/lib/bws";
import { publicRoundRatings } from "@/lib/ratings";
import { remotePage } from "@/lib/remote-page";
import { notFound, redirect } from "next/navigation";
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
  // A numeric segment is the canonical UID; any other segment is resolved as a
  // released username and redirected to the UID it uniquely identifies.
  if (!/^[1-9]\d*$/.test(osuId) || !Number.isSafeInteger(Number(osuId))) {
    // Route params arrive percent-encoded; the name itself is what the
    // directory records, so decode before looking it up.
    let name = osuId;
    try {
      name = decodeURIComponent(osuId);
    } catch {
      // A malformed escape cannot name a released player.
    }
    const owner = await frontendUsernameOwner(name);
    if (!owner) notFound();
    redirect(`/players/${owner.osuId}${edition ? `?edition=${edition}` : ""}`);
  }
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
  const heading = (
    <header
      className={`${styles.heading}${
        aliases.length > 0 ? ` ${styles.headingWithAliases}` : ""
      }`}
    >
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
          {aliases.length > 0 && (
            <PreviousUsernames
              names={aliases}
              label={tr("Previous usernames")}
            />
          )}
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

  const [competition, mapPerformance, leaderboard, ratingsByEdition] =
    await Promise.all([
      participation.length ? playerCompetitionRecord(participation) : null,
      participation.length ? playerMapPerformance(participation) : null,
      participation.length
        ? publicPlayerMra(Number(osuId)).catch(() => null)
        : Promise.resolve(null),
      Promise.all(
        selectableEditions.map(async (entry) => {
          const playerId = Number(osuId);
          const rows = (await publicRoundRatings(entry.editionSlug))
            .filter((rating) =>
              rating.report.players.some(
                (person) => person.userId === playerId,
              ),
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

  const mra = leaderboard?.mra ?? null;

  // BWS review is edition-scoped, so each panel needs its own computation.
  // The remote adapter has no public badge-review resource; it keeps the
  // profile-wide value rather than issuing one full profile read per edition.
  const bwsByEdition: Record<
    string,
    Awaited<ReturnType<typeof profileBws>>
  > = {};
  if (data.snapshot) {
    if (remoteMode()) {
      for (const entry of selectableEditions)
        bwsByEdition[entry.editionSlug] = data.bws;
    } else {
      Object.assign(
        bwsByEdition,
        await profileBwsMany(
          data.snapshot,
          selectableEditions.map((entry) => entry.editionSlug),
        ),
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

  const editionPool = publishedEditions.map(
    ({ slug, season, branding, archive }) => ({
      slug,
      season,
      // Same cover the directory card shows: authored logo, else key visual.
      artwork:
        branding?.logo ||
        (archive ? (archiveKeyVisual(archive, null)?.src ?? null) : null),
    }),
  );
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
      staffHistory={historicalStaffHistory(
        data.identity.osuId,
        publishedEditions,
      ).reverse()}
      mapPerformance={mapPerformance}
      mapByEdition={mapByEdition}
      mra={mra}
      timelines={timelines}
      allTimeline={allTimeline}
      ratingsByEdition={ratingsByEdition}
    />
  );
}

export default function Profile(props: Parameters<typeof ProfileContent>[0]) {
  return remotePage(() => ProfileContent(props));
}
