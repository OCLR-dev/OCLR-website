import { englishStorage } from "../fixtures/preferences";
import { captureResponsiveLayout } from "./responsive";
import { openTournamentTool } from "./navigation";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { seedSession } from "./session";
import { db, closeDb } from "../../src/db";
import {
  mappools,
  mappoolEntries,
  mappoolEvents,
  staffRoles,
} from "../../src/db/schema";
test.describe("published mappools and restricted editing", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("Mappooler configures FM and slots, anonymous visitors see only released maps", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    const id = isMobile ? 200101 : 200001;
    const adminId = isMobile ? 70001 : 60001;
    const cookie = await seedSession(id);
    await db().execute(sql`TRUNCATE tournament_stages CASCADE`);
    await seedSession(adminId);
    await db().insert(staffRoles).values({
      userId: id,
      role: "mappooler",
      editionSlug: "test-cup",
      grantedBy: adminId,
    });
    await context.addCookies([cookie]);
    const refereeId = id + 1;
    const refCookie = await seedSession(refereeId);
    await db().insert(staffRoles).values({
      userId: refereeId,
      role: "referee",
      editionSlug: "test-cup",
      grantedBy: adminId,
    });
    const guest = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    const referee = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    await referee.addCookies([refCookie]);
    const url = "/api/admin/tournaments/test-cup/mappools";
    const headers = { origin: "http://127.0.0.1:3100" };
    try {
      expect((await guest.request.get(url)).status()).toBe(401);
      expect((await referee.request.get(url)).status()).toBe(403);
      expect(
        (
          await referee.request.post(url, {
            headers,
            data: { confirmed: true },
          })
        ).status(),
      ).toBe(403);
      await openTournamentTool(page, "test-cup", "Rounds", isMobile);
      await page
        .getByRole("button", { name: "+ New round", exact: true })
        .click();
      await page
        .getByLabel("Round name", { exact: true })
        .fill("Synthetic Group Round");
      await page
        .getByRole("button", { name: "Create round", exact: true })
        .click();
      await expect(
        page.getByRole("list", { name: "Rounds", exact: true }),
      ).toContainText("Synthetic Group Round");
      await openTournamentTool(page, "test-cup", "Mappools", isMobile);
      await page
        .getByRole("button", { name: "+ New pool", exact: true })
        .click();
      await page.getByLabel("New pool name").fill("Synthetic Browser Pool");
      await page.getByRole("button", { name: "Create draft pool" }).click();
      await expect(
        page.getByRole("heading", { name: "Synthetic Browser Pool" }),
      ).toBeVisible();
      await page
        .getByRole("tab", { name: "Pool settings", exact: true })
        .click();
      await page
        .getByRole("combobox", { name: /^FM policy/ })
        .selectOption("force_mod");
      await page
        .getByLabel("Approved FM restrictions")
        .fill("Synthetic test restrictions — not tournament rules");
      const [savedSettings] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().endsWith(url) && r.request().method() === "POST",
        ),
        page.getByRole("button", { name: "Save pool settings" }).click(),
      ]);
      expect(savedSettings.status()).toBe(200);
      await expect(page.locator(".mappool-pool-heading")).not.toContainText(
        /\bv\d+/,
      );
      const data = await (await context.request.get(url)).json();
      const pool = data.pools[0];
      expect(
        (
          await guest.request.get(
            `/api/tournaments/test-cup/mappools/${pool.id}`,
          )
        ).status(),
      ).toBe(404);
      const guestPage = await guest.newPage();
      expect(
        (
          await guestPage.goto(`/tournaments/test-cup/mappools/${pool.id}`)
        )?.status(),
      ).toBe(404);
      const previewUrl = `${url}/preview`;
      expect(
        (
          await guest.request.post(previewUrl, {
            headers,
            data: { beatmap: "123" },
          })
        ).status(),
      ).toBe(401);
      expect(
        (
          await referee.request.post(previewUrl, {
            headers,
            data: { beatmap: "123" },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await context.request.post(previewUrl, {
            headers: { origin: "https://evil.example" },
            data: { beatmap: "123" },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await context.request.post(previewUrl, {
            headers,
            data: { beatmap: "https://evil.example/123" },
          })
        ).status(),
      ).toBe(400);
      await page.getByRole("tab", { name: "Maps", exact: true }).click();
      await page.getByRole("tab", { name: "FM (0)", exact: true }).click();
      await page
        .getByRole("button", { name: "Add a FM beatmap", exact: true })
        .click();
      const input = page.getByRole("textbox", {
        name: "Beatmap URL or ID",
        exact: true,
      });
      const previewResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith(previewUrl) &&
          response.request().method() === "POST",
      );
      await input.fill("https://osu.ppy.sh/beatmapsets/42#osu/123");
      await expect(page.getByRole("status")).toHaveText(
        "Looking up beatmap 123…",
      );
      await expect(
        page.getByRole("button", { name: "Add beatmap", exact: true }),
      ).toBeDisabled();
      const preview = page.getByLabel("Beatmap preview", { exact: true });
      await expect(
        preview.getByRole("link", { name: /Synthetic Browser Song/ }),
      ).toBeVisible();
      await expect(preview).toContainText("4.50 ★ base");
      await expect(preview).toContainText("180 BPM 2:03");
      await expect(preview).toContainText("Official osu! API");
      await expect(preview).toContainText("Set 42");
      const previewSnapshot = await (await previewResponse).json();
      const fetchedAt = await preview.locator("time").getAttribute("datetime");
      expect(previewSnapshot.beatmapId).toBe(123);
      expect(previewSnapshot.fetchedAt).toBe(fetchedAt);
      await expect(
        page.getByRole("textbox", {
          name: /reason|song title|artist|BPM|duration/i,
        }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Add beatmap", exact: true })
        .click();
      await expect(
        page.getByRole("tab", { name: "FM (1)", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const [entry] = await db()
        .select()
        .from(mappoolEntries)
        .where(eq(mappoolEntries.poolId, pool.id));
      // Save independently revalidates metadata. A cache expiry may legitimately
      // produce a newer fetch time while preserving exactly the previewed fields.
      expect(entry.metadataFetchedAt.getTime()).toBeGreaterThanOrEqual(
        Date.parse(fetchedAt!),
      );
      expect(entry.metadata).toEqual(previewSnapshot.metadata);
      expect(entry.metadata.title).toBe("Synthetic Browser Song");
      const events = await db()
        .select()
        .from(mappoolEvents)
        .where(eq(mappoolEvents.poolId, pool.id));
      expect(events.find((e) => e.action === "entry_save")).toMatchObject({
        actorId: id,
        reason: null,
        after: { entries: [{ beatmapId: 123, metadata: entry.metadata }] },
      });
      await page.getByRole("tab", { name: "FM (1)", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: /Synthetic Browser Song/ }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Publish pool", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(
        page
          .getByRole("region", { name: "Selected mappool", exact: true })
          .getByText("Published", { exact: true }),
      ).toBeVisible();
      expect(
        (
          await context.request.post(url, {
            headers,
            data: {
              action: "entry_remove",
              poolId: pool.id,
              expectedVersion: 3,
              entryId: entry.id,
              confirmed: true,
            },
          })
        ).status(),
      ).toBe(409);
      const published = await guest.request.get(
        `/api/tournaments/test-cup/mappools/${pool.id}`,
      );
      expect(published.status()).toBe(200);
      const publicData = await published.json();
      expect(publicData.entries[0].metadata.title).toBe(
        "Synthetic Browser Song",
      );
      expect(JSON.stringify(publicData)).not.toMatch(
        /actorId|reason|before|lockedAt/,
      );
      await guestPage.goto(`/tournaments/test-cup/mappools/${pool.id}`);
      await guestPage
        .getByRole("button", { name: "Compact table", exact: true })
        .click();
      await expect(
        guestPage.getByText(/Force Mod: Synthetic test restrictions/),
      ).toBeVisible();
      await expect(
        guestPage.getByRole("link", { name: "BID 123", exact: true }),
      ).toHaveAttribute("href", "https://osu.ppy.sh/beatmaps/123");
      await expect(
        guestPage.getByRole("button", {
          name: "View FM1: Synthetic Browser Song",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page: guestPage })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      for (const screen of [page, guestPage])
        expect(
          await screen.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      await guestPage.evaluate(() => window.scrollTo(0, 0));
      await guestPage.screenshot({
        path: info.outputPath("public-mappool.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Unpublish pool", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(
        page
          .getByRole("region", { name: "Selected mappool", exact: true })
          .getByText("Draft", { exact: true }),
      ).toBeVisible();
      expect(
        (
          await guest.request.get(
            `/api/tournaments/test-cup/mappools/${pool.id}`,
          )
        ).status(),
      ).toBe(404);
      expect(
        await (
          await guest.request.get("/api/tournaments/test-cup/mappools")
        ).json(),
      ).toEqual([]);
      await db()
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(eq(staffRoles.userId, id));
      expect((await context.request.get(url)).status()).toBe(403);
    } finally {
      await guest.close();
      await referee.close();
      await db().update(mappools).set({ publishedAt: null });
    }
  });
  test("stage and tool tabs keep one pool in focus across round switches and reloads", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const actor = isMobile ? 70001 : 60001;
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await context.addCookies([await seedSession(actor)]);
    const url = "/api/admin/tournaments/test-cup/mappools";
    async function change(data: object) {
      const response = await context.request.post(url, {
        headers: { origin: "http://127.0.0.1:3100" },
        data: { ...data, confirmed: true },
      });
      expect(response.status()).toBe(200);
      return response.json();
    }
    for (const [stage, name, position] of [
      ["group", "Group Round One", 1],
      ["group", "Group Round Two", 2],
      ["knockout", "Knockout Final", 1],
    ] as const) {
      await change({ action: "round_create", stage, name, position });
    }
    let data = await (await context.request.get(url)).json();
    for (const [roundName, name] of [
      ["Group Round One", "Primary Pool"],
      ["Group Round One", "Reserve Pool"],
      ["Group Round Two", "Second Round Pool"],
      ["Knockout Final", "Final Pool"],
    ]) {
      await change({
        action: "pool_create",
        roundId: data.rounds.find((r: { name: string }) => r.name === roundName)
          .id,
        name,
      });
    }
    data = await (await context.request.get(url)).json();
    const primary = data.pools.find(
      (p: { name: string }) => p.name === "Primary Pool",
    );
    await change({
      action: "entry_save",
      poolId: primary.id,
      expectedVersion: 0,
      entryId: null,
      beatmap: "123",
      category: "NM",
      position: 1,
    });
    await page.goto("/admin/tournaments/test-cup/mappools");
    const stages = page.getByRole("tablist", { name: "Competition stage" });
    await stages.getByRole("tab", { name: "Group Stage", exact: true }).click();
    await page
      .getByRole("button", { name: "Group Round One", exact: true })
      .click();
    await page
      .getByRole("group", { name: "Mappools", exact: true })
      .getByRole("button", { name: /Primary Pool/ })
      .click();
    await expect(
      page.getByRole("heading", { name: /Primary Pool/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Synthetic Browser Song/ }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Selected mappool", exact: true })
        .getByRole("combobox"),
    ).toHaveCount(1);
    await expect(
      page.getByLabel("Position for NM1", { exact: true }),
    ).toBeVisible();
    const maps = page.getByRole("tab", { name: "Maps", exact: true });
    await expect(
      page.getByRole("button", { name: "+ New round", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Manage rounds", exact: true }),
    ).toBeVisible();
    await maps.focus();
    await page.keyboard.press("End");
    await expect(
      page.getByRole("tab", { name: "Pool settings", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("combobox", { name: "FM policy", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Map rows", { exact: true })).toBeHidden();
    await page.keyboard.press("Home");
    await expect(maps).toBeFocused();
    await expect(
      page.getByRole("combobox", { name: "FM policy", exact: true }),
    ).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("mappool-workspace.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("tab", { name: "Bulk import", exact: true }).click();
    await expect(page.getByLabel("Map rows", { exact: true })).toBeVisible();
    await expect(page.getByText(/Optional: prefix a row/)).toBeHidden();
    await captureResponsiveLayout(page, info, "minimal-mappool-import");

    await expect(
      page.getByRole("combobox", { name: "FM policy", exact: true }),
    ).toBeHidden();
    await page
      .getByRole("group", { name: "Mappools", exact: true })
      .getByRole("button", { name: /Reserve Pool/ })
      .click();
    await expect(
      page.getByRole("heading", { name: /Reserve Pool/ }),
    ).toBeVisible();
    await expect(maps).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: /Synthetic Browser Song/ }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Group Round Two", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /Second Round Pool/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Mappools", exact: true }),
    ).toHaveCount(0);
    await stages.getByRole("tab", { name: "Group Stage", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      stages.getByRole("tab", { name: "Knockout Stage", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("heading", { name: /Final Pool/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Group Round One", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "Manage rounds", exact: true })
      .click();
    await expect(page.getByLabel("Round name", { exact: true })).toHaveValue(
      "Knockout Final",
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByLabel("Round name", { exact: true })).toHaveCount(0);
    await page.goto("/admin/tournaments/test-cup/mappools");
    await expect(
      page.getByRole("heading", { name: "Mappool management", exact: true }),
    ).toBeVisible();
    await stages.getByRole("tab", { name: "Group Stage", exact: true }).click();
    await page
      .getByRole("button", { name: "Group Round One", exact: true })
      .click();
    await page
      .getByRole("group", { name: "Mappools", exact: true })
      .getByRole("button", { name: /Primary Pool/ })
      .click();
    await page.getByRole("tab", { name: "Pool settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Publish pool", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: "Selected mappool", exact: true })
        .getByText("Published", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Pool settings", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("tab", { name: /Bulk import|Batch edit|Pool settings/ }),
    ).toHaveCount(3);
    await maps.click();
    await expect(
      page.getByRole("heading", { name: /Synthetic Browser Song/ }),
    ).toBeVisible();
    await db()
      .update(mappools)
      .set({ publishedAt: null, lockedAt: new Date() })
      .where(eq(mappools.id, primary.id));
    await page.reload();
    await page
      .getByRole("group", { name: "Mappools", exact: true })
      .getByRole("button", { name: /Primary Pool/ })
      .click();
    await expect(page.getByText(/Map changes are locked/)).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Bulk import|Batch edit|Pool settings/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Edit or replace NM1", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
