/** Explicit local-only demo data. Never imported by application routes. */
import * as nextEnv from "@next/env";
import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../src/db";
import {
  captains,
  editionEvents,
  editionRevisions,
  editionState,
  fixtures,
  mappoolEntries,
  mappools,
  matchGames,
  matchImports,
  matchResults,
  memberships,
  registrations,
  resultRevisions,
  teams,
  tournamentRounds,
  tournamentStages,
  userProfileCache,
  users,
} from "../src/db/schema";
import { editionSchema } from "../src/lib/editions";
import { scoringRulesSchema } from "../src/lib/competition-model";
import {
  matchSourceSchema,
  reviewedResultSchema,
} from "../src/lib/match-model";
import { normalizeOsuProfile } from "../src/lib/osu-profile-model";
import {
  assertDevelopmentDatabase,
  localDatabase,
} from "./development-database";

const env = "default" in nextEnv ? nextEnv.default : nextEnv;
(env as typeof nextEnv).loadEnvConfig(process.cwd(), true);

async function seed() {
  assertDevelopmentDatabase(
    process.env.DATABASE_URL,
    // Compatibility for existing preview configuration only. The destructive
    // test guard always rejects this preview database, including legacy URLs.
    process.env.OCLR_DEVELOPMENT_DATABASE_URL ?? process.env.TEST_DATABASE_URL,
  );
  const [{ name }] = (
    await db().execute(sql`SELECT current_database() AS name`)
  ).rows as { name: string }[];
  if (name !== localDatabase.name)
    throw new Error("Connected to an unexpected database.");
  const now = new Date();
  const day = (offset: number) => new Date(now.getTime() + offset * 86400000);
  const slug = "dev-s11";
  const playerBase = 8_000_000_000_000;
  const rules = scoringRulesSchema.parse({
    version: "local-demo-v1",
    mode: "osu",
    teamType: "team-vs",
    scoringType: "score",
    aggregation: "sum",
    playersPerTeam: 2,
    series: { type: "first_to", wins: 2 },
    allowSubstitutions: false,
    allowShortHanded: false,
    failedScorePolicy: "include",
    tiedMapPolicy: "require_replay",
  });

  return db().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(713027)`);
    const [existing] = await tx
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(eq(editionState.slug, slug));
    if (existing)
      return "Demo data already exists; existing edits were preserved.";

    const current = editionSchema.parse({
      slug,
      name: "OCLR S11 · 本地演示",
      season: "11",
      branding: {
        logo: "/oclr-s11-square-logo.webp",
        background: "/oclr-s11-website-background.webp",
        keyVisual: "/oclr-s11-key-visual.webp",
      },
      published: true,
      status: "live",
      timeZone: "Asia/Shanghai",
      summary:
        "仅用于本地前端开发的虚构赛事、选手、图池与赛程，不代表正式比赛。",
      rules: {
        version: "local-demo-v1",
        sections: [
          {
            heading: "本地演示说明",
            body: "此赛事与所有参赛身份、赛程和成绩均为虚构数据，只用于检查页面样式和交互。",
          },
          {
            heading: "赛制展示",
            body: "四支演示队伍进行淘汰赛，每队六人，单场两人上场。示例采用先赢两张图的赛制。",
          },
          {
            heading: "图池展示",
            body: "图池包含 NM、HD、HR、DT、FM 与 TB 分类，曲目元数据均为虚构样例。",
          },
        ],
      },
      eligibility: "仅限本地演示，不接受正式报名。",
      registration: {
        enabled: false,
        opensAt: day(-14).toISOString(),
        closesAt: day(-7).toISOString(),
        withdrawUntil: day(-7).toISOString(),
        questions: [],
      },
      schedule: [
        { label: "演示报名开始", at: day(-14).toISOString() },
        { label: "演示半决赛", at: day(-1).toISOString() },
        { label: "演示决赛", at: day(3).toISOString() },
      ],
    });
    const archived = editionSchema.parse({
      ...current,
      slug: "dev-archive",
      name: "OCLR 历史赛季 · 本地演示",
      season: "10",
      status: "completed",
      registration: null,
      schedule: [],
    });
    for (const edition of [current, archived]) {
      const { slug: editionSlug, ...configuration } = edition;
      await tx
        .insert(editionState)
        .values({ slug: editionSlug, configuration });
      await tx
        .insert(editionRevisions)
        .values({ editionSlug, version: 0, configuration });
      await tx.insert(editionEvents).values({
        editionSlug,
        kind: "local_development_seed",
        detail: {
          source: "synthetic_local_demo",
          after: { configuration, revision: 0 },
        },
      });
    }

    const people = Array.from({ length: 28 }, (_, i) => ({
      osuId: playerBase + i + 1,
      username: `Demo_${String(i + 1).padStart(2, "0")}`,
    }));
    await tx.insert(users).values(people);
    await tx.insert(registrations).values(
      people.map((person, i) => ({
        userId: person.osuId,
        editionSlug: slug,
        status: i < 24 ? ("accepted" as const) : ("pending" as const),
        source: "staff" as const,
        rulesVersion: null,
        configurationVersion: 0,
        answers: {},
      })),
    );
    await tx.insert(userProfileCache).values(
      people.map((person, i) => ({
        osuId: person.osuId,
        mode: "osu",
        attemptedAt: now,
        retryAt: day(365),
        profile: normalizeOsuProfile(
          {
            id: person.osuId,
            username: person.username,
            country_code: ["CN", "HK", "TW", "JP"][i % 4],
            playmode: "osu",
            badges: [],
            statistics: {
              mode: "osu",
              global_rank: 16000 + i * 750,
              country_rank: 500 + i * 20,
              pp: 8200 - i * 100,
              hit_accuracy: 97 + (i % 20) / 10,
              play_count: 12000 + i * 300,
              play_time: 86400 * 20,
              maximum_combo: 1400 + i * 10,
            },
          },
          person.osuId,
          "osu",
          now.toISOString(),
        ),
      })),
    );

    const demoTeams = ["星河", "暮光", "雪原", "晨曦"].map((name, i) => ({
      id: randomUUID(),
      editionSlug: slug,
      captainId: people[i * 6].osuId,
      name: `${name} · Demo`,
      capacity: 6,
      identityPublished: true,
      rosterPublished: true,
      finalizedAt: day(-2),
    }));
    await tx.insert(captains).values(
      demoTeams.map((team, i) => ({
        editionSlug: slug,
        userId: team.captainId,
        position: i + 1,
        published: true,
      })),
    );
    await tx.insert(teams).values(demoTeams);
    await tx.insert(memberships).values(
      people.slice(0, 24).map((person, i) => ({
        editionSlug: slug,
        teamId: demoTeams[Math.floor(i / 6)].id,
        userId: person.osuId,
        origin: i % 6 === 0 ? "captain" : "draft",
      })),
    );

    const stageId = randomUUID();
    const roundId = randomUUID();
    const finalRoundId = randomUUID();
    const poolId = randomUUID();
    await tx
      .insert(tournamentStages)
      .values({ id: stageId, editionSlug: slug, kind: "knockout" });
    await tx.insert(tournamentRounds).values([
      {
        id: roundId,
        editionSlug: slug,
        stageId,
        name: "演示半决赛",
        position: 1,
        scoringRules: rules,
      },
      {
        id: finalRoundId,
        editionSlug: slug,
        stageId,
        name: "演示决赛",
        position: 2,
        scoringRules: rules,
      },
    ]);
    await tx.insert(mappools).values({
      id: poolId,
      editionSlug: slug,
      roundId,
      name: "半决赛 · 演示图池",
      fmMode: "free_mod",
      publishedAt: day(-3),
    });
    const slots = [
      "NM",
      "NM",
      "NM",
      "HD",
      "HD",
      "HR",
      "HR",
      "DT",
      "DT",
      "FM",
      "FM",
      "TB",
    ] as const;
    const positions = new Map<string, number>();
    const maps = slots.map((category, i) => {
      const position = (positions.get(category) ?? 0) + 1;
      positions.set(category, position);
      return {
        poolId,
        category,
        position,
        beatmapId: playerBase + 100 + i,
        metadata: {
          setId: 0, // Show the existing missing-cover state without fetching a real mapset.
          title:
            ["星海回响", "Neon Skyline", "夜明けの旋律", "Cloud Nine"][i % 4] +
            ` · Demo ${i + 1}`,
          artist: "Demo Artist",
          mapper: "Demo Mapper",
          difficulty: "Local showcase",
          stars: 4.5 + i * 0.15,
          bpm: 160 + i * 5,
          duration: 100 + i * 7,
          ar: 9,
          od: 8,
          cs: 4,
          hp: 6,
        },
      };
    });
    await tx.insert(mappoolEntries).values(maps);

    const semifinals = [0, 1].map((i) => ({
      id: randomUUID(),
      editionSlug: slug,
      roundId,
      label: `演示半决赛 ${i + 1}`,
      homeTeamId: demoTeams[i * 2].id,
      awayTeamId: demoTeams[i * 2 + 1].id,
      scheduledAt: day(i === 0 ? -1 : 1),
      timeZone: "Asia/Shanghai",
      status: "scheduled" as const,
      mappoolId: poolId,
      position: i + 1,
      publishedAt: day(-2),
    }));
    await tx.insert(fixtures).values(semifinals);
    await tx.insert(fixtures).values({
      id: randomUUID(),
      editionSlug: slug,
      roundId: finalRoundId,
      label: "演示决赛",
      scheduledAt: day(3),
      timeZone: "Asia/Shanghai",
      position: 1,
      homeSourceId: semifinals[0].id,
      homeSourceOutcome: "winner",
      awaySourceId: semifinals[1].id,
      awaySourceOutcome: "winner",
      publishedAt: day(-2),
    });

    const fixture = semifinals[0];
    const fingerprint = createHash("sha256")
      .update("oclr-local-demo-result-v1")
      .digest("hex");
    const gameWinners = [demoTeams[0].id, demoTeams[1].id, demoTeams[0].id];
    const games = gameWinners.map((winnerTeamId, i) => ({
      gameId: playerBase + 200 + i,
      beatmapId: maps[i].beatmapId,
      beatmap: {
        setId: null,
        title: maps[i].metadata.title,
        artist: "Demo Artist",
        difficulty: "Local showcase",
      },
      mods: [],
      scoringType: "score",
      homeScore: winnerTeamId === demoTeams[0].id ? 1400000 : 1200000,
      awayScore: winnerTeamId === demoTeams[1].id ? 1400000 : 1200000,
      winnerTeamId,
      tied: false,
    }));
    const source = matchSourceSchema.parse({
      schemaVersion: 1,
      apiVersion: "20220705",
      fetchedAt: now.toISOString(),
      fingerprint,
      match: {
        id: playerBase + 300,
        title: "Local synthetic demo match",
        startTime: day(-1).toISOString(),
        endTime: day(-1).toISOString(),
      },
      firstEventId: 1,
      latestEventId: 3,
      currentGameId: null,
      pages: 1,
      complete: true,
      warnings: ["Synthetic local demo; no real provider request was made."],
      events: games.map((game, i) => ({
        id: i + 1,
        at: day(-1).toISOString(),
        type: "other",
        actorOsuId: null,
        gameId: game.gameId,
      })),
      games: games.map((game) => ({
        id: game.gameId,
        beatmapId: game.beatmapId,
        startTime: day(-1).toISOString(),
        endTime: day(-1).toISOString(),
        mode: "osu",
        teamType: "team-vs",
        scoringType: "score",
        mods: [],
        problems: [],
        beatmap: game.beatmap,
        scores: [0, 1, 6, 7].map((i, slot) => ({
          osuId: people[i].osuId,
          total: (slot < 2 ? game.homeScore : game.awayScore) / 2,
          team: slot < 2 ? "blue" : "red",
          slot,
          passed: true,
          mods: [],
          accuracy: 0.98,
          combo: 800,
          providerFields: {},
          problems: [],
        })),
      })),
    });
    const proposal = reviewedResultSchema.parse({
      schemaVersion: 1,
      fixtureVersion: 0,
      roundId,
      poolVersion: 0,
      poolSnapshot: {
        poolId,
        fmMode: "free_mod",
        fmRestrictions: "",
        entries: maps.map(({ beatmapId, category, position }) => ({
          beatmapId,
          category,
          position,
        })),
      },
      teamIds: [demoTeams[0].id, demoTeams[1].id],
      rosterSnapshot: demoTeams.slice(0, 2).map((team, i) => ({
        teamId: team.id,
        osuIds: people.slice(i * 6, i * 6 + 6).map((p) => p.osuId),
      })),
      rulesSnapshot: rules,
      sourceFingerprint: fingerprint,
      decisions: games.map((game) => ({
        gameId: game.gameId,
        included: true,
        reason: "",
        complianceConfirmed: true,
        substitutions: [],
      })),
      publicNote: "虚构演示成绩，仅用于本地页面开发。",
      games,
      series: {
        homeWins: 2,
        awayWins: 1,
        tiedMaps: 0,
        includedGames: 3,
        winnerTeamId: demoTeams[0].id,
        draw: false,
        complete: true,
      },
    });
    const [imported] = await tx
      .insert(matchImports)
      .values({
        fixtureId: fixture.id,
        externalMatchId: source.match.id,
        fingerprint,
        source,
        createdBy: people[0].osuId,
      })
      .returning();
    await tx.insert(matchGames).values(
      source.games.map((game) => ({
        importId: imported.id,
        externalGameId: game.id,
        beatmapId: game.beatmapId,
        data: game,
      })),
    );
    await tx.insert(matchResults).values({
      fixtureId: fixture.id,
      state: "approved",
      version: 1,
      currentRevision: 1,
      latestImportId: imported.id,
      publishedRevision: 1,
      publishedAt: day(-1),
    });
    await tx.insert(resultRevisions).values({
      fixtureId: fixture.id,
      revision: 1,
      importId: imported.id,
      proposal,
      createdBy: people[0].osuId,
      approvedBy: people[0].osuId,
      approvedAt: day(-1),
    });
    return "Created 2 demo editions, 28 synthetic identities (24 accepted / 4 pending), 4 teams, 12 maps, 3 fixtures and 1 published synthetic result.";
  });
}

try {
  console.log(await seed());
  console.log("Preview: http://localhost:3000/tournaments/dev-s11");
} catch (error) {
  // Database errors can contain SQL parameters; never print credentials or records.
  console.error(
    error instanceof Error && !(error as Error & { query?: string }).query
      ? error.message
      : "Development seed failed. Verify local database migrations and configuration.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
