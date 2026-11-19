import { english } from "../../src/i18n/translate";
import { readLiruCollection } from "../../src/lib/liru-collection";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "../../src/db";
import { liruDailyGacha, users } from "../../src/db/schema";
import { GET, POST } from "../../src/app/api/wiki/liru-gallery/gacha/route";
import { createSession } from "../../src/lib/auth/sessions";
import { liruGachaDay } from "../../src/lib/liru-gacha";
import {
  liruGachaPath,
  liruGachaStatusSchema,
} from "../../src/lib/liru-gacha-model";
import { assertTestDatabase } from "../database";

const browser = vi.hoisted(() => ({
  token: undefined as string | undefined,
  bearer: false,
}));
vi.mock("next/headers.js", () => ({
  cookies: async () => ({
    get: () => (browser.token ? { value: browser.token } : undefined),
  }),
  headers: async () =>
    new Headers(browser.bearer ? { authorization: "Bearer test" } : {}),
}));

const url = process.env.TEST_DATABASE_URL;
const origin = "https://oclr.example.test";
const actor = { osuId: 321041, username: "Gallery Tester" };
const other = { osuId: 321042, username: "Second Gallery Tester" };
function post(input: unknown, requestOrigin = origin) {
  return POST(
    new Request(origin + liruGachaPath, {
      method: "POST",
      headers: { origin: requestOrigin, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

describe.skipIf(!url)("Liru daily draw persistence", () => {
  beforeAll(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("APP_URL", origin);
    await db().insert(users).values([actor, other]);
  });

  afterAll(async () => {
    for (const player of [actor, other]) {
      await db().delete(users).where(eq(users.osuId, player.osuId));
    }
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("isolates receipts by account and spends each day's reward exactly once", async () => {
    const day = liruGachaDay();
    const claim = { day, action: "check-in" };
    const draw = { day, action: "draw" };
    expect((await getAnonymous()).status).toBe(401);
    expect((await post(claim)).status).toBe(401);

    browser.token = (await createSession(actor.osuId)).token;
    browser.bearer = true;
    expect((await post(claim)).status).toBe(403);
    browser.bearer = false;
    expect((await post(claim, "https://cross-origin.test")).status).toBe(403);
    expect((await post({ ...claim, osuId: other.osuId })).status).toBe(400);
    expect((await post({ ...claim, day: "2000-01-01" })).status).toBe(409);
    expect((await post(draw)).status).toBe(409);

    const initial = await GET();
    expect(initial.headers.get("cache-control")).toBe("private, no-store");
    expect(await initial.json()).toEqual({
      day,
      checkedIn: false,
      cards: null,
    });

    const checks = await Promise.all(
      Array.from({ length: 4 }, () => post(claim)),
    );
    for (const response of checks) {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        day,
        checkedIn: true,
        cards: null,
      });
    }

    const draws = await Promise.all(
      Array.from({ length: 6 }, () => post(draw)),
    );
    const results = await Promise.all(
      draws.map(async (response) => {
        expect(response.status).toBe(200);
        return liruGachaStatusSchema.parse(await response.json());
      }),
    );
    expect(results[0].cards).toHaveLength(10);
    expect(results[0].cards?.[9].rarity).not.toBe("R");
    for (const result of results) expect(result).toEqual(results[0]);
    expect(await (await GET()).json()).toEqual(results[0]);
    expect(await (await post(claim)).json()).toEqual(results[0]);
    expect(
      await db()
        .select()
        .from(liruDailyGacha)
        .where(eq(liruDailyGacha.osuId, actor.osuId)),
    ).toHaveLength(1);

    browser.token = (await createSession(other.osuId)).token;
    expect(await (await GET()).json()).toEqual({
      day,
      checkedIn: false,
      cards: null,
    });
    expect((await post(draw)).status).toBe(409);
  });

  it("collects cards from prior draws, including retired cards, without exposing dates or mixing accounts", async () => {
    const maid = {
      src: "/mascot/liru/gallery/elegant-maid.webp",
      rarity: "SSR",
    } as const;
    const retired = {
      src: "/mascot/liru/gallery/mint-bunny-picnic.webp",
      rarity: "SR",
    } as const;
    const earlierRarity = { ...retired, rarity: "UR" } as const;
    await db()
      .insert(liruDailyGacha)
      .values([
        {
          osuId: other.osuId,
          day: "2026-01-01",
          drawnAt: new Date("2026-01-01T03:00:00Z"),
          cards: Array(10).fill(maid),
        },
        {
          osuId: other.osuId,
          day: "2026-01-02",
          drawnAt: new Date("2026-01-02T03:00:00Z"),
          cards: [...Array(8).fill(maid), retired, earlierRarity],
        },
        { osuId: other.osuId, day: "2026-01-03" },
      ]);
    const cards = await readLiruCollection(other.osuId, english);
    expect(
      cards.map(({ figure, count }) => ({
        src: figure.src,
        rarity: figure.rarity,
        count,
      })),
    ).toEqual([
      { ...earlierRarity, count: 1 },
      { ...maid, count: 18 },
      { ...retired, count: 1 },
    ]);
    expect(cards[1].figure.caption).toBe("Elegant maid outfit");
    expect(Object.keys(cards[1]).sort()).toEqual(["count", "figure"]);
    expect(await readLiruCollection(321099, english)).toEqual([]);
  });
});

function getAnonymous() {
  browser.token = undefined;
  return GET();
}
