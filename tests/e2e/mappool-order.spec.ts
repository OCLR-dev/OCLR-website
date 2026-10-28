import { englishStorage } from "../fixtures/preferences";
import { test, expect, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { mappoolEntries } from "../../src/db/schema";
import { seedSession } from "./session";
import { chooseTheme } from "./theme";

const api = "/api/admin/tournaments/test-cup/mappools";
test.describe("quick paste and mappool ordering", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(90000);
  test.afterAll(closeDb);
  test.beforeEach(async ({ page, context, isMobile }) => {
    await context.setExtraHTTPHeaders({ Origin: "http://127.0.0.1:3100" });
    const id = isMobile ? 70001 : 60001;
    await seedSession(id);
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await context.addCookies([
      await seedSession(id),
      { name: "oclr-theme", value: "light", domain: "127.0.0.1", path: "/" },
    ]);
    await context.route("https://assets.ppy.sh/beatmaps/**", (route) =>
      route.abort(),
    );
    const round = await (
      await page.request.post(api, {
        data: {
          action: "round_create",
          stage: "group",
          name: "Synthetic Ordering Round",
          position: 1,
          confirmed: true,
        },
      })
    ).json();
    await page.request.post(api, {
      data: {
        action: "pool_create",
        roundId: round.rounds[0].id,
        name: "Synthetic Ordering Pool",
        confirmed: true,
      },
    });
  });
  test("pastes plain URLs in order, appends slots and retains explicit mixed syntax and stale input", async ({
    page,
  }) => {
    await page.goto("/admin/tournaments/test-cup/mappools");
    await page.getByRole("tab", { name: "Bulk import", exact: true }).click();
    const rows = page.getByLabel("Map rows", { exact: true });
    await rows.fill(
      "123\nhttps://osu.ppy.sh/beatmaps/456\nhttps://osu.ppy.sh/beatmapsets/42#osu/789",
    );
    await page
      .getByRole("button", { name: "Preview batch", exact: true })
      .click();
    const table = page.getByRole("table", { name: /Batch preview/ });
    await expect(table.getByRole("rowheader")).toHaveText([
      "1 · NM1",
      "2 · NM2",
      "3 · NM3",
    ]);
    await expect(page).toHaveTitle("Manage mappools");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
    await page.screenshot({
      path: test.info().outputPath("quick-paste-preview.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Import verified batch", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Beatmap batch imported." }),
    ).toBeVisible();
    await expect(rows).toHaveValue("");
    await rows.fill("101\n102\nHD1 123");
    await page
      .getByRole("button", { name: "Preview batch", exact: true })
      .click();
    await expect(table.getByRole("rowheader")).toHaveText([
      "1 · NM4",
      "2 · NM5",
      "3 · HD1",
    ]);
    // An intervening editor invalidates the resolved preview; retain the user's pasted text.
    let data = await (await page.request.get(api)).json();
    const pool = data.pools[0];
    const changed = await page.request.post(api, {
      data: {
        action: "pool_settings",
        poolId: pool.id,
        expectedVersion: pool.version,
        name: pool.name,
        fmMode: null,
        fmRestrictions: "",
        confirmed: true,
      },
    });
    expect(changed.status()).toBe(200);
    await page
      .getByRole("button", { name: "Import verified batch", exact: true })
      .click();
    await expect(page.locator(".mappool-feedback")).toContainText(
      "Batch was not saved",
    );
    await expect(
      page.getByRole("alert").filter({ hasText: "Batch was not saved" }),
    ).toHaveClass(/is-error/);
    await expect(rows).toHaveValue("101\n102\nHD1 123");
    await expect(table).toHaveCount(0);
    await page
      .getByRole("button", { name: "Preview batch", exact: true })
      .click();
    await expect(table.getByRole("rowheader")).toHaveText([
      "1 · NM4",
      "2 · NM5",
      "3 · HD1",
    ]);
    await page
      .getByRole("button", { name: "Import verified batch", exact: true })
      .click();
    await expect(rows).toHaveValue("");
    data = await (await page.request.get(api)).json();
    expect(
      data.entries
        .filter((e: { category: string }) => e.category === "NM")
        .map((e: { beatmapId: number }) => e.beatmapId),
    ).toEqual([123, 456, 789, 101, 102]);
    await page
      .getByLabel("Import category", { exact: true })
      .selectOption("TB");
    await rows.fill("456");
    await page
      .getByRole("button", { name: "Preview batch", exact: true })
      .click();
    await expect(table.getByRole("rowheader")).toHaveText(["1 · TB"]);
    await rows.fill(
      "https://osu.ppy.sh/beatmapsets/42\nNM0 123\n123\nhttps://osu.ppy.sh/beatmaps/123",
    );
    await page
      .getByRole("button", { name: "Preview batch", exact: true })
      .click();
    await expect(table).toContainText("Invalid beatmap");
    await expect(table).toContainText("Invalid slot");
    await expect(table).toContainText("Duplicate beatmap");
    await expect(
      page.getByRole("button", { name: "Import verified batch", exact: true }),
    ).toBeDisabled();
    await rows.fill("999");
    await page
      .getByRole("button", { name: "Preview batch", exact: true })
      .click();
    await expect(table).toContainText("Saved records were preserved");
    await expect(
      page.getByRole("button", { name: "Import verified batch", exact: true }),
    ).toBeDisabled();
  });
  test("drags occupied slots with mouse/touch, supports keyboard and positions, rejects concurrent saves and publishes the final order", async ({
    page,
    context,
    isMobile,
    browser,
  }, info) => {
    let data = await (await page.request.get(api)).json();
    const pool = data.pools[0];
    const metadata = {
      setId: 42,
      title: "Synthetic ordered map",
      artist: "Synthetic Artist",
      difficulty: "Expert",
      mapper: "Synthetic Mapper",
      stars: 4.5,
      bpm: 180,
      duration: 123,
    };
    await db()
      .insert(mappoolEntries)
      .values([
        ...[1, 2, 3, 4, 5].map((i) => ({
          poolId: pool.id,
          category: "NM" as const,
          position: i * 2,
          beatmapId: 500 + i,
          metadata,
        })),
        {
          poolId: pool.id,
          category: "HD" as const,
          position: 7,
          beatmapId: 600,
          metadata,
        },
      ]);
    await page.goto("/admin/tournaments/test-cup/mappools");
    const list = page.getByRole("list", { name: "NM map order", exact: true });
    const ids = await list
      .locator(":scope > li")
      .evaluateAll((elements) =>
        elements.map((el) => el.getAttribute("data-map-entry")!),
      );
    const rows = () => list.locator(":scope > li");
    const uiOrder = () =>
      rows().evaluateAll((elements) =>
        elements.map((el) => el.getAttribute("data-map-entry")!),
      );
    let writes = 0;
    page.on("request", (request) => {
      if (
        request.url().endsWith(api) &&
        request.method() === "POST" &&
        request.postDataJSON()?.action === "reorder"
      )
        writes++;
    });
    const touch = isMobile ? await context.newCDPSession(page) : null;
    async function pointerMove(x: number, y: number) {
      if (touch)
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y }],
        });
      else await page.mouse.move(x, y, { steps: 4 });
    }
    async function dragBefore(source: Locator, target: Locator) {
      const handle = source.locator(".mappool-drag-handle");
      await handle.scrollIntoViewIfNeeded();
      const from = (await handle.boundingBox())!;
      const x = from.x + from.width / 2,
        y = from.y + from.height / 2;
      if (touch)
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
      else {
        await page.mouse.move(x, y);
        await page.mouse.down();
      }
      const to = (await target.boundingBox())!;
      if (to.y < 150 || to.y > page.viewportSize()!.height - 250) {
        await pointerMove(
          x,
          to.y < 150 ? 90 : page.viewportSize()!.height - 10,
        );
        await expect
          .poll(
            async () => {
              const box = (await target.boundingBox())!;
              return box.y > 150 && box.y < page.viewportSize()!.height - 250;
            },
            { intervals: [50], timeout: 15000 },
          )
          .toBe(true);
      }
      // Stop edge scrolling before measuring the final drop coordinates.
      await pointerMove(x, page.viewportSize()!.height / 2);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const box = (await target.boundingBox())!;
      await pointerMove(x, box.y + Math.min(80, box.height / 3));
      await expect(target).toHaveClass(/drop-before/);
      expect(writes).toBe(0);
      await page.screenshot({
        path: info.outputPath("map-drop-preview.png"),
        // Full-page capture resizes the mobile viewport and cancels a real touch gesture.
        fullPage: false,
        animations: "disabled",
      });
      if (touch)
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      else await page.mouse.up();
    }
    const source = page.locator(`[data-map-entry="${ids[4]}"]`),
      target = page.locator(`[data-map-entry="${ids[1]}"]`);
    await dragBefore(source, target);
    await expect
      .poll(uiOrder)
      .toEqual([ids[0], ids[4], ids[1], ids[2], ids[3]]);
    await expect(source.locator(".mappool-drag-handle")).toHaveAccessibleName(
      "Move NM2",
    );
    expect(writes).toBe(0);
    const saved = await (await page.request.get(api)).json();
    expect(
      saved.entries
        .filter((e: { category: string }) => e.category === "NM")
        .map((e: { id: string }) => e.id),
    ).toEqual(ids);
    const save = page.getByRole("button", { name: "Save order", exact: true });
    await save.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(page.locator(".mappool-feedback")).toHaveText(
      "NM order saved.",
    );
    await expect(save).toBeDisabled();
    expect(writes).toBe(1);
    const ordered = [ids[0], ids[4], ids[1], ids[2], ids[3]];
    await expect.poll(uiOrder).toEqual(ordered);
    // A no-op drag never enables saving or writes anything.
    const handle = source.locator(".mappool-drag-handle");
    await handle.scrollIntoViewIfNeeded();
    if (isMobile) await handle.tap();
    else await handle.click();
    await expect(save).toBeDisabled();
    expect(writes).toBe(1);
    const first = page.locator(`[data-map-entry="${ordered[0]}"]`);
    await first.getByRole("combobox").selectOption("5");
    await expect.poll(uiOrder).toEqual([...ordered.slice(1), ordered[0]]);
    await expect(first.locator(".mappool-drag-handle")).toBeFocused();
    await first
      .getByRole("button", { name: "Move NM5 up", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(uiOrder)
      .toEqual([ordered[1], ordered[2], ordered[3], ordered[0], ordered[4]]);
    await first.locator(".mappool-drag-handle").press("Home");
    await expect.poll(uiOrder).toEqual(ordered);
    await expect(save).toBeDisabled();
    await first.locator(".mappool-drag-handle").press("End");
    await expect(save).toBeEnabled();
    // Another operator commits first. The stale editor must restore the authoritative order.
    data = await (await page.request.get(api)).json();
    const authoritative = [...ordered].reverse();
    const concurrent = await page.request.post(api, {
      data: {
        action: "reorder",
        poolId: pool.id,
        expectedVersion: data.pools[0].version,
        category: "NM",
        entryIds: authoritative,
        confirmed: true,
      },
    });
    expect(concurrent.status()).toBe(200);
    await save.click();
    await expect(page.locator(".mappool-feedback")).toContainText(
      "This pool changed",
    );
    const conflict = page
      .getByRole("alert")
      .filter({ hasText: "This pool changed" });
    await expect(conflict).toHaveCSS("color", "rgb(164, 37, 74)");
    await chooseTheme(page, "dark");
    await expect(conflict).toHaveCSS("color", "rgb(255, 158, 175)");
    await chooseTheme(page, "light");
    await expect(conflict).toHaveCSS("color", "rgb(164, 37, 74)");
    await expect.poll(uiOrder).toEqual(authoritative);
    await expect(save).toBeDisabled();
    data = await (await page.request.get(api)).json();
    expect(
      data.entries.find((e: { category: string }) => e.category === "HD")
        .position,
    ).toBe(7);
    await expect(page).toHaveTitle("Manage mappools");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    for (const width of [320, 390, 760, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("map-order-controls.png"),
      fullPage: true,
      animations: "disabled",
    });
    const guest = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    try {
      expect(
        (
          await guest.request.get(
            `/api/tournaments/test-cup/mappools/${pool.id}`,
          )
        ).status(),
      ).toBe(404);
      const published = await page.request.post(api, {
        data: {
          action: "pool_publish",
          poolId: pool.id,
          expectedVersion: data.pools[0].version,
          published: true,
          confirmed: true,
        },
      });
      expect(published.status()).toBe(200);
      await page.reload();
      await expect(list.locator(".mappool-drag-handle")).toHaveCount(5);
      await expect(page.locator(".mappool-drag-handle")).toHaveCount(6);
      await expect(save).toBeVisible();
      await expect(save).toBeDisabled();
      const publicData = await (
        await guest.request.get(`/api/tournaments/test-cup/mappools/${pool.id}`)
      ).json();
      expect(
        publicData.entries
          .filter((e: { category: string }) => e.category === "NM")
          .map((e: { id: string }) => e.id),
      ).toEqual(authoritative);
      const publicPage = await guest.newPage();
      await publicPage.goto(`/tournaments/test-cup/mappools/${pool.id}`);
      await publicPage
        .getByRole("button", { name: "Compact table", exact: true })
        .click();
      const nm = publicPage.getByRole("table", {
        name: `${pool.name}: NM / No Mod beatmaps`,
        exact: true,
      });
      await expect(nm.locator("tbody th")).toHaveText([
        "NM1",
        "NM2",
        "NM3",
        "NM4",
        "NM5",
      ]);
      expect(
        (await publicPage.locator("main").innerText()).includes(
          "Synthetic ordered map",
        ),
      ).toBe(true);
      expect(
        (
          await guest.request.post(api, {
            headers: { Origin: "http://127.0.0.1:3100" },
            data: {
              action: "reorder",
              poolId: pool.id,
              expectedVersion: 3,
              category: "NM",
              entryIds: ids,
              confirmed: true,
            },
          })
        ).status(),
      ).toBe(401);
    } finally {
      await guest.close();
    }
  });
});
