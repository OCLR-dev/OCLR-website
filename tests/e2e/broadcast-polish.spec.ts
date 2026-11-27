import { test, expect, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db, closeDb } from "../../src/db";
import { userProfileCache } from "../../src/db/schema";
import { prepareDraft } from "../fixtures/draft";
import { pickPlayer } from "../../src/lib/draft";
import { staffDraft } from "../../src/lib/draft-reads";
import { profileResponse } from "../fixtures/osu-profile";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import type { BroadcastBoard as DraftBoard } from "../../src/lib/draft-types";
const slug = "overlay-103-test",
  endpoint = `/api/tournaments/${slug}/draft`,
  overlay = `/tournaments/${slug}/draft/overlay`;
async function seed(page: Page, count = 1) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.ADMIN_OSU_IDS = "110001";
  await db().execute(
    sql`TRUNCATE edition_state,users,user_profile_cache CASCADE`,
  );
  const f = await prepareDraft(slug, 110001, 6);
  for (const p of [f.a, f.b, ...f.players]) {
    await db()
      .insert(userProfileCache)
      .values({
        osuId: p.osuId,
        mode: "osu",
        attemptedAt: new Date(),
        retryAt: new Date(),
        profile: normalizeOsuProfile(
          {
            ...profileResponse,
            id: p.osuId,
            avatar_url: `https://a.ppy.sh/${p.osuId}`,
            statistics: {
              ...profileResponse.statistics,
              pp: 8799,
              global_rank: 15066,
            },
          },
          p.osuId,
          "osu",
        ),
      });
  }
  for (const player of f.players.slice(0, count)) {
    const s = (await staffDraft(f.staff, slug)).session!;
    await pickPlayer(f.staff, slug, {
      sessionId: s.id,
      turnIndex: s.turnIndex,
      candidateId: player.osuId,
      expectedVersion: s.version,
      idempotencyKey: randomUUID(),
    });
  }
  const image = await sharp({
    create: { width: 120, height: 120, channels: 3, background: "#9961bf" },
  })
    .png()
    .toBuffer();
  await page.route("**/api/osu-images/avatar/*", (r) =>
    r.fulfill({ body: image, contentType: "image/png" }),
  );
  return (
    await page.request.get(`${endpoint}?overlay=1`)
  ).json() as Promise<DraftBoard>;
}
async function fits(page: Page) {
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    })),
  ).toEqual(
    await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
  );
  for (const selector of [
    "[data-featured]",
    "[data-turn-card]",
    "[data-ratings]",
    "[data-history]",
  ]) {
    const size = await page
      .locator(selector)
      .evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(
      size.scroll,
      `${selector} ${await page.title()} ${JSON.stringify(size)}`,
    ).toBeLessThanOrEqual(size.client + 1);
  }
}
test.use({ video: { mode: "on", size: { width: 1280, height: 720 } } });
test.describe("OBS identity and one-time transitions", () => {
  test.skip(!process.env.TEST_DATABASE_URL);
  test.afterAll(closeDb);
  test("broadcast compositions, transparent canvas, languages, rating charts and missing data fit intended sizes", async ({
    page,
    context,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Dedicated 720p–1080p broadcast canvas; mobile covered by broadcast.spec.ts",
    );
    test.setTimeout(120000);
    const initial = await seed(page, 4);
    let board: DraftBoard | null = structuredClone(initial);
    board.picks.at(-1)!.ratings = {
      otr: 1500,
      sip: 130,
      etx: 8.5,
      etxMods: { NM: 8.5, HD: 7.3, HR: 8, DT: 8.9, FM: 6.5 },
      sipSkills: { Aim: 7.3, Tapping: 6.7, Precision: 6.9 },
    };
    await page.route(`**${endpoint}*`, (r) => r.fulfill({ json: board }));
    for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
      await context.addCookies([
        { name: "oclr-locale", value: locale, domain: "127.0.0.1", path: "/" },
      ]);
      for (const [width, height] of [
        [1920, 1080],
        [1600, 900],
        [1280, 720],
      ]) {
        await page.setViewportSize({ width, height });
        for (const transparent of [false, true]) {
          await page.goto(
            overlay + (transparent ? "?background=transparent" : ""),
          );
          await expect(page.locator("[data-featured]")).toContainText("8,799");
          await expect(page.locator("[data-featured]")).toContainText(
            "#15,066",
          );
          await expect(page.locator("[data-featured] img")).toBeVisible();
          await expect(page.locator("[data-featured]")).toContainText("8.50");
          await expect(page.locator("[data-ratings] figure svg")).toHaveCount(
            2,
          );
          await expect(page.locator("[data-broadcast] footer")).toHaveCount(0);
          await fits(page);
        }
      }
    }
    board = structuredClone(initial);
    board.picks.at(-1)!.player.profile = {
      avatarUrl: null,
      pp: null,
      globalRank: null,
      status: "unavailable",
      fetchedAt: null,
    };
    board.picks.at(-1)!.player.username = "A long featured username";
    for (const [width, height] of [
      [1920, 1080],
      [1600, 900],
      [1280, 720],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(overlay);
      await expect(page.locator("[data-profile-status]")).toHaveAttribute(
        "data-profile-status",
        "unavailable",
      );
      await expect(page.locator("[data-profile-status]")).toContainText("—");
      await fits(page);
      await expect(page.locator("[data-ratings] figure svg")).toHaveCount(2);
      await expect(
        page.locator("[data-motion-radar] polygon[opacity='0']"),
      ).toHaveCount(2);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    // Browser image failure must retain a neutral initials fallback.
    await page.route("**/api/osu-images/avatar/*", (r) => r.abort());
    await page.reload();
    await expect(page.locator("[data-featured] img")).toHaveCount(0);
    await expect(page.locator("[data-featured]")).toContainText("A ");
  });
  test("new picks and turns animate once; reload, repeat, reconnect, corrections, sessions and reduced motion do not reveal old picks", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile);
    test.setTimeout(120000);
    const initial = await seed(page);
    initial.picks[0].ratings = {
      otr: null,
      sip: null,
      etx: 2,
      etxMods: { NM: 2, HD: 2, HR: 2, DT: 2, FM: 2 },
      sipSkills: {},
    };
    let board: DraftBoard | null = structuredClone(initial);
    let fail = false;
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      const original = Element.prototype.animate;
      const clone = Node.prototype.cloneNode;
      const sceneCopies: string[] = [];
      Object.assign(window, {
        broadcastAnimations: [],
        broadcastSceneCopies: sceneCopies,
      });
      Node.prototype.cloneNode = function (deep) {
        if (
          this instanceof HTMLElement &&
          this.matches("[data-pick-feature]")
        ) {
          sceneCopies.push(this.textContent ?? "");
        }
        return clone.call(this, deep);
      };
      Element.prototype.animate = function (frames, options) {
        const id = typeof options === "object" ? options?.id : undefined;
        if (id?.startsWith("oclr-"))
          (
            window as unknown as { broadcastAnimations: string[] }
          ).broadcastAnimations.push(id);
        return original.call(this, frames, options);
      };
    });
    await page.route(`**${endpoint}*`, (r) =>
      fail ? r.abort() : r.fulfill({ json: board }),
    );
    const animated = () =>
      page.evaluate(
        () =>
          (window as unknown as { broadcastAnimations: string[] })
            .broadcastAnimations,
      );
    await page.goto(overlay);
    await page.waitForTimeout(2300);
    expect(await animated()).toEqual([]);
    const etx = page.locator('[data-pick-feature] [data-motion-number="etx"]');
    await expect(etx).toHaveText("2.00");
    const grid = await page
      .locator("[data-ratings] svg > polygon")
      .first()
      .elementHandle();
    function append(id: string, playerId: number) {
      const team = board!.activeTeam!;
      const pick = {
        id,
        turnIndex: board!.turnIndex,
        team,
        player: {
          osuId: playerId,
          username: `New public player ${playerId}`,
          profile: initial.picks[0].player.profile,
        },
        ratings: {
          otr: null,
          sip: null,
          etx: 8,
          etxMods: { NM: 8, HD: 8, HR: 8, DT: 8, FM: 8 },
          sipSkills: {},
        },
      };
      board = {
        ...board!,
        version: board!.version + 1,
        turnIndex: board!.turnIndex + 1,
        activeTeam: initial.rosters.find((r) => r.team.id !== team.id)!.team,
        picks: [...board!.picks, pick],
        rosters: board!.rosters.map((r) =>
          r.team.id === team.id
            ? { ...r, players: [...r.players, pick.player] }
            : r,
        ),
      };
    }
    append("new-pick", 990001);
    await expect(page.locator("[data-featured]")).toContainText(
      "New public player 990001",
    );
    expect(await animated()).toEqual(
      expect.arrayContaining([
        "oclr-pick",
        "oclr-sweep",
        "oclr-outgoing-pick",
        "oclr-turn",
        "oclr-history",
      ]),
    );
    await expect(etx).toHaveText("8.00");
    await expect(
      page.locator('[data-motion-radar="etx"] circle').first(),
    ).toHaveAttribute("cy", "47.2");
    expect(
      await grid?.evaluate(
        (node) =>
          node === document.querySelector("[data-ratings] svg > polygon"),
      ),
    ).toBe(true);
    const count = (await animated()).length;
    const sceneCopies = () =>
      page.evaluate(
        () =>
          (window as unknown as { broadcastSceneCopies: string[] })
            .broadcastSceneCopies.length,
      );
    const copyCount = await sceneCopies();
    expect(copyCount).toBeGreaterThan(0);
    await page.waitForTimeout(2300);
    expect((await animated()).length).toBe(count);
    expect(await sceneCopies()).toBe(copyCount);
    await page.reload();
    await page.waitForTimeout(2300);
    expect(await animated()).toEqual([]);
    const disconnected = page.waitForEvent("requestfailed", (request) => {
      const url = new URL(request.url());
      return url.pathname === endpoint && !url.searchParams.has("live");
    });
    fail = true;
    await disconnected;
    append("offline-pick", 990002);
    fail = false;
    await expect(page.locator("[data-featured]")).toContainText("990002");
    expect(await animated()).toEqual([]);
    const valid = structuredClone(board!);
    board = { ...board!, version: board!.version - 2, picks: initial.picks };
    await page.waitForTimeout(2300);
    await expect(page.locator("[data-featured]")).toContainText("990002");
    expect(await animated()).toEqual([]);
    board = {
      ...valid,
      version: valid.version + 1,
      picks: valid.picks.slice(0, -1),
    };
    await expect(page.locator("[data-featured]")).toContainText("990001");
    expect(await animated()).toEqual([]);
    board = null;
    await expect(page.locator("[data-featured]")).toContainText(
      "No picks published yet.",
    );
    board = { ...valid, sessionId: "replacement-session" };
    await expect(page.locator("[data-featured]")).toContainText("990002");
    expect(await animated()).toEqual([]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    append("reduced-pick", 990003);
    await expect(page.locator("[data-featured]")).toContainText("990003");
    expect(await animated()).toEqual([]);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    board = { ...board!, version: board!.version + 1, state: "paused" };
    await expect(page.locator("[data-turn-card]")).toContainText("ON HOLD");
    expect(await animated()).toEqual([]);
  });
});
