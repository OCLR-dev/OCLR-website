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
import type { DraftBoard } from "../../src/lib/draft-types";
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
  await page.route("https://a.ppy.sh/**", (r) =>
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
    "[data-rosters]",
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
  test("broadcast compositions, transparent canvas, languages, missing data and crowded rosters fit intended sizes", async ({
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
    board.rosters = Array.from({ length: 8 }, (_, i) => ({
      team: {
        ...initial.rosters[i % 2].team,
        id: `synthetic-${i}`,
        name: `Synthetic long team ${i + 1}`,
      },
      players: Array.from({ length: 8 }, (_, n) => ({
        osuId: 800000 + i * 10 + n,
        username: `Long synthetic roster ${n + 1}`,
      })),
    }));
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
      const buttons = page.locator("[data-rosters] button");
      await buttons.last().focus();
      await buttons.last().press("Enter");
      await expect(page.locator("[data-rosters]")).toContainText(
        "Synthetic long team 3",
      );
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    // Browser image failure must retain a neutral initials fallback.
    await page.route("https://a.ppy.sh/**", (r) => r.abort());
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
    let board: DraftBoard | null = structuredClone(initial);
    let fail = false;
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      const original = Element.prototype.animate;
      Object.assign(window, { broadcastAnimations: [] });
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
        "oclr-turn",
        "oclr-roster",
        "oclr-history",
      ]),
    );
    await page.waitForTimeout(1000);
    const count = (await animated()).length;
    await page.waitForTimeout(2300);
    expect((await animated()).length).toBe(count);
    await page.reload();
    await page.waitForTimeout(2300);
    expect(await animated()).toEqual([]);
    fail = true;
    await expect(page.getByRole("status")).toContainText("Reconnecting");
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
      "The stage is ready.",
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
    await expect(page.locator("[data-live-status]")).toHaveText("Paused");
    expect(await animated()).toEqual(
      expect.arrayContaining(["oclr-turn", "oclr-status"]),
    );
    expect((await animated()).filter((x) => x === "oclr-pick")).toHaveLength(0);
  });
});
