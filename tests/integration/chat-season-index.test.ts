import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq, and, sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import {
  chatSourceVectors as vectors,
  etxRatingCache,
  importedPlayerRatings,
  otrRatingCache,
  registrations,
  mappools,
  mappoolEntries,
  tournamentRounds,
  tournamentStages,
  sipRatingCache,
  userProfileCache,
  users,
} from "@/db/schema";
import { refreshChatIndex } from "@/lib/chat-index-worker";
import { chatEvidence } from "@/lib/chat-sources";
import { normalizeOsuProfile } from "@/lib/osu-profile-model";
import { searchSeasonIndex } from "@/lib/chat-vectors";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import { assertTestDatabase } from "../database";

const url = process.env.TEST_DATABASE_URL;
const archived = {
  ...edition,
  slug: historicalArchive.editionSlug,
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
          text.includes("Historical Title") || text === "星際旋律是哪首？"
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
      .select({ collection: vectors.collection })
      .from(vectors)
      .where(eq(vectors.editionSlug, archived.slug));
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
    calls.length = 0;
    expect(await refreshChatIndex()).toMatchObject({
      updated: 0,
      removed: 0,
      failed: 0,
    });
    expect(calls).toHaveLength(0);
    const semantic = await searchSeasonIndex(archived, "星際旋律是哪首？", "");
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
    await db()
      .insert(sipRatingCache)
      .values({
        osuId: accepted.osuId,
        value: -2.1,
        fetchedAt: savedAt,
      })
      .onConflictDoUpdate({
        target: sipRatingCache.osuId,
        set: { value: -2.1, fetchedAt: savedAt },
      });
    await db()
      .insert(importedPlayerRatings)
      .values(
        [accepted, second].map((player) => ({
          editionSlug: s11.slug,
          userId: player.osuId,
          source: "etx" as const,
          value: 9,
        })),
      );
    await db()
      .insert(etxRatingCache)
      .values([
        {
          osuId: accepted.osuId,
          rating: { value: 5.8, provisional: true, outdated: false },
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
        .select({ url: vectors.url, content: vectors.content })
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
    const doc = first.find(
      (row) => row.url === `/players/${accepted.osuId}?edition=s11`,
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
        first.find((row) => row.url === `/players/${second.osuId}?edition=s11`)!
          .content,
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
    const refreshed = await refreshChatIndex();
    expect(refreshed.failed).toBe(0);
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
    const first = "Anime girl under cherry blossoms. 美少女、櫻花、樱花";
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
    vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
      const address = new URL(input);
      requests.push(address.pathname);
      if (address.hostname === "assets.ppy.sh") {
        const image = /889900[13]/.test(address.pathname) ? pix[0] : pix[1];
        return new Response(new Uint8Array(image), {
          headers: { "content-type": "image/jpeg" },
        });
      }
      expect(address.origin).toBe("https://synthetic.invalid");
      const body = JSON.parse(String(init.body));
      if (address.pathname.endsWith("/chat/completions")) {
        expect(body.model).toBe("vision-test");
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
      return Response.json({
        object: "list",
        data: body.input.map((value: string, index: number) => ({
          object: "embedding",
          index,
          embedding: value.includes("美少女") ? [1, 0] : [0, 1],
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
  },
);
