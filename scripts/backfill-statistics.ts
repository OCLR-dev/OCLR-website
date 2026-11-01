/**
 * One-time operator backfill for historical match statistics.
 *
 * Historical editions keep their archive inside `edition_state.configuration`
 * and their reviewed per-map statistics in `historical_statistics`. Editions
 * imported before statistics review existed therefore render empty
 * map-performance sections even though the archive records MP links.
 *
 * The tool follows the Admin statistics pipeline:
 *   1. fetch every recorded MP link through the osu! match provider,
 *   2. build a draft snapshot (`archiveKey`, raw source, suggested pool and a
 *      reviewed game selection),
 *   3. optionally publish fixtures whose drafts pass `fixtureStatisticsIssues`
 *      unchanged.
 *
 * Drafts are written by default. `--publish` is an explicit operator action.
 * A fixture is published only when the recorded series score reconciles
 * exactly. When plain review does not reconcile, three rule-based candidates
 * are tried — keeping an MP game whose beatmap is missing from the archived
 * pool, dropping earlier replays of the same beatmap, and dropping games where
 * one recorded team has no score. A fixture is published only when exactly one
 * candidate reconciles; otherwise it stays a draft for manual Admin review.
 * Published fixtures record a `statistics_backfill` edition event (actor null,
 * because this is a maintenance tool rather than a signed-in staff action) and
 * remain withdrawable from the Admin workspace.
 *
 * Usage:
 *   npm run db:backfill-statistics -- [slugs...] [--publish] [--dry-run]
 *                                    [--refresh] [--limit N]
 *
 * Examples:
 *   npm run db:backfill-statistics -- s9 --dry-run
 *   npm run db:backfill-statistics -- s4 s5 s7 s8 s9
 *   npm run db:backfill-statistics -- s4 s5 s7 s8 s9 --publish
 */
import env from "@next/env";
import { and, eq } from "drizzle-orm";
import {
  archiveMpId,
  canExcludeNonParticipantScore,
  canExcludeStatisticsScore,
  fixtureStatisticsIssues,
  statisticsFixtures,
  statisticsGameIssues,
  statisticsSeasons,
  statisticsScores,
  suggestStatisticsPool,
  validStatisticsExclusions,
  type StatisticsSnapshot,
} from "../src/lib/archive-statistics-model";
import { statisticsArchiveKey } from "../src/lib/archive-statistics";
import { fetchMatchSource } from "../src/lib/osu-matches";
import type { MatchSource } from "../src/lib/match-model";
import type { HistoricalArchive } from "../src/lib/historical-archive";
import { HttpError } from "../src/lib/http";
import { db, closeDb } from "../src/db";
import { editionEvents, historicalStatistics } from "../src/db/schema";
import { readTournament } from "../src/lib/tournaments";

type Options = {
  slugs: string[];
  publish: boolean;
  dryRun: boolean;
  refresh: boolean;
  limit: number;
};

type Review = {
  poolId: string;
  included: number[];
  allowUnlistedMaps: boolean;
  excludedScores: NonNullable<StatisticsSnapshot["excludedScores"]>;
  rosterTeamGames: number[];
};

type Resolution = { review: Review; rule: string };

function parseArgs(argv: string[]): Options {
  const slugs: string[] = [];
  let publish = false;
  let dryRun = false;
  let refresh = false;
  let limit = Number.POSITIVE_INFINITY;
  for (const arg of argv) {
    if (arg === "--publish") publish = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--refresh") refresh = true;
    else if (arg.startsWith("--limit="))
      limit = Number.parseInt(arg.slice("--limit=".length), 10);
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else slugs.push(arg);
  }
  for (const slug of slugs)
    if (!(statisticsSeasons as readonly string[]).includes(slug))
      throw new Error(`Unknown statistics season ${slug}.`);
  return {
    slugs: slugs.length ? slugs : [...statisticsSeasons],
    publish,
    dryRun,
    refresh,
    limit,
  };
}

function reviewLimits(source: MatchSource) {
  if (
    source.games.length > 500 ||
    Buffer.byteLength(JSON.stringify(source)) > 2_000_000
  )
    throw new Error("MP statistics exceed the import limit.");
}

function teamTotals(
  archive: HistoricalArchive,
  fixtureId: string,
  game: MatchSource["games"][number],
  excludedScores: StatisticsSnapshot["excludedScores"],
) {
  const fixture = archive.matches.find((m) => m.id === fixtureId)!;
  return [fixture.teamA, fixture.teamB].map((teamId) =>
    statisticsScores(game, excludedScores ?? []).reduce(
      (sum, score) =>
        sum +
        (archive.players.find((p) => p.osuId === score.osuId)?.teamId ===
        teamId
          ? (score.total ?? 0)
          : 0),
      0,
    ),
  );
}

/**
 * Scores from players who are not on either recorded roster (unregistered
 * stand-ins, lobby spectators) are marked `non-participant`, the documented
 * review exclusion for archive mismatches. Zero-score lobby occupants fall
 * back to the fingerprint exclusion when the non-participant reason does not
 * apply. A failed play from a roster player is never excluded.
 */
function zeroOccupantExclusions(
  archive: HistoricalArchive,
  fixtureId: string,
  source: MatchSource,
): NonNullable<StatisticsSnapshot["excludedScores"]> {
  const fixture = archive.matches.find((m) => m.id === fixtureId)!;
  const teamIds = [fixture.teamA, fixture.teamB];
  const onRoster = (osuId: number) => {
    const player = archive.players.find((p) => p.osuId === osuId);
    return !!player?.teamId && teamIds.includes(player.teamId);
  };
  const excluded: NonNullable<StatisticsSnapshot["excludedScores"]> = [];
  for (const game of source.games)
    for (const score of game.scores) {
      if (!score.osuId || onRoster(score.osuId)) continue;
      if (canExcludeNonParticipantScore(archive, fixtureId, score))
        excluded.push({
          gameId: game.id,
          osuId: score.osuId,
          reason: "non-participant",
        });
      else if (canExcludeStatisticsScore(score))
        excluded.push({ gameId: game.id, osuId: score.osuId });
    }
  return excluded;
}

function selectGames(
  archive: HistoricalArchive,
  fixtureId: string,
  source: MatchSource,
  options: {
    poolId: string;
    allowUnlistedMaps: boolean;
    excludedScores: NonNullable<StatisticsSnapshot["excludedScores"]>;
    skip: Set<number>;
  },
) {
  const included: number[] = [];
  const rosterTeamGames: number[] = [];
  const issues = (game: MatchSource["games"][number], useRosterTeams: boolean) =>
    statisticsGameIssues(
      archive,
      fixtureId,
      options.poolId,
      game,
      options.allowUnlistedMaps,
      options.excludedScores,
      useRosterTeams,
    );
  for (const game of source.games) {
    if (options.skip.has(game.id)) continue;
    const problems = issues(game, false);
    if (!problems.length) {
      included.push(game.id);
      continue;
    }
    if (
      problems.every(
        (issue) => issue === "Team colors do not identify both recorded teams.",
      ) &&
      !issues(game, true).length
    ) {
      rosterTeamGames.push(game.id);
      included.push(game.id);
    }
  }
  return { included, rosterTeamGames };
}

function reviewFor(
  archive: HistoricalArchive,
  fixtureId: string,
  source: MatchSource,
  variant: {
    allowUnlistedMaps?: boolean;
    dropEarlierReplays?: boolean;
    dropZeroTeamGames?: boolean;
  } = {},
): Review {
  const poolId = suggestStatisticsPool(archive, source);
  const allowUnlistedMaps = variant.allowUnlistedMaps ?? poolId === "";
  const excludedScores = zeroOccupantExclusions(archive, fixtureId, source);
  const skip = new Set<number>();
  if (variant.dropEarlierReplays) {
    const key = (game: MatchSource["games"][number]) =>
      game.beatmapId ?? -game.id;
    const lastByBeatmap = new Map<number, number>();
    for (const game of source.games)
      lastByBeatmap.set(key(game), game.id);
    for (const game of source.games)
      if (lastByBeatmap.get(key(game)) !== game.id) skip.add(game.id);
  }
  if (variant.dropZeroTeamGames) {
    const probe = selectGames(archive, fixtureId, source, {
      poolId,
      allowUnlistedMaps,
      excludedScores,
      skip,
    });
    for (const id of probe.included) {
      const game = source.games.find((g) => g.id === id)!;
      if (teamTotals(archive, fixtureId, game, excludedScores).includes(0))
        skip.add(id);
    }
  }
  const { included, rosterTeamGames } = selectGames(
    archive,
    fixtureId,
    source,
    { poolId, allowUnlistedMaps, excludedScores, skip },
  );
  return {
    poolId,
    included,
    allowUnlistedMaps,
    excludedScores,
    rosterTeamGames,
  };
}

function snapshotFrom(source: MatchSource, review: Review): StatisticsSnapshot {
  return { archiveKey: "", source, ...review };
}

/**
 * Locates the game window that produced the recorded series score. Warm-up
 * lobbies, replays and extra games after match point sit outside the window.
 * The window must be chronological and contiguous; multiple distinct windows
 * are ambiguous and rejected.
 */
function windowToSeriesScore(
  archive: HistoricalArchive,
  fixtureId: string,
  source: MatchSource,
  review: Review,
): Review | null {
  const fixture = archive.matches.find((m) => m.id === fixtureId)!;
  const [targetA, targetB] = fixture.score ?? [];
  if (targetA === undefined || targetB === undefined) return null;
  const ordered = source.games.filter((g) => review.included.includes(g.id));
  const winner = ordered.map((game) => {
    const totals = teamTotals(archive, fixtureId, game, review.excludedScores);
    return totals[0] === totals[1] ? null : totals[0] > totals[1] ? 0 : 1;
  });
  const windows = new Map<string, number[]>();
  for (let start = 0; start < ordered.length; start++) {
    const wins = [0, 0];
    for (let end = start; end < ordered.length; end++) {
      const side = winner[end];
      if (side !== null) wins[side]++;
      if (wins[0] > targetA || wins[1] > targetB) break;
      if (wins[0] === targetA && wins[1] === targetB) {
        const ids = ordered.slice(start, end + 1).map((g) => g.id);
        windows.set([...ids].sort((a, b) => a - b).join(","), ids);
        break;
      }
    }
  }
  if (windows.size !== 1) return null;
  const [included] = [...windows.values()];
  if (included.length === ordered.length) return null;
  return { ...review, included };
}

/**
 * Returns the review plus the rule that made it reconcile, or the base review
 * with `rule: ""` when no single rule reconciles the recorded series score.
 */
function resolveReview(
  archive: HistoricalArchive,
  fixtureId: string,
  source: MatchSource,
): Resolution {
  const base = reviewFor(archive, fixtureId, source);
  const candidates: { rule: string; review: Review }[] = [
    { rule: "reviewed", review: base },
    {
      rule: "unlisted-map",
      review: reviewFor(archive, fixtureId, source, { allowUnlistedMaps: true }),
    },
    {
      rule: "replay",
      review: reviewFor(archive, fixtureId, source, {
        dropEarlierReplays: true,
      }),
    },
    {
      rule: "empty-team-game",
      review: reviewFor(archive, fixtureId, source, { dropZeroTeamGames: true }),
    },
  ];
  const seeded = candidates.slice();
  for (const candidate of seeded) {
    const windowed = windowToSeriesScore(
      archive,
      fixtureId,
      source,
      candidate.review,
    );
    if (windowed)
      candidates.push({
        rule:
          candidate.rule === "reviewed"
            ? "trimmed-window"
            : candidate.rule + "+trimmed-window",
        review: windowed,
      });
  }
  const fixture = archive.matches.find((m) => m.id === fixtureId)!;
  const seen = new Set<string>();
  const valid: { rule: string; review: Review }[] = [];
  for (const candidate of candidates) {
    const signature = JSON.stringify({
      included: [...candidate.review.included].sort((a, b) => a - b),
      allowUnlistedMaps: candidate.review.allowUnlistedMaps,
      excluded: candidate.review.excludedScores.length,
    });
    if (seen.has(signature)) continue;
    seen.add(signature);
    const snapshot = snapshotFrom(source, candidate.review);
    if (!validStatisticsExclusions(snapshot, archive, fixture.id)) continue;
    if (fixtureStatisticsIssues(archive, fixture.id, [snapshot]).length)
      continue;
    valid.push(candidate);
  }
  if (valid.length === 1) return valid[0];
  if (valid.length > 1)
    console.warn(
      `  ? ${fixtureId}: ${valid.length} candidate reviews reconcile; leaving for manual review.`,
    );
  return { review: base, rule: "" };
}

async function withRetry<T>(label: string, run: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (
        error instanceof HttpError &&
        error.status < 500 &&
        error.status !== 429
      )
        throw error;
      if (attempt < 3)
        await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
      else console.warn(`  ! ${label}: giving up after ${attempt} attempts`);
    }
  }
  throw lastError;
}

async function rowsFor(slug: string) {
  return db()
    .select()
    .from(historicalStatistics)
    .where(eq(historicalStatistics.editionSlug, slug));
}

async function backfillEdition(slug: string, options: Options) {
  const tournament = await readTournament(slug);
  const archive = tournament?.edition.archive;
  if (!archive) {
    console.log(`${slug}: no archive, skipped.`);
    return { imported: 0, published: 0, skipped: 0, unresolved: 0 };
  }
  const key = statisticsArchiveKey(archive);
  let rows = await rowsFor(slug);
  const fixtures = statisticsFixtures(archive).filter(
    (fixture) => fixture.mpUrls.length > 0,
  );
  let imported = 0;
  let published = 0;
  let skipped = 0;
  let unresolved = 0;

  for (const fixture of fixtures) {
    const mpIds = fixture.mpUrls.map(archiveMpId);
    const prepared: { mpId: number; draft: StatisticsSnapshot; rule: string }[] =
      [];
    for (const mpId of mpIds) {
      const existing = rows.find((row) => row.mpId === mpId);
      if (existing?.published && !options.refresh) {
        skipped++;
        continue;
      }
      if (imported >= options.limit) continue;
      let source: MatchSource | undefined;
      const reusable =
        !options.refresh &&
        existing?.draft &&
        existing.draft.archiveKey === key &&
        existing.draft.source.match.id === mpId;
      if (reusable) {
        source = existing!.draft.source;
        console.log(`  = ${slug} ${fixture.id} mp ${mpId} (cached draft)`);
      } else {
        console.log(`  ↓ ${slug} ${fixture.id} mp ${mpId}`);
        try {
          source = await withRetry(`mp ${mpId}`, () => fetchMatchSource(mpId));
        } catch (error) {
          // Deleted or private MP links can never be imported; keep the draft
          // state and let the Admin decide whether the fixture is incomplete.
          console.warn(
            `  ! ${slug} ${fixture.id} mp ${mpId}: ${
              error instanceof HttpError ? error.message : String(error)
            } — left as draft.`,
          );
          prepared.length = 0;
          break;
        }
        reviewLimits(source);
      }
      if (!source) {
        prepared.length = 0;
        break;
      }
      const { review, rule } = resolveReview(archive, fixture.id, source);
      const draft: StatisticsSnapshot = { archiveKey: key, source, ...review };
      if (!validStatisticsExclusions(draft, archive, fixture.id))
        throw new Error(`Invalid exclusions for mp ${mpId}.`);
      prepared.push({ mpId, draft, rule });
      imported++;
    }
    if (!prepared.length) continue;
    if (options.dryRun) continue;

    await db().transaction(async (tx) => {
      for (const { mpId, draft } of prepared) {
        const existing = rows.find((row) => row.mpId === mpId);
        if (existing)
          await tx
            .update(historicalStatistics)
            .set({
              fixtureId: fixture.id,
              draft,
              version: existing.version + 1,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(historicalStatistics.editionSlug, slug),
                eq(historicalStatistics.mpId, mpId),
              ),
            );
        else
          await tx.insert(historicalStatistics).values({
            editionSlug: slug,
            mpId,
            fixtureId: fixture.id,
            version: 1,
            draft,
          });
      }
    });
    rows = await rowsFor(slug);
    if (!options.publish) continue;

    const relevant = rows.filter(
      (row) => row.fixtureId === fixture.id && mpIds.includes(row.mpId),
    );
    if (
      relevant.length !== mpIds.length ||
      relevant.some((row) => row.draft.archiveKey !== key)
    ) {
      console.warn(
        `  ! ${slug} ${fixture.id}: incomplete imports, not published.`,
      );
      continue;
    }
    const snapshots = relevant.map((row) => row.draft);
    const issues = fixtureStatisticsIssues(archive, fixture.id, snapshots);
    if (issues.length) {
      unresolved++;
      console.warn(`  ! ${slug} ${fixture.id}: ${issues[0]} — left as draft.`);
      continue;
    }
    const claimed = new Set(
      rows
        .filter(
          (row) =>
            row.fixtureId !== fixture.id && row.published?.archiveKey === key,
        )
        .flatMap((row) => row.published!.included),
    );
    const clash = snapshots.find((s) =>
      s.included.some((id) => claimed.has(id)),
    );
    if (clash) {
      console.warn(
        `  ! ${slug} ${fixture.id}: a game is already published elsewhere.`,
      );
      continue;
    }
    const rules = prepared.map((p) => p.rule).filter(Boolean);
    await db().transaction(async (tx) => {
      for (const row of relevant)
        await tx
          .update(historicalStatistics)
          .set({
            published: row.draft,
            publishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(historicalStatistics.editionSlug, slug),
              eq(historicalStatistics.mpId, row.mpId),
            ),
          );
      await tx.insert(editionEvents).values({
        editionSlug: slug,
        actorId: null,
        kind: "statistics_backfill",
        detail: {
          fixtureId: fixture.id,
          mpIds,
          games: snapshots.reduce((sum, s) => sum + s.included.length, 0),
          ...(rules.some((r) => r !== "reviewed") ? { rules } : {}),
        },
      });
    });
    published++;
    rows = await rowsFor(slug);
  }
  console.log(
    `${slug}: imported ${imported}, published ${published}, already published ${skipped}, unresolved ${unresolved} (${fixtures.length} fixtures).`,
  );
  return { imported, published, skipped, unresolved };
}

async function main() {
  env.loadEnvConfig(process.cwd());
  const options = parseArgs(process.argv.slice(2));
  console.log(
    `Backfill ${options.slugs.join(", ")}${options.dryRun ? " (dry run)" : ""}${options.publish ? " with publish" : " (drafts only)"}`,
  );
  const totals = { imported: 0, published: 0, skipped: 0, unresolved: 0 };
  for (const slug of options.slugs) {
    const result = await backfillEdition(slug, options);
    totals.imported += result.imported;
    totals.published += result.published;
    totals.skipped += result.skipped;
    totals.unresolved += result.unresolved;
  }
  console.log(
    `Done: imported ${totals.imported}, published ${totals.published}, already published ${totals.skipped}, unresolved ${totals.unresolved}.`,
  );
  if (!options.publish && !options.dryRun)
    console.log(
      "Drafts are ready. Review them in Admin → tournament → statistics, or rerun with --publish.",
    );
  await closeDb();
}

await main();
