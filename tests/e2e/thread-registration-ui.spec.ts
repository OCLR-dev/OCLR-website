import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { registrations, users, staffRoles } from "../../src/db/schema";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";
import { seedSession } from "./session";

test.describe("registration wrapping and deferred overview", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("preserves lines and describes scoped totals across locales and appearances", async ({
    page,
    context,
    isMobile,
  }) => {
    const base = isMobile ? 323010 : 323000;
    const cookie = await seedSession(base);
    const slug = `thread-ui-${base}-test`;
    await db().delete(registrations).where(eq(registrations.editionSlug, slug));
    const eligibility =
      "Synthetic Rank Range: 15000 ~\n（Literal authored PP explanation 8810，宽限 8820）。\nSecond authored line.";
    await seedEditions([{ ...edition, slug, eligibility }]);
    await db().insert(staffRoles).values({
      userId: base,
      role: "admin",
      editionSlug: slug,
      grantedBy: base,
    });
    await context.addCookies([cookie]);
    for (const count of [0, 1, 3]) {
      if (count) {
        await db()
          .insert(users)
          .values({
            osuId: base + count,
            username: `Scoped applicant ${count}`,
          })
          .onConflictDoNothing();
        await db()
          .insert(registrations)
          .values({
            userId: base + count,
            editionSlug: slug,
            status: "deferred",
            configurationVersion: 0,
            answers: {},
          });
        if (count === 3) {
          await db()
            .insert(users)
            .values({ osuId: base + 2, username: "Scoped applicant 2" })
            .onConflictDoNothing();
          await db()
            .insert(registrations)
            .values({
              userId: base + 2,
              editionSlug: slug,
              status: "deferred",
              configurationVersion: 0,
              answers: {},
            });
        }
      }
      await page.goto("/admin");
      const card = page.locator(".admin-task").filter({
        has: page.locator('a[href="/admin/registrations?status=deferred"]'),
      });
      await expect(card.locator("p")).toHaveText(
        `${count} deferred application${count === 1 ? "" : "s"} across your authorized editions.`,
      );
      await expect(card.locator("p")).toHaveClass("muted small");
    }
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const appearance of ["default", "cute-pastel", "swiss-minimal"])
        for (const theme of ["light", "dark"]) {
          await context.addCookies([
            {
              name: "oclr-locale",
              value: locale,
              domain: "127.0.0.1",
              path: "/",
            },
            {
              name: "oclr-appearance",
              value: appearance,
              domain: "127.0.0.1",
              path: "/",
            },
            {
              name: "oclr-theme",
              value: theme,
              domain: "127.0.0.1",
              path: "/",
            },
          ]);
          await page.setViewportSize({
            width: isMobile ? 320 : 1440,
            height: 1000,
          });
          await page.goto(`/tournaments/${slug}/register`);
          const policy = page.locator(".registration-eligibility");
          await expect(policy).toHaveText(eligibility);
          expect(
            await policy.evaluate((e) => getComputedStyle(e).whiteSpace),
          ).toBe("pre-line");
          const disclosure = page.locator(".application-disclosure");
          expect(await disclosure.innerText()).not.toContain("\n");
          await expect(disclosure.locator('a[href="/privacy"]')).toBeVisible();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await page.goto("/admin");
          const card = page.locator(".admin-task").filter({
            has: page.locator('a[href="/admin/registrations?status=deferred"]'),
          });
          await expect(card.locator("p")).toContainText(
            locale === "en"
              ? "3 deferred applications"
              : locale === "zh-Hans"
                ? "3 份待定报名"
                : "3 份待定報名",
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
        }
    await db().delete(staffRoles).where(eq(staffRoles.userId, base));
  });
});
