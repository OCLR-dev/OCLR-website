import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { registrations } from "../../src/db/schema";
import { seedSession } from "./session";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { statisticsArchive } from "../fixtures/archive-statistics";
import { seedResultReview } from "../fixtures/results";
import { englishStorage } from "../fixtures/preferences";

test.describe("Developer private read workspace", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("reads every workspace, preserves query controls and enforces additive roles and revocation", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    test.setTimeout(180000);
    if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
    const adminId = isMobile ? 70001 : 60001;
    const developerId = isMobile ? 1861002 : 1861001;
    const refereeId = isMobile ? 1861012 : 1861011;
    const cookie = await seedSession(developerId);
    await seedSession(refereeId);
    const adminCookie = await seedSession(adminId);
    const result = await seedResultReview(
      adminId,
      refereeId,
      isMobile ? 1861200 : 1861100,
      "group",
      true,
    );
    await seedEditions(
      [
        {
          ...edition,
          slug: "s7",
          published: false,
          status: "completed",
          registration: null,
          archive: statisticsArchive,
        },
      ],
      false,
    );
    const [application] = await db()
      .select()
      .from(registrations)
      .where(eq(registrations.userId, (isMobile ? 1861200 : 1861100) + 2));
    const admin = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    const origin = { origin: "http://127.0.0.1:3100" };
    try {
      await admin.addCookies([adminCookie]);
      const adminPage = await admin.newPage();
      await adminPage.goto("/admin/staff");
      await adminPage
        .getByLabel("Verified osu! user ID")
        .fill(String(developerId));
      const roles = adminPage
        .getByRole("group", { name: "Roles (select multiple)" })
        .first();
      await roles
        .getByRole("checkbox", { name: "Mappooler", exact: true })
        .uncheck();
      await roles
        .getByRole("checkbox", {
          name: "Developer",
          exact: true,
        })
        .check();
      await expect(
        adminPage.getByRole("combobox", { name: /^Scope/ }),
      ).toHaveValue("");
      await adminPage
        .getByRole("button", { name: "Review role grant" })
        .click();
      await adminPage
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await expect(
        adminPage
          .locator("article")
          .filter({ hasText: String(developerId) })
          .getByRole("button", { name: "Revoke role" }),
      ).toBeVisible();
      const listing = await (
        await admin.request.get("/api/admin/staff")
      ).json();
      const grant = listing.grants.find(
        (r: { grant: { userId: number; role: string } }) =>
          r.grant.userId === developerId && r.grant.role === "developer",
      ).grant;
      await context.addCookies([cookie]);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const path of [
        "/admin",
        "/admin/tournaments",
        "/admin/staff",
        "/admin/settings",
        "/admin/audit",
        "/admin/registrations",
        "/admin/tournaments/new",
        ...[
          "",
          "/settings",
          "/registrations",
          `/registrations/${application.id}`,
          "/teams",
          "/captains",
          "/draft",
          "/rounds",
          "/mappools",
          "/matches",
          `/matches/${result.fixtureId}`,
          "/awards",
          "/archive",
        ].map((path) => `/admin/tournaments/test-cup${path}`),
        "/admin/tournaments/private-test-cup/settings",
        "/admin/tournaments/s7/statistics",
        "/admin/tournaments/s7/archive/preview",
      ]) {
        await page.goto(path);
        await expect(
          page.getByRole("heading", { name: "Off the beat.", exact: true }),
          path,
        ).toHaveCount(0);
        await expect(
          page.getByText("Developer access is read-only.", { exact: false }),
          path,
        ).toBeVisible();
      }
      await page.goto("/admin/tournaments/test-cup/settings");
      await page.getByRole("tab", { name: "Publication", exact: true }).click();
      await expect(
        page.getByRole("tabpanel").getByRole("button").first(),
      ).toBeDisabled();
      await page.goto("/admin/tournaments/test-cup/registrations");
      await page.getByLabel("Search player or osu! ID").fill("1861");
      await expect(
        page.getByRole("button", { name: "Filter", exact: true }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "Filter", exact: true }).click();
      await expect(page.getByLabel("Search player or osu! ID")).toHaveValue(
        "1861",
      );
      await expect(
        page.getByRole("link", { name: "Export CSV ↓" }),
      ).toHaveCount(0);
      expect(
        (await context.request.get("/api/admin/registrations/export")).status(),
      ).toBe(403);
      expect(
        (
          await context.request.patch(
            `/api/admin/tournaments/test-cup/teams/${result.home.teamId}`,
            {
              headers: origin,
              multipart: {
                name: "Forbidden",
                image: {
                  name: "forbidden.png",
                  mimeType: "image/png",
                  buffer: Buffer.from("forbidden"),
                },
              },
            },
          )
        ).status(),
      ).toBe(403);
      expect(
        (
          await context.request.post("/api/admin/settings", {
            headers: origin,
            data: {},
          })
        ).status(),
      ).toBe(405);
      expect(
        (
          await context.request.patch("/api/admin/settings", {
            headers: origin,
            data: { defaultAppearance: "swiss-minimal", expectedRevision: 0 },
          })
        ).status(),
      ).toBe(403);
      for (const appearance of ["default", "cute-pastel", "swiss-minimal"]) {
        for (const theme of ["light", "dark"]) {
          for (const locale of ["zh-Hans", "zh-Hant", "en"]) {
            await context.addCookies([
              {
                name: "oclr-appearance",
                value: appearance,
                url: "http://127.0.0.1:3100",
              },
              {
                name: "oclr-theme",
                value: theme,
                url: "http://127.0.0.1:3100",
              },
              {
                name: "oclr-locale",
                value: locale,
                url: "http://127.0.0.1:3100",
              },
            ]);
            await page.goto("/admin/settings");
            await expect(page.locator("html")).toHaveAttribute("lang", locale);
            await expect(page.locator("html")).toHaveAttribute(
              "data-appearance",
              appearance,
            );
            await expect(page.locator("html")).toHaveAttribute(
              "data-theme",
              theme,
            );
            await expect(page.locator(".workspace-main select")).toBeDisabled();
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              `${appearance}/${theme}/${locale}`,
            ).toBe(true);
            if (locale === "en")
              await page.screenshot({
                path: info.outputPath(`developer-${appearance}-${theme}.png`),
                fullPage: true,
              });
          }
        }
      }
      await context.addCookies([
        { name: "oclr-locale", value: "en", url: "http://127.0.0.1:3100" },
      ]);
      expect(
        (
          await admin.request.post("/api/admin/staff", {
            headers: origin,
            data: {
              action: "grant",
              userId: developerId,
              role: "mappooler",
              editionSlug: "test-cup",
              confirmed: true,
            },
          })
        ).status(),
      ).toBe(200);
      await page.goto("/admin/tournaments/test-cup/mappools");
      await expect(
        page.getByText("Existing write roles remain active.", { exact: false }),
      ).toBeVisible();
      expect(
        (
          await context.request.post(
            "/api/admin/tournaments/test-cup/mappools",
            {
              headers: origin,
              data: {
                action: "round_create",
                stage: "group",
                name: "Existing scoped writer",
                position: 2,
                confirmed: true,
              },
            },
          )
        ).status(),
      ).toBe(200);
      expect(
        (
          await context.request.post(
            "/api/admin/tournaments/private-test-cup/mappools",
            {
              headers: origin,
              data: {
                action: "round_create",
                stage: "group",
                name: "Forbidden other edition",
                position: 2,
                confirmed: true,
              },
            },
          )
        ).status(),
      ).toBe(403);
      expect(
        (
          await admin.request.post("/api/admin/staff", {
            headers: origin,
            data: {
              action: "grant",
              userId: developerId,
              role: "referee",
              editionSlug: "test-cup",
              confirmed: true,
            },
          })
        ).status(),
      ).toBe(200);
      await page.goto(
        `/admin/tournaments/test-cup/matches/${result.fixtureId}`,
      );
      await expect(
        page.getByRole("button", { name: "Retrieve match data", exact: true }),
      ).toBeDisabled();
      expect(
        (
          await context.request.post(
            `/api/admin/tournaments/test-cup/matches/${result.fixtureId}/results`,
            { headers: origin, data: {} },
          )
        ).status(),
      ).toBe(403);
      expect(
        (
          await admin.request.patch(
            `/api/admin/tournaments/test-cup/matches/${result.fixtureId}/referees`,
            {
              headers: origin,
              data: {
                expectedAssignmentRevision: 0,
                refereeIds: [refereeId, developerId],
              },
            },
          )
        ).status(),
      ).toBe(200);
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Retrieve match data", exact: true }),
      ).toBeEnabled();
      await page.goto("/admin/tournaments/test-cup/draft");
      expect(
        (
          await admin.request.post("/api/admin/staff", {
            headers: origin,
            data: { action: "revoke", grantId: grant.id, confirmed: true },
          })
        ).status(),
      ).toBe(200);
      await expect(
        page.getByText(
          "Staff access is unavailable. Sign in again or contact the organizer.",
          { exact: true },
        ),
      ).toBeVisible({ timeout: 10000 });
      expect((await context.request.get("/api/admin/staff")).status()).toBe(
        403,
      );
      await page.goto("/admin/tournaments/private-test-cup/settings");
      await expect(
        page.getByRole("heading", { name: "Off the beat.", exact: true }),
      ).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await admin.close();
    }
  });
});
