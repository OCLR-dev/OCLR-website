import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq, and, sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import {
  chatArtworkCaptions as captions,
  chatSourceVectors as vectors,
  draftSessions,
  editionState,
  etxRatingCache,
  fixtures,
  historicalStatistics,
  importedPlayerRatings,
  otrRatingCache,
  registrations,
  mappools,
  mappoolEntries,
  tournamentRounds,
  tournamentStages,
  sipRatingCache,
  teams,
  userProfileCache,
  users,
} from "@/db/schema";
import * as archiveArtwork from "@/lib/archive-artwork";
import { statisticsArchiveKey } from "@/lib/archive-statistics-key";
import { visionConfiguration } from "@/lib/chat-artwork";
import { refreshChatIndex } from "@/lib/chat-index-worker";
import { chatEvidence } from "@/lib/chat-sources";
import { normalizeOsuProfile } from "@/lib/osu-profile-model";
import { searchSeasonIndex } from "@/lib/chat-vectors";
import { seedEditions } from "../fixtures/editions";
import { seedPublicDirectory } from "../fixtures/players";
import { edition } from "../fixtures/edition";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { historicalArchive } from "../fixtures/historical-archive";
import { sipRating } from "../fixtures/sip-response";
import { assertTestDatabase } from "../database";

vi.mock("server-only", () => ({}));

const url = process.env.TEST_DATABASE_URL;
const archived = {
  ...edition,
  slug: historicalArchive.editionSlug,
  season: "7",
  name: "Synthetic historical season",
  status: "completed" as const,
  registration: null,
  archive: structuredClone(historicalArchive),
};
const calls: string[][] = [];
let embeddingUnavailable = false;
beforeAll(async () => {
  if (!url) return;
  assertTestDatabase(url);
  vi.stubEnv("DATABASE_URL", url);
  vi.stubEnv("OCLR_CHAT_BASE_URL", "https://synthetic.invalid/v1");
  vi.stubEnv("OCLR_CHAT_MODEL", "chat-test");
  vi.stubEnv("OCLR_CHAT_PROXY_URL", "");
  vi.stubEnv("OCLR_CHAT_EMBEDDING_MODEL", "embedding-test");
  vi.stubGlobal("fetch", async (address: string, opts: RequestInit) => {
    expect(String(address)).toBe("https://synthetic.invalid/v1/embeddings");
    const { input } = JSON.parse(String(opts.body)) as { input: string[] };
    calls.push(input);
    if (embeddingUnavailable) return new Response(null, { status: 503 });
    return Response.json({
      object: "list",
      data: input.map((text, index) => ({
        object: "embedding",
        index,
        embedding:
          text.includes("Historical Title") ||
          text.normalize("NFKC") === "星際旋律是哪首?"
            ? [1, 0]
            : [0, 1],
      })),
      model: "embedding-test",
      usage: { prompt_tokens: 1, total_tokens: 1 },
    });
  });
  await db().execute(sql`TRUNCATE edition_state CASCADE`);
});
afterAll(async () => {
  await closeDb();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.skipIf(!url)(
  "indexes complete published seasons incrementally, finds semantic hits and suppresses withdrawn sources before refresh",
  async () => {
    const other = { ...edition, slug: "other-test-cup" };
    await seedEditions([
      archived,
      other,
      {
        ...other,
        slug: "unpublished-index-test",
        published: false,
        summary: "PRIVATE-UNRELEASED",
      },
    ]);
    const first = await refreshChatIndex();
    expect(first).toMatchObject({ status: "complete", failed: 0 });
    expect(first.updated).toBeGreaterThan(0);
    expect(calls.flat().join(" ")).not.toContain("PRIVATE-UNRELEASED");
    const stored = await db()
      .select({
        collection: vectors.collection,
        embedding: vectors.embedding,
        embeddingVector: vectors.embeddingVector,
      })
      .from(vectors)
      .where(eq(vectors.editionSlug, archived.slug));
    expect(stored.map((s) => s.embeddingVector)).toEqual(
      stored.map((s) => s.embedding),
    );
    expect(stored.map((s) => s.collection)).toEqual(
      expect.arrayContaining([
        "overview",
        "players",
        "teams",
        "draft",
        "matches",
        "mappools",
        "staff",
      ]),
    );
    // These are the same rows a pre-pgvector release left behind.
    await db()
      .update(vectors)
      .set({ embeddingVector: null })
      .where(eq(vectors.editionSlug, archived.slug));
    const question = "星際旋律是哪首？";
    const beforeBackfill = await searchSeasonIndex(archived, question, "");
    expect(
      beforeBackfill.some((s) => s.text.includes("Historical Title")),
    ).toBe(true);
    calls.length = 0;
    expect(await refreshChatIndex()).toMatchObject({
      updated: 0,
      removed: 0,
      failed: 0,
    });
    expect(calls).toHaveLength(0);
    const converted = await db()
      .select({ embeddingVector: vectors.embeddingVector })
      .from(vectors)
      .where(eq(vectors.editionSlug, archived.slug));
    expect(converted).toHaveLength(stored.length);
    expect(converted.every((s) => s.embeddingVector !== null)).toBe(true);
    const semantic = await searchSeasonIndex(archived, question, "");
    expect(semantic).toEqual(beforeBackfill);
    expect(
      semantic.some(
        (s) =>
          s.url.includes("/mappools/") && s.text.includes("Historical Title"),
      ),
    ).toBe(true);
    expect(
      (await searchSeasonIndex(other, "星際旋律是哪首？", "")).some((s) =>
        s.text.includes("Historical Title"),
      ),
    ).toBe(false);
    calls.length = 0;
    const across = await chatEvidence(other.slug, "歷屆星際旋律是哪首？", "");
    expect(across).toMatchObject({
      seasonScope: { allPublished: true },
      sources: expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining(archived.name),
          text: expect.stringContaining("Historical Title"),
        }),
      ]),
    });
    expect(calls).toEqual([["星際旋律是哪首?"]]);
    expect(await chatEvidence(other.slug, "第七屆有幾隊？", "")).toMatchObject({
      edition: archived.name,
      total: { kind: "teams", count: 2 },
    });
    const counts = await chatEvidence(other.slug, "歷屆有幾隊？", "");
    expect(counts).toMatchObject({
      historicalCounts: { unavailable: [] },
      sources: expect.arrayContaining([
        expect.objectContaining({
          url: `/tournaments/${archived.slug}/teams`,
          text: expect.stringContaining('"count":2'),
        }),
      ]),
    });
    const player = await chatEvidence(
      other.slug,
      "Historical Player是什麼水平的玩家？",
      "",
    );
    expect(player.playerProfile).toBe(true);
    expect(JSON.parse(player.sources[0].text)).toMatchObject({
      selectedEditionParticipation: [],
      otherPublishedParticipation: [
        expect.objectContaining({ editionSlug: archived.slug }),
      ],
      publishedTeamResults: [
        expect.objectContaining({ editionSlug: archived.slug, wins: 1 }),
      ],
    });
    embeddingUnavailable = true;
    expect(
      (await searchSeasonIndex(archived, "Historical Title", "")).some((s) =>
        s.text.includes("Historical Title"),
      ),
    ).toBe(true);
    embeddingUnavailable = false;
    const changed = structuredClone(archived);
    changed.archive.pools[0].maps[0].title = "Replacement track";
    await seedEditions([changed]);
    expect(
      (await searchSeasonIndex(changed, "Historical Title", "")).some((s) =>
        s.text.includes("Historical Title"),
      ),
    ).toBe(false);
    calls.length = 0;
    expect(await refreshChatIndex()).toMatchObject({
      updated: 1,
      removed: 1,
      failed: 0,
    });
    expect(calls.flat()).toHaveLength(1);
    vi.stubEnv("OCLR_CHAT_EMBEDDING_MODEL", "other-model");
    expect((await refreshChatIndex()).updated).toBeGreaterThan(1);
    await seedEditions([{ ...changed, published: false }]);
    expect(await chatEvidence(other.slug, "S7的圖池", "")).toMatchObject({
      seasonScope: { editions: [], unavailable: ["S7"] },
      sources: [],
    });
    expect(
      (
        await chatEvidence(other.slug, "歷屆 Replacement track", "")
      ).sources.some((source) => source.url.includes(archived.slug)),
    ).toBe(false);

    expect((await refreshChatIndex()).removed).toBeGreaterThan(0);
    expect(
      await db()
        .select({ id: vectors.digest })
        .from(vectors)
        .where(eq(vectors.editionSlug, archived.slug)),
    ).toEqual([]);
  },
);

it.skipIf(!url)(
  "reads linked teams, released picks and schedule from public page projections",
  async () => {
    const home = await seedPublicDirectory(1431547);
    const away = await seedPublicDirectory(1431557);
    const slug = edition.slug;
    const origin = `https://oclr.org/tournaments/${slug}`;
    const saved = new Date("2030-01-01T00:00:00Z");
    await db()
      .update(teams)
      .set({ rosterPublished: false })
      .where(eq(teams.id, home.teamId));
    const [session] = await db()
      .insert(draftSessions)
      .values({
        editionSlug: slug,
        state: "live",
        turnSequence: [home.teamId],
        pool: [home.memberId],
      })
      .returning();
    const [stage] = await db()
      .insert(tournamentStages)
      .values({ editionSlug: slug, kind: "group" })
      .returning();
    const [round] = await db()
      .insert(tournamentRounds)
      .values({
        editionSlug: slug,
        stageId: stage.id,
        name: "Fixture group",
        position: 1,
      })
      .returning();
    const fixture = {
      editionSlug: slug,
      roundId: round.id,
      timeZone: "Asia/Tokyo",
    };
    const visibleAt = new Date("2030-01-03T07:00:00Z");
    const [published] = await db()
      .insert(fixtures)
      .values([
        {
          ...fixture,
          label: "First confirmed",
          position: 1,
          homeTeamId: home.teamId,
          awayTeamId: away.teamId,
          publishedAt: saved,
          scheduledAt: visibleAt,
        },
        {
          ...fixture,
          label: "Public TBD",
          position: 2,
          publishedAt: saved,
          scheduledAt: new Date("2030-01-02T01:00:00Z"),
        },
        {
          ...fixture,
          label: "Unreleased fixture",
          position: 3,
          scheduledAt: visibleAt,
        },
      ])
      .returning();

    const teamEvidence = await chatEvidence(slug, origin + "/teams", "");
    expect(teamEvidence.competitionPage).toBe(true);
    expect(JSON.parse(teamEvidence.sources[0].text).teamCount).toBe(2);
    expect(
      JSON.parse(
        teamEvidence.sources.find((row) => row.url.endsWith(home.teamId))!.text,
      ).members,
    ).toBeNull();

    const draftBefore = await chatEvidence(slug, origin + "/draft", "");
    expect(draftBefore.sources).toHaveLength(1);
    expect(JSON.parse(draftBefore.sources[0].text)).toMatchObject({
      state: "unpublished",
      publishedPicks: null,
    });
    await db()
      .update(draftSessions)
      .set({
        publicSnapshot: {
          sessionId: session.id,
          version: 1,
          state: "live",
          turnIndex: 1,
          turnCount: 1,
          activeTeam: null,
          rosters: [],
          pool: null,
          picks: [
            {
              id: session.id,
              turnIndex: 0,
              team: {
                id: home.teamId,
                name: "Synthetic published draft team",
                captain: {
                  osuId: home.captainId,
                  username: "Synthetic captain",
                },
              },
              player: {
                osuId: home.memberId,
                username: "Synthetic released pick",
              },
            },
          ],
        },
      })
      .where(eq(draftSessions.id, session.id));
    const draftAfter = await chatEvidence(slug, origin + "/draft", "");
    expect(draftAfter.sources[1].text).toContain("Synthetic released pick");

    const recommendation = "我需要補充高AR強手，可以選誰？";
    expect(await chatEvidence(slug, recommendation, "")).toMatchObject({
      draftRecommendation: true,
      sources: [],
    });
    const eligible = { osuId: 1431568, username: "Synthetic eligible player" };
    await db().insert(users).values(eligible).onConflictDoNothing();
    await db().insert(registrations).values({
      userId: eligible.osuId,
      editionSlug: slug,
      status: "accepted",
      rulesVersion: "test-v1",
      answers: {},
    });
    const candidates = [
      { osuId: home.captainId, username: "Synthetic captain" },
      { osuId: home.memberId, username: "Synthetic released pick" },
      eligible,
      { osuId: home.unpublishedCaptainId, username: "Synthetic stale captain" },
      { osuId: away.memberId, username: "Synthetic current roster member" },
      { osuId: home.privateId, username: "Synthetic pending candidate" },
    ];
    await db()
      .insert(sipRatingCache)
      .values(
        candidates.map(({ osuId }, index) => ({
          osuId,
          value: 4000,
          fetchedAt: saved,
          snapshot: {
            rating: sipRating("overall", 4000),
            modifications: {
              Hidden: sipRating(
                "Hidden",
                osuId === eligible.osuId ? 4500 : 9000 - index,
              ),
            },
            skillsets: { "High AR": sipRating("High AR", 8000 - 1000 * index) },
          },
        })),
      )
      .onConflictDoUpdate({
        target: sipRatingCache.osuId,
        set: { value: 4000, snapshot: sql`excluded.snapshot` },
      });
    await db()
      .update(editionState)
      .set({ poolPublished: true })
      .where(eq(editionState.slug, slug));
    const draftTeam = {
      id: home.teamId,
      name: "Synthetic published draft team",
      captain: candidates[0],
    };
    await db()
      .update(draftSessions)
      .set({
        turnIndex: 1,
        turnSequence: [home.teamId, home.teamId],
        pool: candidates.map(({ osuId }) => osuId),
        publicSnapshot: {
          sessionId: session.id,
          version: 2,
          state: "live",
          turnIndex: 1,
          turnCount: 2,
          activeTeam: draftTeam,
          pool: candidates,
          rosters: [],
          picks: [
            {
              id: session.id,
              turnIndex: 0,
              team: draftTeam,
              player: candidates[1],
            },
          ],
        },
      })
      .where(eq(draftSessions.id, session.id));
    const suggestions = await chatEvidence(
      slug,
      recommendation,
      "Synthetic captain是誰？",
    );
    expect(suggestions).toMatchObject({
      draftRecommendation: true,
      sources: [{ url: "/tournaments/" + slug + "/draft" }],
    });
    expect(JSON.parse(suggestions.sources[0].text)).toMatchObject({
      selectablePlayers: 1,
      candidatesWithRating: 1,
      candidates: [{ name: eligible.username, metric: "High AR", value: 6000 }],
    });
    const namedPick = await chatEvidence(
      slug,
      "可以選 Synthetic captain 嗎？",
      "",
    );
    expect(namedPick.draftRecommendation).toBe(true);
    expect(namedPick.sources[0].text).not.toContain("Synthetic captain");

    const embeddingCalls = calls.length;
    const hdQuestion = "可以推薦一下HD隊員嗎";
    const hidden = await chatEvidence(slug, hdQuestion, "");
    expect(hidden.draftRecommendation).toBe(true);
    expect(JSON.parse(hidden.sources[0].text)).toMatchObject({
      requestedMetric: { category: "modifications", key: "HD" },
      selectablePlayers: 1,
      candidatesWithRating: 1,
      candidates: [{ name: eligible.username, metric: "Hidden", value: 4500 }],
    });
    const followUp = await chatEvidence(slug, "那 HD 呢？", recommendation);
    expect(followUp.sources).toEqual(hidden.sources);
    expect(calls).toHaveLength(embeddingCalls);

    const history = structuredClone(statisticsArchive);
    history.editionSlug = "s7";
    history.matches[0].score = [3, 0];
    history.picks[0].osuId = eligible.osuId;
    history.pools[0].maps.forEach((map, i) => {
      map.slot = "HD" + (i + 1);
    });
    history.players.find((player) => player.osuId === 91003)!.osuId =
      eligible.osuId;
    history.players.find((player) => player.osuId === 91001)!.osuId =
      home.unpublishedCaptainId;
    const previousEdition = {
      ...edition,
      slug: history.editionSlug,
      name: "Synthetic public HD season",
      status: "completed" as const,
      registration: null,
      archive: history,
    };
    await seedEditions([previousEdition]);
    const source = statisticsSource();
    for (const game of source.games) {
      for (const score of game.scores) {
        score.total = (score.total ?? 0) * 1000;
        if (score.osuId === 91003) {
          score.osuId = eligible.osuId;
          score.mods = ["HD", "NF"];
        } else if (score.osuId === 91001) {
          score.osuId = home.unpublishedCaptainId;
        }
      }
    }
    const publishedMods = {
      archiveKey: statisticsArchiveKey(history),
      source,
      poolId: history.pools[0].id,
      included: [1, 2, 4],
    };
    await db().insert(historicalStatistics).values({
      editionSlug: history.editionSlug,
      fixtureId: history.matches[0].id,
      mpId: source.match.id,
      version: 2,
      draft: publishedMods,
      published: publishedMods,
      publishedAt: saved,
    });

    const byHistory = await chatEvidence(
      slug,
      "可以根據歷屆實戰推薦一下 HD 隊員嗎？",
      "",
    );
    expect(byHistory.draftRecommendation).toBe(true);
    expect(JSON.parse(byHistory.sources[0].text)).toMatchObject({
      category: "HD",
      minimumRatedMaps: 3,
      selectablePlayers: 1,
      rankedCandidateIds: [eligible.osuId],
    });
    expect(JSON.parse(byHistory.sources[1].text)).toMatchObject({
      username: eligible.username,
      maps: 3,
      ratedMaps: 3,
      actualModUses: 3,
      sampleSufficient: true,
      seasons: [{ editionSlug: history.editionSlug, ratedMaps: 3 }],
    });
    expect(byHistory.sources[1].url).toBe("/players/" + eligible.osuId);

    const profile = await chatEvidence(
      slug,
      eligible.username + "的 HD 實戰如何？",
      "",
    );
    expect(profile.playerProfile).toBe(true);
    expect(
      JSON.parse(profile.sources[0].text).publishedMapHistory,
    ).toContainEqual(
      expect.objectContaining({
        editionSlug: history.editionSlug,
        actualModUsage: [{ mod: "HD", count: 3 }],
        poolPerformance: [
          {
            category: "HD",
            maps: 3,
            ratedMaps: 3,
            averageEffectiveRating: expect.any(Number),
          },
        ],
      }),
    );

    expect((await refreshChatIndex()).failed).toBe(0);
    const indexedMods = await db()
      .select({ content: vectors.content })
      .from(vectors)
      .where(
        and(
          eq(vectors.editionSlug, history.editionSlug),
          eq(vectors.collection, "playerMods"),
        ),
      );
    expect(
      indexedMods.map(({ content }) => JSON.parse(content)),
    ).toContainEqual(
      expect.objectContaining({
        osuId: eligible.osuId,
        actualModUsage: [{ mod: "HD", count: 3 }],
        slotAppearances: [
          { slot: "HD1", plays: 2 },
          { slot: "HD2", plays: 1 },
        ],
      }),
    );

    await db()
      .update(historicalStatistics)
      .set({ published: null, publishedAt: null })
      .where(eq(historicalStatistics.editionSlug, history.editionSlug));
    expect((await chatEvidence(slug, hdQuestion, "")).sources).toEqual(
      hidden.sources,
    );
    expect(
      (
        await searchSeasonIndex(
          previousEdition,
          "MOD history HD Historical Player",
          "",
        )
      ).some((source) => source.text.includes("actualModUsage")),
    ).toBe(false);

    await seedEditions([{ ...previousEdition, published: false }]);

    await db()
      .update(registrations)
      .set({ draftUnavailableReason: "synthetic unavailable" })
      .where(
        and(
          eq(registrations.editionSlug, slug),
          eq(registrations.userId, eligible.osuId),
        ),
      );
    const afterRemoval = await chatEvidence(slug, hdQuestion, "");
    expect(JSON.parse(afterRemoval.sources[0].text)).toMatchObject({
      selectablePlayers: 0,
      candidatesWithRating: 0,
      candidates: [],
    });
    expect(afterRemoval.sources[0].text).not.toContain("synthetic unavailable");

    await db()
      .update(teams)
      .set({ rosterPublished: true })
      .where(eq(teams.id, home.teamId));
    const schedule = await chatEvidence(slug, origin + "/schedule", "");
    expect(JSON.parse(schedule.sources[0].text)).toMatchObject({
      publishedMatches: 2,
      matchesWithPublishedTime: 1,
      publishedResults: 0,
    });
    expect(JSON.stringify(schedule.sources)).not.toContain(
      "Unreleased fixture",
    );
    const tbd = schedule.sources.find((row) =>
      row.title.includes("Public TBD"),
    );
    expect(JSON.parse(tbd!.text).scheduledAt).toBeNull();
    const next = await chatEvidence(
      slug,
      origin + "/schedule",
      "下一場比賽？",
      saved.getTime(),
    );
    expect(next.sources[1].url).toContain(published.id);
    expect(JSON.parse(next.sources[1].text)).toMatchObject({
      scheduledAt: visibleAt.toISOString(),
      timeZone: "Asia/Tokyo",
    });

    expect((await refreshChatIndex()).failed).toBe(0);
    const stored = await db()
      .select({
        url: vectors.url,
        content: vectors.content,
        title: vectors.title,
      })
      .from(vectors)
      .where(eq(vectors.editionSlug, slug));
    for (const section of ["teams", "draft", "schedule"])
      expect(
        stored.some(
          (document) => document.url === `/tournaments/${slug}/${section}`,
        ),
      ).toBe(true);
    expect(JSON.stringify(stored)).not.toContain("Unreleased fixture");
  },
);

it.skipIf(!url)(
  "indexes the complete public directory and answers metric rankings from its current saved values",
  async () => {
    const s11 = { ...edition, slug: "s11" };
    const accepted = { osuId: 1431543, username: "Directory Released" };
    const second = { osuId: 1431544, username: "Directory Second" };
    const pending = { osuId: 1431545, username: "Directory Pending" };
    const players = [accepted, second, pending];
    const savedAt = new Date("2026-11-25T00:00:00Z");
    await seedEditions([s11]);
    await db().insert(users).values(players).onConflictDoNothing();
    await db()
      .insert(registrations)
      .values(
        players.map((player) => ({
          editionSlug: s11.slug,
          userId: player.osuId,
          status:
            player === pending ? ("pending" as const) : ("accepted" as const),
          answers: {},
        })),
      );
    for (const [index, player] of players.entries()) {
      const profile = normalizeOsuProfile(
        {
          id: player.osuId,
          username: player.username,
          statistics: {
            global_rank: [5000, 2000, 100][index],
            pp: 4321 - index,
          },
        },
        player.osuId,
        "osu",
        savedAt.toISOString(),
      );
      await db()
        .insert(userProfileCache)
        .values({
          osuId: player.osuId,
          mode: "osu",
          profile,
          attemptedAt: savedAt,
          retryAt: savedAt,
        })
        .onConflictDoUpdate({
          target: [userProfileCache.osuId, userProfileCache.mode],
          set: { profile },
        });
    }
    await db()
      .insert(otrRatingCache)
      .values(
        players.map((player, index) => ({
          osuId: player.osuId,
          retryAt: savedAt,
          rating: {
            value: [1234, 1100, 9999][index],
            fetchedAt: savedAt.toISOString(),
            profileUrl: `https://synthetic.invalid/player/${player.osuId}`,
          },
        })),
      )
      .onConflictDoUpdate({
        target: otrRatingCache.osuId,
        set: { rating: sql`excluded.rating` },
      });
    const indicator = {
      name: "HD",
      value: -2.1,
      sr: 5.2,
      pp: 40,
      globalRank: 8,
      countryRank: 2,
      accuracy: 0.75,
      combo: 0.25,
    };
    const snapshot = {
      rating: indicator,
      modifications: { Hidden: indicator },
      skillsets: { Aim: { ...indicator, name: "Aim", value: 0 } },
    };
    await db()
      .insert(sipRatingCache)
      .values({
        osuId: accepted.osuId,
        value: -2.1,
        snapshot,
        fetchedAt: savedAt,
      })
      .onConflictDoUpdate({
        target: sipRatingCache.osuId,
        set: { value: -2.1, snapshot, fetchedAt: savedAt },
      });
    await db()
      .insert(importedPlayerRatings)
      .values(
        [accepted, second].map((player) => ({
          editionSlug: s11.slug,
          userId: player.osuId,
          source: "etx" as const,
          value: 9,
          provisional: false,
          outdated: false,
          etxMods: { HR: 3.9 },
        })),
      );
    await db()
      .insert(etxRatingCache)
      .values([
        {
          osuId: accepted.osuId,
          rating: {
            value: 5.8,
            provisional: true,
            outdated: false,
            mods: { HD: 4.7 },
          },
          fetchedAt: savedAt,
          attemptedOn: "2026-11-25",
        },
        {
          osuId: second.osuId,
          rating: null,
          fetchedAt: savedAt,
          attemptedOn: "2026-11-25",
        },
      ])
      .onConflictDoUpdate({
        target: etxRatingCache.osuId,
        set: { rating: sql`excluded.rating`, fetchedAt: savedAt },
      });

    const directoryUrl = "https://oclr.org/tournaments/s11/players";
    calls.length = 0;
    const comparison = await chatEvidence(
      "s11",
      directoryUrl + "\n這個就是了",
      "哪個選手的全球排名最好？",
    );
    expect(comparison.playerDirectory).toBe(true);
    expect(
      comparison.sources.every(
        (source) => source.url === "/tournaments/s11/players",
      ),
    ).toBe(true);
    expect(JSON.parse(comparison.sources[1].text)).toMatchObject({
      totalPlayers: 2,
      playersWithValue: 2,
      top: [
        { name: second.username, value: 2000 },
        { name: accepted.username, value: 5000 },
      ],
    });
    expect(calls).toHaveLength(0);
    const otr = await chatEvidence("s11", "這屆選手的 o!TR 排名", "");
    expect(otr.sources.map((source) => source.title)).toEqual([
      "Public player directory",
      "Players · o!TR (OTR)",
    ]);

    const indexed = () =>
      db()
        .select({
          url: vectors.url,
          content: vectors.content,
          title: vectors.title,
        })
        .from(vectors)
        .where(
          and(
            eq(vectors.editionSlug, s11.slug),
            eq(vectors.collection, "players"),
          ),
        );
    expect((await refreshChatIndex()).failed).toBe(0);
    const first = await indexed();
    expect(calls.flat().join(" ")).not.toContain(pending.username);
    const ratingContent = (title: string) =>
      JSON.parse(first.find((row) => row.title === title)!.content);
    expect(ratingContent(accepted.username + " · ETX MOD")).toMatchObject({
      mods: { HD: 4.7 },
      source: "api",
      provisional: true,
    });
    expect(ratingContent(second.username + " · ETX MOD")).toMatchObject({
      mods: { HR: 3.9 },
      source: "csv",
    });
    expect(
      ratingContent(accepted.username + " · SIP MOD · Hidden (HD)"),
    ).toMatchObject({
      value: -2.1,
      modelComboShare: 0.25,
      globalRank: 8,
    });
    expect(
      ratingContent(accepted.username + " · SIP skillset · Aim"),
    ).toMatchObject({ value: 0 });
    const linkedRatings = await chatEvidence(
      "s11",
      "他的 SIP HD 評分呢？",
      "https://oclr.org/players/" + accepted.osuId,
    );
    expect(
      JSON.parse(linkedRatings.sources[0].text).publishedRatings.sip.snapshot
        .modifications.Hidden,
    ).toMatchObject(indicator);
    expect(
      (
        await searchSeasonIndex(
          s11,
          accepted.username + " SIP HD",
          "",
          undefined,
          "players",
        )
      ).some(
        (source) =>
          source.title === accepted.username + " · SIP MOD · Hidden (HD)",
      ),
    ).toBe(true);
    const doc = first.find(
      (row) =>
        row.url === `/players/${accepted.osuId}?edition=s11` &&
        row.title === accepted.username,
    );
    expect(JSON.parse(doc!.content)).toMatchObject({
      rank: 5000,
      pp: 4321,
      otr: 1234,
      sip: -2.1,
      etx: 5.8,
      etxProvisional: true,
    });
    expect(
      JSON.parse(
        first.find(
          (row) =>
            row.url === `/players/${second.osuId}?edition=s11` &&
            row.title === second.username,
        )!.content,
      ),
    ).toMatchObject({
      etx: null,
      sip: null,
    });
    expect(await refreshChatIndex()).toMatchObject({
      updated: 0,
      removed: 0,
      failed: 0,
    });

    await db()
      .update(otrRatingCache)
      .set({
        rating: {
          value: 900,
          fetchedAt: savedAt.toISOString(),
          profileUrl: "https://synthetic.invalid/player",
        },
      })
      .where(eq(otrRatingCache.osuId, accepted.osuId));
    await db()
      .update(sipRatingCache)
      .set({ snapshot: { ...snapshot, modifications: null } })
      .where(eq(sipRatingCache.osuId, accepted.osuId));
    const refreshed = await refreshChatIndex();
    expect(refreshed.failed).toBe(0);
    expect(
      (await indexed()).some(
        (row) => row.title === accepted.username + " · SIP MOD · Hidden (HD)",
      ),
    ).toBe(false);
    expect(refreshed.updated).toBeGreaterThan(0);
    expect(refreshed.removed).toBeGreaterThan(0);
    expect(
      (await indexed()).some((row) => row.content.includes('"otr":900')),
    ).toBe(true);

    await db()
      .update(registrations)
      .set({ status: "withdrawn" })
      .where(
        and(
          eq(registrations.editionSlug, s11.slug),
          eq(registrations.userId, accepted.osuId),
        ),
      );
    const current = await chatEvidence("s11", "這屆選手的 ETX 排行", "");
    expect(JSON.parse(current.sources[1].text)).toMatchObject({
      totalPlayers: 1,
      playersWithValue: 0,
      top: [],
    });
    expect(
      (await searchSeasonIndex(s11, accepted.username, "")).every(
        (row) => !row.text.includes(accepted.username),
      ),
    ).toBe(true);
    expect((await refreshChatIndex()).removed).toBeGreaterThan(0);
    expect(
      (await indexed()).some((row) => row.url.includes(String(accepted.osuId))),
    ).toBe(false);
  },
);

it.skipIf(!url)(
  "indexes public artwork once per image and returns the matching difficulty for a visual query",
  async () => {
    const season = structuredClone(archived);
    const maps = season.archive.pools[0].maps;
    maps[0].beatmapSetId = 8899001;
    maps[1].beatmapSetId = 8899002;
    const live = { ...edition, slug: "live-artwork-cup" };
    await seedEditions([season, live]);
    const [stage] = await db()
      .insert(tournamentStages)
      .values({ editionSlug: live.slug, kind: "group" })
      .returning();
    const [round] = await db()
      .insert(tournamentRounds)
      .values({
        editionSlug: live.slug,
        stageId: stage.id,
        name: "Group round",
        position: 1,
      })
      .returning();
    const [published, draft] = await db()
      .insert(mappools)
      .values([
        {
          editionSlug: live.slug,
          roundId: round.id,
          name: "Released pool",
          publishedAt: new Date(),
        },
        { editionSlug: live.slug, roundId: round.id, name: "Unreleased pool" },
      ])
      .returning();
    const metadata = {
      setId: 8899003,
      artist: "Fixture artist",
      title: "Live Sakura Map",
      difficulty: "Fixture difficulty",
      mapper: "Fixture mapper",
      mode: "osu" as const,
      ar: 9,
      bpm: 170,
      duration: 90,
      stars: 5.5,
    };
    await db()
      .insert(mappoolEntries)
      .values([
        {
          poolId: published.id,
          category: "HD",
          position: 1,
          beatmapId: 8899031,
          metadata,
        },
        {
          poolId: draft.id,
          category: "HD",
          position: 1,
          beatmapId: 8899041,
          metadata: {
            ...metadata,
            title: "PRIVATE-DRAFT-ARTWORK",
            setId: 8899004,
          },
        },
      ]);
    await db().execute(sql`TRUNCATE chat_artwork_captions, osu_cached_images`);
    vi.stubEnv("OCLR_CHAT_VISION_MODEL", "vision-test");
    vi.stubEnv("OCLR_CHAT_EMBEDDING_MODEL", "artwork-embedding-test");
    const requests: string[] = [];
    const first =
      "Anime girl with long blue hair and a red ribbon under cherry blossoms. 美少女、藍髮、紅色蝴蝶結、櫻花、蓝发、红色蝴蝶结、樱花";
    const second = "Snowy mountain peaks. 雪山、山峰";
    const sharp = (await import("sharp")).default;
    const pix = await Promise.all(
      ["red", "blue"].map((background) =>
        sharp({ create: { width: 8, height: 8, channels: 3, background } })
          .jpeg()
          .toBuffer(),
      ),
    );
    let visions = 0;
    let blockArtworkEmbeddings = false;
    let blockVision = false;
    let unavailableSetId = "";
    vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
      const address = new URL(input);
      requests.push(address.pathname);
      if (address.hostname === "assets.ppy.sh") {
        if (
          unavailableSetId &&
          address.pathname.includes(`/${unavailableSetId}/`)
        )
          return new Response(null, { status: 503 });
        const image = /889900[13]/.test(address.pathname) ? pix[0] : pix[1];
        return new Response(new Uint8Array(image), {
          headers: { "content-type": "image/jpeg" },
        });
      }
      expect(address.origin).toBe("https://synthetic.invalid");
      const body = JSON.parse(String(init.body));
      if (address.pathname.endsWith("/chat/completions")) {
        expect(body.model).toBe("vision-test");
        expect(body.messages[0].content[0].text).toContain(
          "hair style and color",
        );
        if (blockVision) return new Response(null, { status: 503 });
        const image = body.messages[0].content.find(
          (part: { type: string }) => part.type === "image_url",
        );
        expect(image.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
        const { data } = await sharp(
          Buffer.from(image.image_url.url.split(",")[1], "base64"),
        )
          .raw()
          .toBuffer({ resolveWithObject: true });
        visions++;
        return Response.json({
          id: "caption",
          object: "chat.completion",
          created: 1,
          model: "vision-test",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: data[0] > data[2] ? first : second,
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 8, completion_tokens: 8, total_tokens: 16 },
        });
      }
      expect(address.pathname).toBe("/v1/embeddings");
      if (blockArtworkEmbeddings && body.input.includes(second))
        return new Response(null, { status: 503 });
      return Response.json({
        object: "list",
        data: body.input.map((value: string, index: number) => ({
          object: "embedding",
          index,
          embedding: /美少女|藍髮/.test(value) ? [1, 0] : [0, 1],
        })),
        model: body.model,
        usage: { prompt_tokens: 1, total_tokens: 1 },
      });
    });
    const indexed = await refreshChatIndex();
    expect(indexed.failed).toBe(0);
    expect(visions).toBe(3);
    const visual = "譜面BG圖是美少女的譜面/map";
    const results = (await chatEvidence(season.slug, visual, "選手有多少"))
      .sources;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      url: "https://osu.ppy.sh/beatmaps/123456",
      text: first,
    });
    expect(results[0].title).toContain(maps[0].slot);
    const standalone = "有哪些背景圖有美少女";
    const evidence = await chatEvidence(season.slug, standalone, "");
    expect(evidence).toMatchObject({
      artworkSearch: "美少女",
      sources: results,
    });
    expect(
      await chatEvidence(season.slug, "我說的就是譜面背景", standalone),
    ).toMatchObject({ artworkSearch: "美少女", sources: results });
    expect(
      await chatEvidence(season.slug, "藍髮的譜面背景圖有哪些？", ""),
    ).toMatchObject({ artworkSearch: "藍髮", sources: results });
    const livePath = `/tournaments/${live.slug}/mappools`;
    const liveUrl = "https://oclr.org" + livePath;
    const overview = await chatEvidence(live.slug, liveUrl, "");
    expect(overview.mappoolDirectory).toBe(true);
    expect(overview.sources[0].url).toBe(livePath);
    expect(JSON.parse(overview.sources[0].text)).toMatchObject({
      publishedPools: 1,
      publishedSlots: 1,
    });
    expect(overview.sources[1].text).toContain(
      "HD1 Fixture artist Live Sakura Map",
    );
    expect(overview.sources[1].text).toContain("BPM 170");
    expect(JSON.stringify(overview.sources)).not.toContain("PRIVATE-DRAFT");
    expect(requests.some((path) => path.includes("8899004"))).toBe(false);

    const liveVisual = await chatEvidence(
      live.slug,
      liveUrl + "\n這個就是了",
      "背景圖是美少女的有哪些？",
    );
    expect(liveVisual.sources).toEqual([
      expect.objectContaining({
        title: expect.stringContaining("Live Sakura Map"),
        url: "https://osu.ppy.sh/beatmaps/8899031",
        text: first,
      }),
    ]);
    expect((await refreshChatIndex()).updated).toBe(0);
    expect(visions).toBe(3);

    // Captions are already verified against the public pool even if their
    // embedding row has not been stored yet.
    await db()
      .delete(vectors)
      .where(
        and(
          eq(vectors.editionSlug, live.slug),
          eq(vectors.collection, "artwork"),
        ),
      );
    expect(
      (await chatEvidence(live.slug, "背景圖是美少女的有哪些？", liveUrl))
        .sources,
    ).toEqual(liveVisual.sources);
    season.archive.pools[0].maps = [maps[1]];
    await seedEditions([season]);
    expect((await chatEvidence(season.slug, visual, "")).sources).toEqual([]);
    vi.stubEnv("OCLR_CHAT_VISION_MODEL", "");
    expect((await refreshChatIndex()).removed).toBeGreaterThan(0);
    expect(
      requests.filter((path) => path === "/v1/chat/completions"),
    ).toHaveLength(3);

    // Historical slots may only have a difficulty ID, as on older archive pages.
    const backlog = structuredClone(season);
    backlog.slug = backlog.archive.editionSlug = "historical-artwork-backlog";
    backlog.archive.pools[0].maps = Array.from({ length: 18 }, (_, i) => ({
      ...maps[0],
      slot: `NM${i + 1}`,
      beatmapId: 8899100 + i,
      beatmapSetId: undefined,
    }));
    await seedEditions([backlog]);
    const lookup = vi.spyOn(archiveArtwork, "archiveArtworkLookup");
    let omitLast = true;
    lookup.mockImplementation(async (ids) => ({
      setIds: Object.fromEntries(
        ids.flatMap((id) =>
          id === null || (omitLast && id === 8899117) ? [] : [[id, id + 100]],
        ),
      ),
      missingBeatmapIds: omitLast ? [8899117] : [],
    }));
    vi.stubEnv("OCLR_CHAT_VISION_MODEL", "vision-test");
    unavailableSetId = "8899200";
    const report = vi.fn();
    expect((await refreshChatIndex(report)).status).toBe("partial");
    const progress = () =>
      report.mock.calls.find(([entry]) => entry.edition === backlog.slug)?.[0];
    const refreshBacklog = async () => {
      report.mockClear();
      await refreshChatIndex(report);
      return progress();
    };
    expect(progress()).toMatchObject({
      completed: 15,
      pending: 1,
      failed: 2,
      unresolvedSlots: 1,
    });

    // A saved index row with the same model but a missing vector must be repaired.
    await db()
      .update(vectors)
      .set({ embedding: null })
      .where(
        and(
          eq(vectors.editionSlug, backlog.slug),
          eq(vectors.collection, "artwork"),
          eq(vectors.url, "https://osu.ppy.sh/beatmaps/8899101"),
        ),
      );
    unavailableSetId = "";
    omitLast = false;
    blockArtworkEmbeddings = true;
    expect(await refreshBacklog()).toMatchObject({
      completed: 14,
      pending: 0,
      failed: 4,
      unresolvedSlots: 0,
    });
    blockArtworkEmbeddings = false;
    const beforeRetry = visions;
    expect(await refreshBacklog()).toMatchObject({
      completed: 18,
      pending: 0,
      failed: 0,
      unresolvedSlots: 0,
    });
    expect(visions).toBe(beforeRetry);

    const { key, previousKey } = visionConfiguration()!;
    await db()
      .update(captions)
      .set({ model: previousKey })
      .where(eq(captions.image, "8899003"));
    blockVision = true;
    expect((await refreshChatIndex()).failed).toBe(1);
    expect(await chatEvidence(live.slug, standalone, "")).toMatchObject({
      artworkSearch: "美少女",
      sources: liveVisual.sources,
    });
    blockVision = false;
    expect((await refreshChatIndex()).failed).toBe(0);
    const [refreshed] = await db()
      .select({ model: captions.model })
      .from(captions)
      .where(eq(captions.image, "8899003"));
    expect(refreshed.model).toBe(key);
    lookup.mockRestore();
  },
);
