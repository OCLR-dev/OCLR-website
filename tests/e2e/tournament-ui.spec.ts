import { englishStorage } from "../fixtures/preferences";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedSession } from "./session";
import { closeDb } from "../../src/db";
import { randomUUID } from "node:crypto";
test.describe("registration readiness and confirmation layout", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("centers confirmation and error dialogs, explains blockers and schedules future entry", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    // Repeats must not delete an edition referenced by registrations/audit events.
    const slug = `ui-${isMobile ? "mobile" : "desktop"}-${randomUUID().slice(0, 8)}-test`;
    const endpoint = `/api/admin/tournaments/${slug}`;
    const headers = { origin: "http://127.0.0.1:3100" };
    const current = async () => (await context.request.get(endpoint)).json();
    const create = await context.request.post("/api/admin/tournaments", {
      headers,
      data: {
        slug,
        name: "Synthetic UI tournament",
        season: null,
        summary: "Isolated UI test only.",
        timeZone: "Asia/Taipei",
        branding: { logo: null, background: null, keyVisual: null },
        confirmed: true,
      },
    });
    expect(create.status()).toBe(201);
    const command = async (action: string, fields: object) => {
      const data = await current();
      const result = await context.request.post(endpoint, {
        headers,
        data: {
          action,
          confirmed: true,
          expectedRevision: data.revision,
          ...fields,
        },
      });
      expect(result.ok()).toBe(true);
    };
    await page.goto(`/admin/tournaments/${slug}/settings`);
    const tabs = page.getByRole("tablist", {
      name: "Tournament settings",
      exact: true,
    });
    const general = tabs.getByRole("tab", { name: "General", exact: true });
    await expect(general).toHaveAttribute("aria-selected", "true");
    await expect(tabs.locator('[aria-selected="true"]')).toHaveCount(1);
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    await general.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      tabs.getByRole("tab", { name: "Registration", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("tabpanel", { name: "Registration", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Tournament name", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("End");
    await expect(
      tabs.getByRole("tab", { name: "Publication", exact: true }),
    ).toBeFocused();
    await expect(page).toHaveURL(/section=publication$/);
    await page.keyboard.press("Home");
    await expect(general).toBeFocused();
    await expect(
      page.getByRole("tabpanel", { name: "General", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(
      tabs.getByRole("tab", { name: "Publication", exact: true }),
    ).toBeFocused();
    await tabs.getByRole("tab", { name: "Milestones", exact: true }).click();
    await expect(page).toHaveURL(/section=schedule$/);
    await page.reload();
    await expect(
      tabs.getByRole("tab", { name: "Milestones", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("tabpanel", { name: "Milestones", exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const selected = await tabs
          .getByRole("tab", { name: "Milestones", exact: true })
          .boundingBox();
        const strip = await tabs.boundingBox();
        return Boolean(
          selected &&
          strip &&
          selected.x >= strip.x - 1 &&
          selected.x + selected.width <= strip.x + strip.width + 1,
        );
      })
      .toBe(true);
    await page.goto(`/admin/tournaments/${slug}/settings?section=invalid`);
    await expect(general).toHaveAttribute("aria-selected", "true");
    await expect(tabs.locator('[aria-selected="true"]')).toHaveCount(1);
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
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
    await page.screenshot({
      path: info.outputPath("tournament-settings-tabs.png"),
      fullPage: true,
      animations: "disabled",
    });
    await tabs.getByRole("tab", { name: "Publication", exact: true }).click();
    await page
      .getByRole("button", { name: "Publish tournament", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const dialogButtons = await dialog
      .getByRole("button")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node);
          return [
            // Hover transforms can add subpixel rounding to the visual rect.
            // Compare the actual layout height, retaining the strict 44px check.
            (node as HTMLElement).offsetHeight,
            style.fontSize,
            style.padding,
            style.borderRadius,
          ];
        }),
      );
    expect(
      new Set(dialogButtons.map((style) => JSON.stringify(style))).size,
      JSON.stringify(dialogButtons),
    ).toBe(1);
    expect(dialogButtons[0][0]).toBe(44);
    const centered = async () => {
      await expect(dialog).toBeVisible();
      const bounds = (await dialog.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(
        Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2),
      ).toBeLessThan(2);
      expect(
        Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2),
      ).toBeLessThan(2);
      expect(bounds.x).toBeGreaterThanOrEqual(15);
      expect(bounds.y).toBeGreaterThanOrEqual(15);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        viewport.height - 15,
      );
    };
    await centered();
    const state = await current();
    const { name, summary, season, branding, timeZone, status } = state.edition;
    await command("general", {
      name,
      summary: summary + " Updated.",
      season,
      branding,
      timeZone,
      status,
    });
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("settings changed");
    await centered();
    await page.screenshot({
      path: info.outputPath("centered-error-dialog.png"),
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    const now = Date.now();
    await command("registration", {
      registration: {
        enabled: false,
        opensAt: new Date(now + 3600000).toISOString(),
        closesAt: new Date(now + 7200000).toISOString(),
        withdrawUntil: null,
        questions: [],
      },
    });
    await command("publication", { published: true });
    await page.goto(`/admin/tournaments/${slug}/settings?section=registration`);
    await expect(
      page.getByRole("checkbox", {
        name: "Enable registration during this window",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      page.getByText("Before enabling registration", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("checkbox", {
        name: "Enable registration during this window",
        exact: true,
      })
      .check();
    const save = page.getByRole("button", {
      name: "Save registration settings",
      exact: true,
    });
    await save.click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("status")).toContainText("saved");
    const publicState = await (
      await context.request.get(`/api/tournaments/${slug}`)
    ).json();
    expect(publicState.registration.state).toBe("upcoming");
    await page.goto(`/admin/tournaments/${slug}`);
    const readiness = page.getByRole("region", {
      name: "Registration",
      exact: true,
    });
    await expect(readiness.locator("li")).toHaveCount(3);
    await expect(
      readiness.getByText("upcoming", { exact: true }),
    ).toBeVisible();
    await expect(readiness.getByText("Opens", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    const heading = page.locator(".tournament-dashboard-heading");
    const title = heading.getByRole("heading", { level: 1 });
    expect(
      await title.evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeLessThanOrEqual(32);
    const headingBox = (await heading.boundingBox())!,
      readinessBox = (await readiness.boundingBox())!;
    expect(Math.abs(headingBox.x - readinessBox.x)).toBeLessThan(2);
    expect(Math.abs(headingBox.width - readinessBox.width)).toBeLessThan(2);
    const dates = readiness.getByRole("heading", {
      name: "Registration window",
      exact: true,
    });
    const checks = readiness.getByRole("heading", {
      name: "Registration checks",
      exact: true,
    });
    const datesBox = (await dates.boundingBox())!,
      checksBox = (await checks.boundingBox())!;
    if (isMobile)
      expect(checksBox.y).toBeGreaterThan(datesBox.y + datesBox.height);
    else expect(Math.abs(checksBox.y - datesBox.y)).toBeLessThan(2);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("compact-tournament-dashboard.png"),
      fullPage: true,
    });
    if (!isMobile) {
      await page.setViewportSize({ width: 900, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(checks).toBeVisible();
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await command("registration", {
      registration: {
        enabled: true,
        opensAt: new Date(now - 3600000).toISOString(),
        closesAt: new Date(now + 7200000).toISOString(),
        withdrawUntil: null,
        questions: [],
      },
    });
    const player = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    try {
      await player.addCookies([await seedSession(isMobile ? 355102 : 355002)]);
      const applicant = await player.newPage();
      await applicant.goto(`/tournaments/${slug}/register`);
      await expect(applicant.getByRole("checkbox")).toHaveCount(0);
      await expect(
        applicant.getByRole("link", { name: "privacy notice", exact: true }),
      ).toBeVisible();
      await applicant
        .getByRole("button", { name: "Submit individual application" })
        .click();
      await expect(applicant).toHaveURL(/dashboard\?submitted=1$/);
      await expect(applicant.locator(".registration-card details")).toHaveCount(
        0,
      );
      const [savedApplication] = await (
        await applicant.request.get("/api/registrations")
      ).json();
      expect(savedApplication.rulesVersion).toBeNull();
      await command("rules", {
        rules: {
          version: "later-v1",
          sections: [
            { heading: "Later rules", body: "Synthetic later rules." },
          ],
        },
        eligibility: "Synthetic later eligibility.",
      });
      await applicant.reload();
      await expect(applicant.locator(".registration-card details")).toHaveCount(
        0,
      );
      const [afterRulesChanged] = await (
        await applicant.request.get("/api/registrations")
      ).json();
      expect(afterRulesChanged.rulesVersion).toBeNull();
      expect(afterRulesChanged.configurationVersion).toBe(
        savedApplication.configurationVersion,
      );
    } finally {
      await player.close();
    }
  });
});
