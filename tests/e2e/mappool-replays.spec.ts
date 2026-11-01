import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { db, closeDb } from "../../src/db";
import { staffRoles, mappools, mappoolReplays } from "../../src/db/schema";
import { seedSession } from "./session";
import { syntheticReplay } from "../fixtures/replay";
import { englishStorage } from "../fixtures/preferences";
const base = "/api/admin/tournaments/test-cup/mappools";
const headers = { origin: "http://127.0.0.1:3100" };
async function prepare(context: BrowserContext, mobile: boolean) {
  const admin = mobile ? 70001 : 60001,
    tester = mobile ? 185102 : 185002;
  await context.addCookies([await seedSession(admin)]);
  await db().execute(sql`TRUNCATE tournament_stages CASCADE`);
  let response = await context.request.post(base, {
    headers,
    data: {
      action: "round_create",
      confirmed: true,
      stage: "group",
      name: "Synthetic Replay Round",
      position: 1,
    },
  });
  expect(response.ok()).toBe(true);
  const roundId = (await response.json()).rounds[0].id;
  response = await context.request.post(base, {
    headers,
    data: {
      action: "pool_create",
      confirmed: true,
      roundId,
      name: "Synthetic Replay Pool",
    },
  });
  expect(response.ok()).toBe(true);
  const poolId = (await response.json()).pools[0].id;
  response = await context.request.post(base, {
    headers,
    data: {
      action: "entry_save",
      confirmed: true,
      poolId,
      expectedVersion: 0,
      entryId: null,
      beatmap: "123",
      category: "NM",
      position: 1,
    },
  });
  expect(response.ok()).toBe(true);
  const entryId = (await response.json()).entries[0].id;
  const cookie = await seedSession(tester);
  await db().insert(staffRoles).values({
    userId: tester,
    role: "tester",
    editionSlug: "test-cup",
    grantedBy: admin,
  });
  return { poolId, entryId, cookie, url: `${base}/entries/${entryId}/replays` };
}
test.describe("private replay workflow", () => {
  test.setTimeout(180000);
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("lets Tester upload and delete immediately and after legacy Showcase deadlines", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    const { poolId, entryId, cookie, url } = await prepare(context, isMobile);
    await context.addCookies([cookie]);
    await page.goto("/admin/tournaments/test-cup/mappools");
    await expect(
      page.getByRole("heading", { name: "Replay upload window", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Replays", exact: true }).click();
    await expect(page.getByLabel("Replay file", { exact: true })).toBeEnabled();
    const bytes = syntheticReplay(),
      filename = "示范-" + "Long filename ".repeat(10) + ".osr";
    await page
      .getByLabel("Replay file", { exact: true })
      .setInputFiles({ name: filename, mimeType: "text/html", buffer: bytes });
    await page
      .getByLabel("Replay description (optional)")
      .fill("Synthetic description — not official tournament content");
    await page
      .getByRole("button", { name: "Upload replay", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Replay uploaded.");
    await expect(page.locator(".replay-item")).toHaveCount(1);
    await expect(
      page.getByText("Beatmap checksum matched", { exact: true }),
    ).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download replay", exact: true }).click(),
    ]);
    expect(await readFile((await download.path())!)).toEqual(bytes);
    const [row] = await db()
      .select()
      .from(mappoolReplays)
      .where(eq(mappoolReplays.entryId, entryId));
    const guest = await browser.newContext({ storageState: englishStorage });
    expect(
      (
        await guest.request.get(`http://127.0.0.1:3100${url}/${row.id}`)
      ).status(),
    ).toBe(401);
    await guest.close();
    expect(
      (
        await context.request.get(
          `${base.replace("test-cup", "s11")}/entries/${entryId}/replays/${row.id}`,
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await context.request.post(url, {
          headers: { origin: "https://wrong.example" },
          data: "bad",
        })
      ).status(),
    ).toBe(403);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("replay-tester-uploaded.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Delete replay", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Delete replay?" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reload replay list", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Delete replay", exact: true })
      .click();
    const deleteUrl = `**${url}/${row.id}`;
    await page.route(deleteUrl, async (route) => {
      if (route.request().method() === "DELETE")
        await route.fulfill({
          status: 409,
          json: { error: "This pool changed. Refresh before confirming." },
        });
      else await route.continue();
    });
    await dialog
      .getByRole("button", { name: "Delete replay", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.locator(".mappool-replays").getByRole("alert"),
    ).toHaveText("This pool changed. Refresh before confirming.");
    await expect(page.locator(".replay-item")).toHaveCount(1);
    await page.unroute(deleteUrl);
    await page
      .getByRole("button", { name: "Delete replay", exact: true })
      .click();
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "Delete replay", exact: true })
      .click();
    await expect(page.locator(".replay-item")).toHaveCount(0);
    await page.getByLabel("Replay file", { exact: true }).setInputFiles({
      name: "again.osr",
      mimeType: "application/octet-stream",
      buffer: bytes,
    });
    await page
      .getByRole("button", { name: "Upload replay", exact: true })
      .click();
    await expect(page.locator(".replay-item")).toHaveCount(1);
    await db()
      .update(mappools)
      .set({ showcaseAt: new Date() })
      .where(eq(mappools.id, poolId));
    await page.reload();
    await page.getByRole("button", { name: /^Replays/ }).click();
    await expect(page.getByLabel("Replay file", { exact: true })).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Delete replay", exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Download replay", exact: true }),
    ).toBeVisible();
    expect(
      (
        await context.request.delete(`${url}/${row.id}`, {
          headers,
          data: { confirmed: true, expectedVersion: 5 },
        })
      ).status(),
    ).toBe(200);
    await page
      .getByRole("button", { name: "Delete replay", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Delete replay?", exact: true })
      .getByRole("button", { name: "Delete replay", exact: true })
      .click();
    await expect(page.locator(".replay-item")).toHaveCount(0);
    await page.getByLabel("Replay file", { exact: true }).setInputFiles({
      name: "after-deadline.osr",
      mimeType: "application/octet-stream",
      buffer: bytes,
    });
    await page
      .getByRole("button", { name: "Upload replay", exact: true })
      .click();
    await expect(page.locator(".replay-item")).toHaveCount(1);
  });
  test("retries a committed upload with a lost response without duplicate associations", async ({
    page,
    context,
    isMobile,
  }) => {
    const { cookie, url } = await prepare(context, isMobile);
    await context.addCookies([cookie]);
    await page.goto("/admin/tournaments/test-cup/mappools");
    await page.getByRole("button", { name: "Replays", exact: true }).click();
    await page.getByLabel("Replay file", { exact: true }).setInputFiles({
      name: "retry.osr",
      mimeType: "application/octet-stream",
      buffer: syntheticReplay(),
    });
    await page.route(`**${url}`, async (route) => {
      if (route.request().method() === "POST") {
        const saved = await route.fetch();
        expect(saved.ok()).toBe(true);
        await route.abort("failed");
      } else await route.continue();
    });
    await page
      .getByRole("button", { name: "Upload replay", exact: true })
      .click();
    await expect(page.locator(".replay-content [role=alert]")).toContainText(
      "Upload interrupted",
    );
    await expect(page.locator(".replay-item")).toHaveCount(1);
    await page.unroute(`**${url}`);
    await page
      .getByRole("button", { name: "Upload replay", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "This file is already attached. No duplicate was created.",
    );
    await expect(page.locator(".replay-item")).toHaveCount(1);
    await page.getByLabel("Replay file", { exact: true }).setInputFiles({
      name: "fake.osr",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("not a replay"),
    });
    await page
      .getByRole("button", { name: "Upload replay", exact: true })
      .click();
    await expect(page.locator(".replay-content [role=alert]")).toBeVisible();
    await expect(page.locator(".replay-item")).toHaveCount(1);
  });
  test("supports every locale, appearance and theme with long filenames, errors and keyboard access", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const { entryId, cookie, url } = await prepare(context, isMobile);
    await context.addCookies([cookie]);
    expect(
      (
        await context.request.post(url, {
          headers,
          multipart: {
            file: {
              name: "LongName-".repeat(18) + ".osr",
              mimeType: "application/octet-stream",
              buffer: syntheticReplay(),
            },
            description: "Synthetic note",
            expectedVersion: "1",
            confirmed: "true",
          },
        })
      ).ok(),
    ).toBe(true);
    await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 1000 });
    for (const appearance of ["default", "cute-pastel", "swiss-minimal"])
      for (const theme of ["light", "dark"])
        for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
          await context.addCookies([
            {
              name: "oclr-appearance",
              value: appearance,
              url: "http://127.0.0.1:3100",
            },
            { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
            {
              name: "oclr-locale",
              value: locale,
              url: "http://127.0.0.1:3100",
            },
          ]);
          await page.goto("/admin/tournaments/test-cup/mappools");
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme,
          );
          await expect(page.locator("html")).toHaveAttribute(
            "data-appearance",
            appearance,
          );
          const trigger = page.locator(".mappool-replays > button");
          await trigger.focus();
          await page.keyboard.press("Enter");
          await expect(page.locator(".replay-item")).toHaveCount(1);
          await page.locator('input[type="file"]').setInputFiles({
            name: "wrong.osr",
            mimeType: "text/plain",
            buffer: Buffer.from("fake file"),
          });
          await page.locator('.replay-content button[type="submit"]').click();
          await expect(
            page.locator('.replay-content [role="alert"]'),
          ).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(isMobile ? 390 : 1440);
          expect(
            (
              await new AxeBuilder({ page })
                .include(".mappool-workbench")
                .withTags(["wcag2a", "wcag2aa"])
                .analyze()
            ).violations,
          ).toEqual([]);
          await page.locator(".replay-item button").click();
          await expect(page.locator(".replay-delete-dialog")).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(page.locator(".replay-toolbar button")).toBeFocused();
          if (locale === "zh-Hans") {
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({
              path: info.outputPath(`replay-${appearance}-${theme}.png`),
              fullPage: true,
            });
          }
        }
    expect(
      await db()
        .select()
        .from(mappoolReplays)
        .where(eq(mappoolReplays.entryId, entryId)),
    ).toHaveLength(1);
  });
});
