import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { closeDb } from "../../src/db";
import { assertTestDatabase } from "../database";
import { seedResultReview } from "../fixtures/results";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { seedSession } from "./session";
import { chooseTheme } from "./theme";

test.describe("appearance and language preferences", () => {
  // Clearing preferences exposes browser detection, so make the initial
  // Simplified Chinese locale explicit before testing manual overrides.
  test.use({ locale: "zh-CN" });
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("keeps locale, theme and publication boundaries across public and private navigation", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(240000);
    if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    const admin = isMobile ? 70001 : 60001;
    const referee = isMobile ? 850102 : 850002;
    await seedSession(admin);
    await seedSession(referee);
    const seed = await seedResultReview(
      admin,
      referee,
      isMobile ? 851100 : 851000,
      "knockout",
      true,
    );
    await seedEditions([
      {
        ...edition,
        name: "Organizer edition · 原文",
        rules: {
          version: "approved-test",
          sections: [
            {
              heading: "Rules",
              body: "Organizer text remains literal. <script>literal</script>",
            },
          ],
        },
      },
    ]);
    await context.clearCookies();
    // CSS color assertions below exercise the original appearance, independently
    // of an organizer/site default left by another isolated browser fixture.
    await context.addCookies([
      {
        name: "oclr-appearance",
        value: "default",
        url: "http://127.0.0.1:3100",
      },
    ]);
    await context.route("https://a.ppy.sh/**", (route) => route.abort());
    await context.route("https://assets.ppy.sh/**", (route) => route.abort());
    const base = "/tournaments/test-cup";
    const initial = await page.goto(base);
    expect(initial?.headers()["content-language"]).toBe("zh-Hans");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(
      page.locator(".language-control > button"),
    ).toHaveAccessibleName(/简体中文$/);
    await expect(
      page.getByRole("heading", {
        name: "Organizer edition · 原文",
        exact: true,
      }),
    ).toBeVisible();
    const before = await (
      await context.request.get(
        `/api/tournaments/test-cup/mappools/${seed.poolId}`,
      )
    ).json();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const locale of ["zh-Hans", "zh-Hant", "en"]) {
      await page.locator(".language-control > button").click();
      await page.locator(`.language-control [data-locale="${locale}"]`).click();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      if (locale !== "en")
        expect(
          await page
            .locator("body")
            .evaluate((node) => getComputedStyle(node).fontFamily),
        ).toContain(locale === "zh-Hant" ? "PingFang TC" : "PingFang SC");
      for (const theme of ["light", "dark"]) {
        await chooseTheme(page, theme);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        for (const path of [
          "",
          "/mappools",
          "/schedule",
          "/results",
          "/rules",
        ]) {
          const response = await page.goto(base + path);
          expect(response?.status()).toBe(200);
          await expect(page.locator("html")).toHaveAttribute("lang", locale);
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme,
          );
          await expect(page.locator(".public-site")).toHaveCSS(
            "background-color",
            theme === "light" ? "rgb(244, 241, 247)" : "rgb(9, 12, 23)",
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          if (path === "/mappools") {
            await page.locator(".map-view-control button").nth(1).click();
            await expect(page.locator("table.mappool-sheet")).toBeVisible();
          }
          if (path === "/rules")
            await expect(page.locator(".rules-article")).toContainText(
              "Organizer text remains literal. <script>literal</script>",
            );
          const headerBox = (await page.locator(".site-header").boundingBox())!;
          const preferenceBox = (await page
            .locator(".site-preferences")
            .boundingBox())!;
          expect(preferenceBox.y + preferenceBox.height).toBeLessThanOrEqual(
            headerBox.y + headerBox.height,
          );
          await page.screenshot({
            path: info.outputPath(
              `${locale}-${theme}-${path.slice(1) || "overview"}.png`,
            ),
            fullPage: true,
            animations: "disabled",
          });
        }
        if (locale === "en") {
          const violations = (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations;
          expect(violations).toEqual([]);
        }
      }
    }
    const after = await (
      await context.request.get(
        `/api/tournaments/test-cup/mappools/${seed.poolId}`,
      )
    ).json();
    expect(after).toEqual(before);
    expect(
      (
        await context.request.post("/api/admin/tournaments", {
          data: {},
          headers: { Origin: "http://127.0.0.1:3100" },
        })
      ).status(),
    ).toBe(401);
    await context.addCookies([await seedSession(admin)]);
    await page.goto(base);
    const trigger = page.getByRole("button", {
      name: "Dashboard",
      exact: true,
    });
    for (const theme of ["light", "dark"]) {
      await chooseTheme(page, theme);
      await trigger.click();
      const menu = page.getByRole("menu", { name: "Dashboards", exact: true });
      await expect(menu).toBeVisible();
      const a = (await trigger.boundingBox())!,
        b = (await menu.boundingBox())!;
      expect(b.y - a.y - a.height).toBeGreaterThanOrEqual(6);
      expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page.screenshot({
        path: info.outputPath(`menu-${theme}-open.png`),
        fullPage: true,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await page.screenshot({
        path: info.outputPath(`menu-${theme}-closed.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
    for (const [locale, adminTitle, playerTitle] of [
      ["zh-Hans", "管理概览", "选手控制台"],
      ["zh-Hant", "管理概覽", "選手控制檯"],
      ["en", "Administration overview", "Player dashboard"],
    ]) {
      await page.locator(".language-control > button").click();
      await page.locator(`.language-control [data-locale="${locale}"]`).click();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      for (const [path, title] of [
        ["/admin", adminTitle],
        ["/dashboard", playerTitle],
      ]) {
        await page.goto(path);
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
        await expect(page.locator(".theme-control")).toBeVisible();
        await expect(page.locator(".themed-site")).toHaveCSS(
          "color-scheme",
          (await page.locator("html").getAttribute("data-theme"))!,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`${locale}-${path.slice(1)}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
    expect(errors).toEqual([]);
  });
});
