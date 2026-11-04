import { test, expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { users, staffRoles, userProfileCache } from "../../src/db/schema";
import { seedSession } from "./session";
import { seedPublicDirectory } from "../fixtures/players";
import { assertTestDatabase } from "../database";
import { profileResponse } from "../fixtures/osu-profile";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
const origin = "http://127.0.0.1:3100";
test.describe("compact operational UI in both designs and brightness modes", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("keeps tabs, actions, identity and staff cards usable across locales and themes", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache, site_settings CASCADE`,
    );
    const admin = isMobile ? 70001 : 60001;
    await context.addCookies([await seedSession(admin)]);
    await seedPublicDirectory(isMobile ? 1441100 : 1440100);
    const names = [
      "Synthetic Long Staff Name ".repeat(3),
      "Synthetic No Country",
      "Synthetic Japan",
    ];
    await db()
      .insert(users)
      .values(names.map((username, i) => ({ osuId: 1442000 + i, username })));
    await db()
      .insert(staffRoles)
      .values(
        names.map((_, i) => ({
          userId: 1442000 + i,
          role: "referee" as const,
          editionSlug: "test-cup",
          grantedBy: admin,
          aboutPublished: true,
        })),
      );
    await db()
      .insert(userProfileCache)
      .values(
        ["TW", "ZZ", "JP"].map((countryCode, i) => ({
          osuId: 1442000 + i,
          mode: "osu",
          profile: {
            ...normalizeOsuProfile(
              { ...profileResponse, id: 1442000 + i },
              1442000 + i,
              "osu",
            ),
            countryCode,
          },
          attemptedAt: new Date(),
          retryAt: new Date(),
        })),
      );
    await page.route("https://a.ppy.sh/**", (route) => route.abort());
    const api = "/api/admin/tournaments/test-cup/mappools";
    const command = async (data: object) => {
      const response = await context.request.post(api, {
        headers: { Origin: origin },
        data: { ...data, confirmed: true },
      });
      expect(response.status()).toBe(200);
      return response.json();
    };
    const round = (
      await command({
        action: "round_create",
        stage: "group",
        name: "Same name",
        position: 1,
      })
    ).rounds[0];
    await command({
      action: "pool_create",
      roundId: round.id,
      name: "Same name",
    });
    for (const [appearance, theme, locale] of [
      ["default", "light", "en"],
      ["default", "dark", "zh-Hans"],
      ["cute-pastel", "light", "zh-Hant"],
      ["cute-pastel", "dark", "en"],
    ]) {
      await context.addCookies([
        { name: "oclr-appearance", value: appearance, url: origin },
        { name: "oclr-theme", value: theme, url: origin },
        { name: "oclr-locale", value: locale, url: origin },
      ]);
      for (const [section, path] of [
        ["matches", "/admin/tournaments/test-cup/matches"],
        ["maps", "/admin/tournaments/test-cup/mappools"],
        ["registrations", "/admin/tournaments/test-cup/registrations"],
        ["awards", "/admin/tournaments/test-cup/awards"],
        ["staff", "/about"],
      ]) {
        await page.goto(path);
        if (section === "matches") {
          const tabs = page
            .locator(".fixture-workspace .workspace-tabs")
            .first();
          await expect(tabs).toHaveAttribute("data-appearance", "line");
          await expect(tabs).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
          for (const tab of await tabs.getByRole("tab").all()) {
            await tab.click();
            await expect(tab).toHaveAttribute("aria-selected", "true");
          }
        }
        if (section === "maps") {
          const heading = page.locator(".mappool-pool-heading");
          await expect(heading).toContainText("Same name");
          expect((await heading.innerText()).match(/Same name/g)).toHaveLength(
            1,
          );
          await expect(heading).toContainText("0");
        }
        if (section === "registrations") {
          const actions = page.locator(".registration-review-actions");
          expect(await actions.getByRole("button").count()).toBe(2);
          expect(await actions.getByRole("link").count()).toBe(1);
          const add = await actions.getByRole("button").first().boundingBox(),
            csv = await actions.getByRole("link").boundingBox();
          expect(add!.y).toBeLessThanOrEqual(csv!.y);
          if (!isMobile) {
            expect(Math.abs(add!.y - csv!.y)).toBeLessThan(2);
            expect(add!.x).toBeLessThan(csv!.x);
          }
        }
        if (section === "awards")
          await expect(
            page
              .locator("section[aria-labelledby] ul li")
              .filter({ hasText: /MVP|MIP|Rookie|新秀/ }),
          ).toHaveCount(3);
        if (section === "staff") {
          const cards = page.locator(".public-staff-list > li");
          await expect(cards).toHaveCount(3);
          await expect(cards.locator(".country-flag")).toHaveCount(2);
          const first = cards.first();
          const avatar = await first.locator(".avatar").boundingBox(),
            name = await first.locator(":is(h3, h4) a").boundingBox();
          expect(Math.abs(avatar!.y - name!.y)).toBeLessThan(5);
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${section}/${appearance}/${theme}`,
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`${section}-${appearance}-${theme}.png`),
          fullPage: true,
        });
      }
    }
  });
});
