import { englishStorage } from "../fixtures/preferences";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { seedSession } from "./session";
import { db, closeDb } from "../../src/db";
import { registrations, userProfileCache } from "../../src/db/schema";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { profileResponse } from "../fixtures/osu-profile";
import { csv as serializeCsv } from "../../src/lib/csv";
test.describe("staff registration review", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(async () => closeDb());
  test("denies nonstaff and lets authorized staff review and export", async ({
    page,
    context,
    isMobile,
    browser,
  }) => {
    const staffId = isMobile ? 70001 : 60001;
    const playerId = staffId + 1;
    const staffCookie = await seedSession(staffId);
    const playerCookie = await seedSession(playerId);
    const fetchedAt = new Date().toISOString();
    const profile = normalizeOsuProfile(
      {
        ...profileResponse,
        id: playerId,
        username: `Synthetic Player ${playerId}`,
      },
      playerId,
      "osu",
      fetchedAt,
    );
    await db()
      .insert(userProfileCache)
      .values({
        osuId: playerId,
        mode: "osu",
        profile,
        attemptedAt: new Date(),
        retryAt: new Date(Date.now() + 3600000),
      })
      .onConflictDoUpdate({
        target: [userProfileCache.osuId, userProfileCache.mode],
        set: {
          profile,
          errorStatus: null,
          retryAt: new Date(Date.now() + 3600000),
        },
      });
    const [record] = await db()
      .insert(registrations)
      .values({
        userId: playerId,
        editionSlug: "test-cup",
        rulesVersion: "test-v1",
        answers: { private: "Private test answer" },
      })
      .returning();
    const other = await browser.newContext({ storageState: englishStorage });
    await other.addCookies([playerCookie]);
    for (const route of [
      "/api/admin/registrations",
      "/api/admin/registrations/export",
    ])
      expect(
        (await other.request.get(`http://127.0.0.1:3100${route}`)).status(),
      ).toBe(403);
    expect(
      (
        await other.request.post(
          `http://127.0.0.1:3100/api/admin/registrations/${record.id}/review`,
          {
            headers: { origin: "http://127.0.0.1:3100" },
            data: {
              status: "accepted",
              confirmed: true,
              expectedUpdatedAt: record.updatedAt.toISOString(),
            },
          },
        )
      ).status(),
    ).toBe(403);
    await context.addCookies([staffCookie]);
    await page.goto("/admin/registrations");
    if (!isMobile)
      await expect(
        page
          .getByRole("group", { name: "Account actions" })
          .getByRole("button", { name: "Dashboard", exact: true }),
      ).toBeVisible();
    if (!isMobile) {
      const original = page.viewportSize()!;
      for (const width of [320, 768, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
      }
      await page.setViewportSize(original);
    }
    for (const path of [
      "/admin/registrations",
      "/admin/tournaments/test-cup/registrations",
    ]) {
      await page.goto(`${path}?q=${playerId}`);
      for (const name of [`Synthetic Player ${playerId}`, String(playerId)]) {
        const link = page
          .locator(".registration-review table")
          .getByRole("link", { name, exact: true });
        await expect(link).toHaveAttribute(
          "href",
          `https://osu.ppy.sh/users/${playerId}`,
        );
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      }
    }
    await page.goto("/admin/registrations");
    await page.getByLabel("Search player or osu! ID").fill(String(playerId));
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(
      page.getByRole("cell", {
        name: `Synthetic Player ${playerId}`,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          window.innerWidth <= window.screen.width,
      ),
    ).toBeTruthy();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .getByRole("link", {
        name: new RegExp(`Review Synthetic Player ${playerId}`),
      })
      .click();
    await expect(
      page.getByText("Private test answer", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Decision", { exact: true }).selectOption("deferred");
    await page.getByRole("button", { name: "Review decision" }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.locator("section .badge").first()).toHaveText("deferred");
    const ownStatus = await other.request.get(
      "http://127.0.0.1:3100/dashboard",
    );
    expect(await ownStatus.text()).toContain(
      "Your rank eligibility is awaiting further review.",
    );
    await page.goto(`/admin/registrations?status=deferred&q=${playerId}`);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody .badge")).toHaveText("deferred");
    await page
      .getByRole("link", {
        name: new RegExp(`Review Synthetic Player ${playerId}`),
      })
      .click();
    await page.getByLabel("Decision", { exact: true }).selectOption("accepted");
    await page.getByRole("button", { name: "Review decision" }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.locator("section .badge").first()).toHaveText("accepted");
    const csv = await context.request.get(
      `/api/admin/registrations/export?q=${playerId}`,
    );
    expect(csv.status()).toBe(200);
    const content = await csv.text();
    expect(content).toContain("accepted");
    expect(content).toContain("Application answers");
    expect(content).toContain("private [private]: Private test answer");
    const expectedCsv = serializeCsv([
      [
        "osu! ID",
        "Username",
        "Edition",
        "Status",
        "Submitted at (UTC)",
        "Application answers",
        "Global rank (osu!standard)",
        "PP (osu!standard)",
        "Statistics fetched at (UTC)",
        "Statistics status",
      ],
      [
        playerId,
        `Synthetic Player ${playerId}`,
        "test-cup",
        "accepted",
        record.createdAt.toISOString(),
        "private [private]: Private test answer",
        12345,
        1234.56,
        fetchedAt,
        "fresh",
      ],
    ]);
    expect(content).toBe(expectedCsv);
    expect(csv.headers()["cache-control"]).toBe("no-store");
    expect(csv.headers()["x-content-type-options"]).toBe("nosniff");
    for (const path of [
      "/admin/registrations",
      "/admin/tournaments/test-cup/registrations",
    ]) {
      await page.goto(`${path}?q=${playerId}`);
      await page.getByText("Export registrations", { exact: true }).click();
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("link", { name: "Export CSV", exact: true }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("oclr-registrations.csv");
      expect(await readFile((await download.path())!, "utf8")).toBe(
        expectedCsv,
      );
    }
    for (const locale of ["zh-Hans", "zh-Hant", "en"]) {
      await context.addCookies([
        { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
      ]);
      const localized = await context.request.get(
        `/api/admin/registrations/export?q=${playerId}`,
      );
      expect(await localized.text()).toBe(content);
    }
    const own = await other.request.get(
      "http://127.0.0.1:3100/api/registrations",
    );
    expect((await own.json())[0].status).toBe("accepted");
    await other.close();
  });
});
