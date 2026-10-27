import { archiveMatchDetails } from "./match-details-model";
import { ratingSnapshot } from "./ratings";
import type { RatingGame } from "./yumu-rating";
import { db } from "@/db";
import { editionEvents, editionState, historicalStatistics } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  archiveMpId,
  canExcludeNonParticipantScore,
  canExcludeStatisticsBenchScore,
  fixtureStatisticsIssues,
  projectStatistics,
  statisticsFixtures,
  statisticsGameIssues,
  supportsArchiveStatistics,
  suggestStatisticsPool,
  validStatisticsExclusions,
  type StatisticsSnapshot,
} from "./archive-statistics-model";
import type { User } from "./auth/sessions";
import {
  assertCapability,
  assertReadCapability,
  hasCapability,
} from "./auth/staff";
import { remoteMode } from "./data-source";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import type { HistoricalArchive } from "./historical-archive";
import { HttpError } from "./http";
import { matchSourceSchema } from "./match-model";
import { fetchMatchSource } from "./osu-matches";
import { readTournament } from "./tournaments";

const excludedScoresSchema = z
  .array(
    z
      .object({
        gameId: z.number().int().positive(),
        osuId: z.number().int().positive(),
        reason: z.literal("non-participant").optional(),
      })
      .strict(),
  )
  .max(32000);
const snapshotSchema = z
  .object({
    archiveKey: z.string().regex(/^[a-f0-9]{64}$/),
    source: matchSourceSchema,
    poolId: z.string().max(80),
    included: z.array(z.number().int().positive()).max(500),
    allowUnlistedMaps: z.boolean().optional(),
    excludedScores: excludedScoresSchema.optional(),
    rosterTeamGames: z.array(z.number().int().positive()).max(500).optional(),
    technicalAdjudication: z.boolean().optional(),
  })
  .strict();
const integer = z.number().int().nonnegative();
const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("import"),
      mpId: integer.positive(),
      expectedVersion: integer,
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      mpId: integer.positive(),
      expectedVersion: integer,
      poolId: z.string().max(80),
      included: z.array(integer.positive()).max(500),
      allowUnlistedMaps: z.boolean().default(false),
      excludedScores: excludedScoresSchema.default([]),
      rosterTeamGames: z.array(integer.positive()).max(500).default([]),
      technicalAdjudication: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      action: z.enum(["publish", "withdraw"]),
      fixtureId: z.string().max(80),
      expectedVersions: z.record(z.string(), integer),
      confirmed: z.literal(true),
    })
    .strict(),
]);
type Reader = Pick<ReturnType<typeof db>, "select">;
export function statisticsArchiveKey(a: HistoricalArchive) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        editionSlug: a.editionSlug,
        teams: a.teams.map(({ id, name }) => ({ id, name })),
        players: a.players.map(({ osuId, username, teamId, role, tier }) => ({
          osuId,
          username,
          teamId,
          role,
          tier,
        })),
        matches: a.matches.map(
          ({
            id,
            label,
            stage,
            teamA,
            teamB,
            scheduledAt,
            score,
            forfeitWinner,
            mpUrls,
          }) => ({
            id,
            label,
            stage,
            teamA,
            teamB,
            scheduledAt,
            score,
            forfeitWinner,
            mpUrls,
          }),
        ),
        pools: a.pools.map(({ id, maps }) => ({
          id,
          maps: maps.map(({ beatmapId, title, slot }) => ({
            beatmapId,
            title,
            slot,
          })),
        })),
      }),
    )
    .digest("hex");
}
async function archiveFor(
  slug: string,
  reader: Reader = db(),
  publicOnly = false,
) {
  const t = await readTournament(slug, reader, publicOnly);
  if (!supportsArchiveStatistics(slug) || !t?.edition.archive)
    throw new HttpError(404, "Historical statistics are unavailable.");
  return t.edition.archive;
}
function where(slug: string) {
  return eq(historicalStatistics.editionSlug, slug);
}
async function stored(slug: string, reader: Reader = db()) {
  const rows = await reader
    .select()
    .from(historicalStatistics)
    .where(where(slug));
  return rows.map((r) => ({
    ...r,
    draft: snapshotSchema.parse(r.draft),
    published: r.published ? snapshotSchema.parse(r.published) : null,
  }));
}

/** Called only by explicit Admin roster confirmation under the edition lock. */
export async function preserveStatisticsForRosterAddition(
  tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
  actor: User,
  before: HistoricalArchive,
  after: HistoricalArchive,
) {
  await assertCapability(actor, "approve_results", before.editionSlug, tx);
  // Never offer this as a general way to bless a changed archive key.
  const { players: oldPlayers, sourceFacts: _oldFacts, ...oldRest } = before;
  const { players: newPlayers, sourceFacts: _newFacts, ...newRest } = after;
  void _oldFacts;
  void _newFacts;
  if (
    !isDeepStrictEqual(oldRest, newRest) ||
    newPlayers.length !== oldPlayers.length + 1 ||
    !isDeepStrictEqual(oldPlayers, newPlayers.slice(0, oldPlayers.length))
  )
    throw new HttpError(409, "Archive changed. Reload before retrying.");
  const oldKey = statisticsArchiveKey(before);
  const newKey = statisticsArchiveKey(after);
  const rows = await stored(before.editionSlug, tx);
  const unchanged = (fixtureId: string, s: StatisticsSnapshot) => {
    if (
      s.archiveKey !== oldKey ||
      !statisticsFixtures(after).some(
        (f) =>
          f.id === fixtureId &&
          f.mpUrls.some((u) => archiveMpId(u) === s.source.match.id),
      ) ||
      [before, after].some((a) => !validStatisticsExclusions(s, a, fixtureId)) ||
      (!after.pools.some((p) => p.id === s.poolId) &&
        !(s.allowUnlistedMaps && s.poolId === "")) ||
      new Set(s.included).size !== s.included.length ||
      new Set(s.rosterTeamGames ?? []).size !==
        (s.rosterTeamGames ?? []).length ||
      (s.rosterTeamGames ?? []).some(
        (id) => !s.source.games.some((g) => g.id === id),
      ) ||
      s.included.some((id) => {
        const g = s.source.games.find((g) => g.id === id);
        return (
          !g ||
          [before, after].some(
            (a) =>
              statisticsGameIssues(
                a,
                fixtureId,
                s.poolId,
                g,
                s.allowUnlistedMaps,
                s.excludedScores,
                s.rosterTeamGames?.includes(id),
              ).length,
          )
        );
      })
    )
      return false;
    return isDeepStrictEqual(
      projectStatistics(before, fixtureId, s),
      projectStatistics(after, fixtureId, s),
    );
  };
  for (const fixture of statisticsFixtures(before)) {
    const released = rows.filter(
      (r) => r.fixtureId === fixture.id && r.published?.archiveKey === oldKey,
    );
    if (!released.length) continue;
    const snapshots = released.map((r) => r.published!);
    if (
      released.some((r) => !unchanged(r.fixtureId, r.published!)) ||
      [before, after].some(
        (a) => fixtureStatisticsIssues(a, fixture.id, snapshots).length,
      )
    )
      throw new HttpError(
        409,
        "Published statistics would change. Review or withdraw them before confirming this substitute.",
      );
  }
  const versions = [];
  for (const row of rows) {
    const draft = unchanged(row.fixtureId, row.draft)
      ? { ...row.draft, archiveKey: newKey }
      : row.draft;
    const published =
      row.published?.archiveKey === oldKey
        ? { ...row.published, archiveKey: newKey }
        : row.published;
    // A current published snapshot must have been fully checked above.
    if (
      row.published?.archiveKey === oldKey &&
      !unchanged(row.fixtureId, row.published)
    )
      throw new HttpError(
        409,
        "Published statistics would change. Review or withdraw them before confirming this substitute.",
      );
    if (draft === row.draft && published === row.published) continue;
    await tx
      .update(historicalStatistics)
      .set({
        draft,
        published,
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(where(before.editionSlug), eq(historicalStatistics.mpId, row.mpId)),
      );
    versions.push({
      mpId: row.mpId,
      fromVersion: row.version,
      toVersion: row.version + 1,
      draft: draft !== row.draft,
      published: published !== row.published,
    });
  }
  if (versions.length)
    await tx.insert(editionEvents).values({
      editionSlug: before.editionSlug,
      actorId: actor.osuId,
      kind: "statistics_roster_revalidation",
      detail: { oldKey, newKey, versions },
    });
}
async function databaseStatisticsWorkspace(
  actor: User,
  slug: string,
  fixtureId = "",
) {
  await assertReadCapability(actor, "record_results", slug);
  const archive = await archiveFor(slug);
  const key = statisticsArchiveKey(archive);
  const rows = (await stored(slug)).filter((r) =>
    statisticsFixtures(archive).some(
      (f) =>
        f.id === r.fixtureId && f.mpUrls.some((u) => archiveMpId(u) === r.mpId),
    ),
  );
  const summaries = rows.map((r) => ({
    mpId: r.mpId,
    fixtureId: r.fixtureId,
    version: r.version,
    importedAt: r.draft.source.fetchedAt,
    publishedAt:
      r.published?.archiveKey === key
        ? (r.publishedAt?.toISOString() ?? null)
        : null,
    changes:
      !r.published ||
      r.published.source.fingerprint !== r.draft.source.fingerprint ||
      r.published.poolId !== r.draft.poolId ||
      r.published.allowUnlistedMaps !== r.draft.allowUnlistedMaps ||
      JSON.stringify(r.published.excludedScores ?? []) !==
        JSON.stringify(r.draft.excludedScores ?? []) ||
      !!r.published.technicalAdjudication !== !!r.draft.technicalAdjudication ||
      JSON.stringify(r.published.rosterTeamGames ?? []) !==
        JSON.stringify(r.draft.rosterTeamGames ?? []) ||
      JSON.stringify(r.published.included) !== JSON.stringify(r.draft.included),
    stale: r.draft.archiveKey !== key,
  }));
  const fixtures = statisticsFixtures(archive).map((m) => ({
    id: m.id,
    label: m.label,
    stage: m.stage,
    score: m.score,
    teams: [m.teamA, m.teamB].map(
      (id) => archive.teams.find((t) => t.id === id)!.name,
    ),
    mpIds: m.mpUrls.map(archiveMpId),
  }));
  return {
    slug,
    fixtures,
    summaries,
    canPublish: await hasCapability(actor, "approve_results", slug),
    pools: archive.pools.map(({ id, name }) => ({ id, name })),
    reviews: rows
      .filter((r) => r.fixtureId === fixtureId)
      .map((r) => ({
        mpId: r.mpId,
        version: r.version,
        poolId: r.draft.poolId,
        allowUnlistedMaps: r.draft.allowUnlistedMaps ?? false,
        excludedScores: r.draft.excludedScores ?? [],
        rosterTeamGames: r.draft.rosterTeamGames ?? [],
        technicalAdjudication: r.draft.technicalAdjudication ?? false,
        complete: r.draft.source.complete,
        fetchedAt: r.draft.source.fetchedAt,
        warnings: r.draft.source.warnings,
        games: r.draft.source.games.map((game) => ({
          game,
          included: r.draft.included.includes(game.id),
          nonParticipantIds: game.scores
            .filter(
              (score) =>
                canExcludeNonParticipantScore(archive, r.fixtureId, score) ||
                canExcludeStatisticsBenchScore(
                  archive,
                  r.fixtureId,
                  game,
                  score,
                  (r.draft.excludedScores ?? [])
                    .filter((e) => e.gameId === game.id)
                    .map((e) => e.osuId),
                ),
            )
            .map((score) => score.osuId!),
          issues: statisticsGameIssues(
            archive,
            r.fixtureId,
            r.draft.poolId,
            game,
            r.draft.allowUnlistedMaps,
            r.draft.excludedScores,
            r.draft.rosterTeamGames?.includes(game.id),
          ),
        })),
      })),
    blockers: fixtureId
      ? fixtureStatisticsIssues(
          archive,
          fixtureId,
          rows.filter((r) => r.fixtureId === fixtureId).map((r) => r.draft),
        )
      : [],
  };
}
export async function statisticsWorkspace(
  actor: User,
  slug: string,
  fixtureId = "",
): Promise<Awaited<ReturnType<typeof databaseStatisticsWorkspace>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<
      Awaited<ReturnType<typeof databaseStatisticsWorkspace>>
    >("statisticsWorkspace", { slug, fixtureId });
  }
  return databaseStatisticsWorkspace(actor, slug, fixtureId);
}

export type StatisticsWorkspace = Awaited<
  ReturnType<typeof statisticsWorkspace>
>;

export async function statisticsCommand(
  actor: User,
  slug: string,
  input: unknown,
) {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Invalid statistics request.");
  const c = parsed.data;
  const permission =
    c.action === "publish" || c.action === "withdraw"
      ? "approve_results"
      : "record_results";
  await assertCapability(actor, permission, slug);
  if (
    c.action === "review" &&
    (c.technicalAdjudication ||
      c.rosterTeamGames.length ||
      c.excludedScores.some((e) => e.reason === "non-participant"))
  )
    await assertCapability(actor, "approve_results", slug);
  const archive = await archiveFor(slug);
  const key = statisticsArchiveKey(archive);
  const fixture = statisticsFixtures(archive).find((m) =>
    "mpId" in c
      ? m.mpUrls.some((u) => archiveMpId(u) === c.mpId)
      : m.id === c.fixtureId,
  );
  if (!fixture)
    throw new HttpError(
      400,
      "Use an MP link already recorded in this edition.",
    );
  let imported: StatisticsSnapshot | undefined;
  if (c.action === "import") {
    const existing = (await stored(slug)).find((r) => r.mpId === c.mpId);
    if ((existing?.version ?? 0) !== c.expectedVersion)
      throw new HttpError(409, "Statistics changed. Reload before retrying.");
    if (
      existing &&
      Date.now() - Date.parse(existing.draft.source.fetchedAt) < 30_000
    )
      throw new HttpError(429, "Wait before refreshing this MP.");
    // Provider calls occur outside the DB transaction; all authority is checked again below.
    const source = await fetchMatchSource(c.mpId);
    if (
      source.games.length > 500 ||
      Buffer.byteLength(JSON.stringify(source)) > 2_000_000
    )
      throw new HttpError(413, "MP statistics exceed the import limit.");
    const poolId = suggestStatisticsPool(archive, source);
    imported = { archiveKey: key, source, poolId, included: [] };
  }
  await db().transaction(async (tx) => {
    await tx
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await assertCapability(actor, permission, slug, tx);
    if (
      c.action === "review" &&
      (c.technicalAdjudication ||
        c.rosterTeamGames.length ||
        c.excludedScores.some((e) => e.reason === "non-participant"))
    )
      await assertCapability(actor, "approve_results", slug, tx);
    const currentArchive = await archiveFor(slug, tx);
    if (statisticsArchiveKey(currentArchive) !== key)
      throw new HttpError(409, "Archive changed. Reload before retrying.");
    const rows = await stored(slug, tx);
    const relevant = rows.filter(
      (r) =>
        r.fixtureId === fixture.id &&
        fixture.mpUrls.some((u) => archiveMpId(u) === r.mpId),
    );
    const selected =
      "mpId" in c ? rows.find((r) => r.mpId === c.mpId) : undefined;
    if (
      "expectedVersion" in c &&
      (selected?.version ?? 0) !== c.expectedVersion
    )
      throw new HttpError(409, "Statistics changed. Reload before retrying.");
    if (
      selected &&
      selected.fixtureId !== fixture.id &&
      selected.draft.archiveKey === key
    )
      throw new HttpError(409, "Archive changed. Reload before retrying.");
    if (c.action === "import") {
      if (
        selected &&
        selected.draft.archiveKey === key &&
        selected.draft.source.fingerprint === imported!.source.fingerprint
      )
        return;
      if (selected)
        await tx
          .update(historicalStatistics)
          .set({
            fixtureId: fixture.id,
            draft: imported!,
            version: selected.version + 1,
            updatedAt: new Date(),
          })
          .where(and(where(slug), eq(historicalStatistics.mpId, c.mpId)));
      else
        await tx.insert(historicalStatistics).values({
          editionSlug: slug,
          mpId: c.mpId,
          fixtureId: fixture.id,
          version: 1,
          draft: imported!,
        });
    } else if (c.action === "review") {
      if (!selected || selected.draft.archiveKey !== key)
        throw new HttpError(409, "Import the current archive MP first.");
      const draft = {
        ...selected.draft,
        poolId: c.poolId,
        included: c.included,
        allowUnlistedMaps: c.allowUnlistedMaps,
        excludedScores: c.excludedScores,
        rosterTeamGames: c.rosterTeamGames,
        technicalAdjudication: c.technicalAdjudication,
      };
      if (
        !validStatisticsExclusions(draft, archive, fixture.id) ||
        new Set(c.rosterTeamGames).size !== c.rosterTeamGames.length ||
        c.rosterTeamGames.some(
          (id) => !draft.source.games.some((g) => g.id === id),
        ) ||
        (!archive.pools.some((p) => p.id === c.poolId) &&
          !(c.allowUnlistedMaps && c.poolId === "")) ||
        new Set(c.included).size !== c.included.length ||
        c.included.some((id) => {
          const game = draft.source.games.find((g) => g.id === id);
          return (
            !game ||
            statisticsGameIssues(
              archive,
              fixture.id,
              c.poolId,
              game,
              c.allowUnlistedMaps,
              c.excludedScores,
              c.rosterTeamGames.includes(id),
            ).length > 0
          );
        })
      )
        throw new HttpError(
          400,
          "Only eligible recorded games can be selected.",
        );
      await tx
        .update(historicalStatistics)
        .set({ draft, version: selected.version + 1, updatedAt: new Date() })
        .where(and(where(slug), eq(historicalStatistics.mpId, c.mpId)));
    } else {
      if (
        !relevant.length ||
        relevant.some(
          (r) => c.expectedVersions[String(r.mpId)] !== r.version,
        ) ||
        Object.keys(c.expectedVersions).length !== relevant.length
      )
        throw new HttpError(409, "Statistics changed. Reload before retrying.");
      if (c.action === "publish") {
        if (relevant.some((r) => r.draft.archiveKey !== key))
          throw new HttpError(409, "Import the current archive MP first.");
        const issues = fixtureStatisticsIssues(
          archive,
          fixture.id,
          relevant.map((r) => r.draft),
        );
        if (issues.length) throw new HttpError(400, issues[0]);
        const other = rows.filter(
          (r) => r.fixtureId !== fixture.id && r.published?.archiveKey === key,
        );
        const claimed = new Set(other.flatMap((r) => r.published!.included));
        if (
          relevant.some((r) => r.draft.included.some((id) => claimed.has(id)))
        )
          throw new HttpError(
            409,
            "A game is already published for another match.",
          );
      }
      for (const r of relevant)
        await tx
          .update(historicalStatistics)
          .set({
            published: c.action === "publish" ? r.draft : null,
            publishedAt: c.action === "publish" ? new Date() : null,
            version: r.version + 1,
            updatedAt: new Date(),
          })
          .where(and(where(slug), eq(historicalStatistics.mpId, r.mpId)));
    }
    await tx.insert(editionEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      kind: "statistics_" + c.action,
      detail: {
        fixtureId: fixture.id,
        ...("mpId" in c
          ? {
              mpId: c.mpId,
              fromVersion: c.expectedVersion,
              ...(c.action === "review"
                ? {
                    allowUnlistedMaps: c.allowUnlistedMaps,
                    included: c.included,
                    excludedScores: c.excludedScores,
                    rosterTeamGames: c.rosterTeamGames,
                    technicalAdjudication: c.technicalAdjudication,
                  }
                : {}),
            }
          : { versions: c.expectedVersions }),
      },
    });
  });
  return statisticsWorkspace(actor, slug, fixture.id);
}
async function databasePublicArchiveStatistics(
  slug: string,
  fixtureId?: string,
) {
  return db().transaction(
    async (tx) => {
      const archive = await archiveFor(slug, tx, true);
      const key = statisticsArchiveKey(archive);
      const rows = await stored(slug, tx);
      const fixtures = statisticsFixtures(archive).filter(
        (f) => !fixtureId || f.id === fixtureId,
      );
      const published = fixtures.flatMap((fixture) => {
        const sources = rows.filter(
          (r) =>
            r.fixtureId === fixture.id &&
            fixture.mpUrls.some((u) => archiveMpId(u) === r.mpId),
        );
        if (
          !sources.length ||
          sources.some((r) => !r.published || r.published.archiveKey !== key)
        )
          return [];
        const snapshots = sources.map((r) => r.published!);
        if (fixtureStatisticsIssues(archive, fixture.id, snapshots).length)
          return [];
        return sources;
      });
      const plays = published.flatMap((r) =>
        projectStatistics(archive, r.fixtureId, r.published!),
      );
      return {
        slug,
        archiveKey: key,
        matchDetails: (fixtureId ? fixtures : []).flatMap((f) => {
          const sources = published.filter((r) => r.fixtureId === f.id);
          if (!sources.length) return [];
          // Published snapshot identity, not the mutable draft version, anchors the report.
          const details = archiveMatchDetails(
            archive,
            f.id,
            sources.map((r) => ({
              snapshot: r.published!,
              revision: createHash("sha256")
                .update(JSON.stringify(r.published))
                .digest("hex"),
            })),
          );
          const games: RatingGame[] = details.games
            .filter((g) => g.included)
            .map((g) => ({
              fixtureId: f.id,
              gameId: g.gameId,
              // Historical snapshots have no numeric result revision; fingerprint is authoritative.
              revision: 0,
              fingerprint: g.revision,
              approvalFingerprint: g.revision,
              at: g.startTime,
              teamIds: details.teamIds,
              winnerTeamId:
                g.effectiveTotals[0] === g.effectiveTotals[1]
                  ? null
                  : details.teamIds[
                      g.effectiveTotals[0]! > g.effectiveTotals[1]! ? 0 : 1
                    ],
              scores: g.scores
                .filter((s) => s.included)
                .map((s) => ({
                  userId: s.osuId,
                  teamId: s.teamId!,
                  total: s.effectiveTotal!,
                })),
            }));
          details.rating = ratingSnapshot(
            games,
            new Map(archive.players.map((p) => [p.osuId, p.username])),
          );
          return [{ fixtureId: f.id, details }];
        }),
        players: archive.players.map(
          ({ osuId, username, teamId, role, tier }) => ({
            osuId,
            username,
            teamId,
            role,
            tier,
          }),
        ),
        teams: archive.teams.map(({ id, name }) => ({ id, name })),
        stages: [...new Set(fixtures.map((m) => m.stage))],
        fixtures: fixtures.map((m) => ({
          id: m.id,
          label: m.label,
          stage: m.stage,
          covered: published.some((r) => r.fixtureId === m.id),
          technicalAdjudication: published.some(
            (r) => r.fixtureId === m.id && r.published?.technicalAdjudication,
          ),
          score: m.score,
        })),
        plays,
        publishedAt:
          published
            .map((r) => r.publishedAt!.toISOString())
            .sort()
            .at(-1) ?? null,
        mpTotal: fixtures.reduce((n, m) => n + m.mpUrls.length, 0),
        mpCovered: published.length,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function publicArchiveStatistics(
  slug: string,
  fixtureId?: string,
): Promise<Awaited<ReturnType<typeof databasePublicArchiveStatistics>>> {
  if (remoteMode()) {
    return frontendResource<
      Awaited<ReturnType<typeof databasePublicArchiveStatistics>>
    >("publicArchiveStatistics", { slug, fixtureId });
  }
  return databasePublicArchiveStatistics(slug, fixtureId);
}

export type PublicArchiveStatistics = Awaited<
  ReturnType<typeof publicArchiveStatistics>
>;
