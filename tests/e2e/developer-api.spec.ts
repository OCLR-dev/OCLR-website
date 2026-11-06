import { createServer } from "node:http";
import { test, expect, type Page } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  staffRoles,
  developerApiTokens,
  siteSettings,
} from "../../src/db/schema";
import { seedSession } from "./session";

const backend = "http://127.0.0.1:3100";
const local = "http://127.0.0.1:31468";
const transport = createServer((_request, response) => {
  response.writeHead(200, {
    "Content-Type": "text/html",
    "Cache-Control": "no-store",
  });
  response.end(
    "<!doctype html><title>Isolated local frontend transport test</title>",
  );
});
async function localRead(page: Page, token: string) {
  return page.evaluate(
    async ({ backend, token }) => {
      const response = await fetch(`${backend}/api/v1/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit",
      });
      return {
        status: response.status,
        body: await response.json(),
        requestId: response.headers.get("X-Request-Id"),
        cache: response.headers.get("Cache-Control"),
      };
    },
    { backend, token },
  );
}

test.describe("Developer API local browser access", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      transport.once("error", reject);
      transport.listen(31468, "127.0.0.1", resolve);
    });
  });
  test.afterAll(async () => {
    await new Promise<void>((resolve) => transport.close(() => resolve()));
    await closeDb();
  });
  test("manages one-time credentials, reads across origins, checks layouts and immediately revokes", async ({
    page,
    context,
    isMobile,
  }) => {
    test.setTimeout(180000);
    const id = isMobile ? 2682002 : 2682001;
    const cookie = await seedSession(id);
    await context.route("https://a.ppy.sh/**", (route) => route.abort());
    await db()
      .insert(staffRoles)
      .values({ userId: id, role: "developer", grantedBy: id });
    await context.addCookies([cookie]);
    if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/tournaments");
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    const menu = (await page.locator(".account-dropdown").boundingBox())!;
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth),
    );
    await page
      .getByRole("menuitem", { name: "Developer API access", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Developer API access", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Add local port", { exact: true })
      .fill(new URL(local).port);
    await page.getByRole("button", { name: "Add port", exact: true }).click();
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/developer/tokens") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Create token", exact: true })
      .click();
    const createdResponse = await response;
    expect(createdResponse.status()).toBe(201);
    const issued = await createdResponse.json();
    await expect(page.getByLabel("New API token")).toHaveValue(
      /^oclr_dev_[A-Za-z0-9_-]{43}$/,
    );
    const localPage = await context.newPage();
    try {
      await localPage.goto(local);
      const result = await localRead(localPage, issued.token);
      expect(result.status).toBe(200);
      expect(result.body.data.user.osuId).toBe(id);
      expect(result.body.data.access.kind).toBe("developer-read");
      expect(result.requestId).toBe(result.body.meta.requestId);
      expect(result.cache).toBe("no-store");
      const invalid = await localRead(localPage, "oclr_dev_" + "x".repeat(43));
      expect(invalid.status).toBe(401);
      expect(invalid.body.error.code).toBe("INVALID_TOKEN");
      const preflight = await context.request.fetch(`${backend}/api/v1/me`, {
        method: "OPTIONS",
        headers: {
          Origin: local,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "Authorization",
        },
      });
      expect(preflight.status()).toBe(204);
      expect(preflight.headers()["access-control-allow-origin"]).toBe(local);
      await page
        .getByRole("button", { name: "Hide token", exact: true })
        .click();
      const html = await page.reload();
      expect((await html!.text()).includes(issued.token)).toBe(false);
      await expect(page.getByLabel("New API token")).toHaveCount(0);

      for (const appearance of ["default", "cute-pastel", "swiss-minimal"]) {
        for (const theme of ["light", "dark"]) {
          for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
            await context.addCookies([
              { name: "oclr-appearance", value: appearance, url: backend },
              { name: "oclr-theme", value: theme, url: backend },
              { name: "oclr-locale", value: locale, url: backend },
            ]);
            await page.reload();
            await expect(page.locator("html")).toHaveAttribute(
              "data-theme",
              theme,
            );
            await expect(page.locator("html")).toHaveAttribute(
              "data-appearance",
              appearance,
            );
            await expect(page.locator(".developer-access")).toBeVisible();
            await page.evaluate(() => {
              if (document.activeElement instanceof HTMLElement)
                document.activeElement.blur();
              window.scrollTo({ top: 0, left: 0, behavior: "instant" });
            });
            const header = (await page.locator(".site-header").boundingBox())!;
            const heading = (await page
              .locator(".page-heading")
              .boundingBox())!;
            expect(heading.y).toBeGreaterThanOrEqual(header.y + header.height);
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
              ),
            ).toBe(true);
          }
        }
      }
      await context.addCookies([
        { name: "oclr-locale", value: "en", url: backend },
      ]);
      await page.reload();
      // Mixed-role cookies still cannot contribute write powers to a bearer.
      await db()
        .insert(staffRoles)
        .values({ userId: id, role: "admin", grantedBy: id });
      const before = await db().select().from(siteSettings);
      const denied = await context.request.patch("/api/admin/settings", {
        headers: { Origin: backend, Authorization: `Bearer ${issued.token}` },
        data: { defaultAppearance: "cute-pastel", expectedRevision: 0 },
      });
      expect(denied.status()).toBe(403);
      expect(
        (
          await context.request.get("/api/players/651307", {
            headers: { Authorization: `Bearer ${issued.token}` },
          })
        ).status(),
      ).toBe(403);
      expect(await db().select().from(siteSettings)).toEqual(before);
      await db()
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(staffRoles.userId, id),
            eq(staffRoles.role, "developer"),
            isNull(staffRoles.revokedAt),
          ),
        );
      expect((await localRead(localPage, issued.token)).status).toBe(403);
      await db()
        .insert(staffRoles)
        .values({ userId: id, role: "developer", grantedBy: id });
      expect((await localRead(localPage, issued.token)).status).toBe(200);
      await page.reload();
      await page
        .getByRole("button", { name: "Revoke token", exact: true })
        .click();
      await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
      expect((await localRead(localPage, issued.token)).status).toBe(401);
      const extra = await context.request.post("/api/developer/tokens", {
        headers: { Origin: backend },
        data: { origin: local, scopes: ["identity:read"] },
      });
      expect(extra.status()).toBe(201);
      const remaining = await extra.json();
      expect((await localRead(localPage, remaining.token)).status).toBe(200);
      await context.request.post("/auth/logout", {
        headers: { Origin: backend },
      });
      expect((await localRead(localPage, remaining.token)).status).toBe(401);
      expect(
        await db()
          .select()
          .from(developerApiTokens)
          .where(eq(developerApiTokens.userId, id)),
      ).toHaveLength(0);
      expect(errors).toEqual([]);
    } finally {
      await localPage.close();
    }
  });
});
