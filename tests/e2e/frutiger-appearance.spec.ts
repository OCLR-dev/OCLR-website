import { test, expect, type BrowserContext } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { assertTestDatabase } from "../database";
import { seedBrowserEditions } from "./setup";
import { seedSession } from "./session";
import { landscapeFixture, seedPublicPolish } from "../fixtures/public-polish";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics";
import { historicalStatistics } from "../../src/db/schema";

const origin = "http://127.0.0.1:3100";
const base = "/tournaments/test-cup";

async function preferences(context: BrowserContext, theme = "light") {
  await context.addCookies(
    [
      ["oclr-locale", "en"],
      ["oclr-theme", theme],
      ["oclr-appearance", "frutiger-aero"],
    ].map(([name, value]) => ({ name, value, url: origin })),
  );
}

/**
 * Focused checks for the Frutiger Aero material that the broader appearance
 * spec does not assert: reduced motion, forced colours, adaptive slot labels,
 * and semantic status/destructive colours that the generic theme rules must not
 * repaint. The probes reuse the real component classes so the computed styles
 * come from the shipped stylesheet.
 */
test.describe("Frutiger Aero material fallbacks", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeEach(async ({ context }) => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await seedBrowserEditions();
    await preferences(context);
    await context.route("https://a.ppy.sh/**", (r) =>
      r.fulfill({ contentType: "image/svg+xml", body: landscapeFixture }),
    );
    await context.route("https://assets.ppy.sh/**", (r) =>
      r.fulfill({ contentType: "image/svg+xml", body: landscapeFixture }),
    );
  });
  test.afterEach(async () => {
    await db().execute(
      sql`TRUNCATE edition_state, users, user_profile_cache CASCADE`,
    );
    await seedBrowserEditions();
  });
  test.afterAll(closeDb);

  test("keeps short slots circular and lets long labels grow without clipping", async ({
    page,
    context,
  }) => {
    for (const theme of ["light", "dark"]) {
      await preferences(context, theme);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const response = await page.goto(base);
        expect(response?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute(
          "data-appearance",
          "frutiger-aero",
        );
        const sizes = await page.evaluate(() => {
          const themed = document.querySelector<HTMLElement>(".themed-site");
          if (!themed) throw new Error("missing .themed-site");
          const host = document.createElement("div");
          host.className = "map-card-cover";
          host.style.cssText = `position:relative;width:${innerWidth < 500 ? 200 : 260}px;height:160px`;
          const badge = document.createElement("span");
          badge.className = "map-slot-badge";
          badge.textContent = "HD2";
          host.append(badge);
          themed.append(host);
          const short = badge.getBoundingClientRect();
          badge.textContent = "ARCHIVE MOD SLOT 12";
          const long = badge.getBoundingClientRect();
          const computed = getComputedStyle(badge);
          const result = {
            shortWidth: short.width,
            shortHeight: short.height,
            longWidth: long.width,
            longHeight: long.height,
            scrollWidth: badge.scrollWidth,
            clientWidth: badge.clientWidth,
            radius: parseFloat(computed.borderRadius),
          };
          host.remove();
          return result;
        });
        // A short code fills a 52px (44px on mobile) circle.
        expect(
          Math.abs(sizes.shortWidth - sizes.shortHeight),
        ).toBeLessThanOrEqual(1.5);
        // A long imported/archive label becomes a capsule and wraps instead of
        // being clipped by the former fixed width.
        expect(sizes.longWidth).toBeGreaterThan(sizes.shortWidth);
        expect(sizes.longWidth).toBeGreaterThan(sizes.longHeight);
        expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth + 1);
        expect(sizes.radius).toBeGreaterThanOrEqual(999);
      }
    }
  });

  test("removes transitions under reduced motion and never animates background colour", async ({
    page,
    context,
  }) => {
    await preferences(context);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedResponse = await page.goto(base);
    expect(reducedResponse?.status()).toBe(200);
    const trigger = page.locator(".appearance-trigger");
    await expect(trigger).toBeVisible();
    const styles = await trigger.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        duration: computed.transitionDuration,
        animation: computed.animationName,
      };
    });
    for (const duration of styles.duration.split(","))
      expect(duration.trim()).toBe("0s");
    expect(styles.animation).toBe("none");

    // The base (non-reduced) transition list must not animate background
    // colour: an intermediate frame could lose the action's contrast.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const normalResponse = await page.goto(base);
    expect(normalResponse?.status()).toBe(200);
    await expect(trigger).toBeVisible();
    const transition = await trigger.evaluate(
      (element) => getComputedStyle(element).transitionProperty,
    );
    expect(transition).not.toContain("background");
  });

  test("keeps semantic status, destructive and forced-colour states", async ({
    page,
    context,
    isMobile,
  }) => {
    await preferences(context);
    const pageResponse = await page.goto(base);
    expect(pageResponse?.status()).toBe(200);
    const colours = await page.evaluate(() => {
      const themed = document.querySelector<HTMLElement>(".themed-site");
      if (!themed) throw new Error("missing .themed-site");
      const probe = (property: string, value: string) => {
        const element = document.createElement("span");
        element.style.setProperty(property, value);
        element.style.position = "absolute";
        element.style.opacity = "0";
        themed.append(element);
        const computed = getComputedStyle(element).getPropertyValue(property);
        element.remove();
        return computed;
      };
      const wrap = document.createElement("div");
      wrap.id = "frutiger-probes";
      wrap.style.cssText =
        "display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:16px;scroll-margin-top:120px";
      const badge = (className: string, label: string) => {
        const element = document.createElement("span");
        element.className = `badge ${className}`;
        element.textContent = label;
        wrap.append(element);
        return element;
      };
      const neutral = badge("", "Neutral");
      const accepted = badge("status-accepted", "Accepted");
      const rejected = badge("status-rejected", "Rejected");
      const destructive = document.createElement("button");
      destructive.type = "button";
      destructive.className = "secondary destructive-action";
      destructive.id = "probe-destructive";
      destructive.textContent = "Revoke";
      const revokeRole = document.createElement("button");
      revokeRole.type = "button";
      revokeRole.className = "secondary role-revoke";
      revokeRole.id = "probe-role-revoke";
      revokeRole.textContent = "Revoke role";
      wrap.append(destructive, revokeRole);
      themed
        .querySelector(".site-header")
        ?.insertAdjacentElement("afterend", wrap);
      return {
        success: probe("color", "var(--site-success)"),
        danger: probe("color", "var(--site-danger)"),
        neutral: getComputedStyle(neutral).color,
        accepted: getComputedStyle(accepted).color,
        rejected: getComputedStyle(rejected).color,
        destructive: getComputedStyle(destructive).color,
        revokeRole: getComputedStyle(revokeRole).color,
        destructiveBorder: getComputedStyle(destructive).borderTopColor,
        destructiveBackground: getComputedStyle(destructive).backgroundColor,
      };
    });
    // Status badges keep workspace.css's success/danger colours; the neutral
    // badge uses the theme accent and must not swallow them.
    expect(colours.accepted).toBe(colours.success);
    expect(colours.rejected).toBe(colours.danger);
    expect(colours.accepted).not.toBe(colours.neutral);
    expect(colours.rejected).not.toBe(colours.neutral);
    expect(colours.destructive).toBe(colours.danger);
    expect(colours.revokeRole).toBe(colours.danger);
    expect(colours.destructiveBorder).toBe(colours.danger);

    if (!isMobile) {
      const destructive = page.locator("#probe-destructive");
      await destructive.hover();
      const hovered = await destructive.evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          background: computed.backgroundColor,
          colour: computed.color,
          border: computed.borderTopColor,
        };
      });
      expect(hovered.colour).toBe(colours.danger);
      expect(hovered.border).toBe(colours.danger);
      expect(hovered.background).not.toBe(colours.destructiveBackground);

      const box = await destructive.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        const pressed = await destructive.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        );
        await page.mouse.up();
        expect(pressed).not.toBe(hovered.background);
      }
    }

    await page.emulateMedia({ forcedColors: "active" });
    const forcedResponse = await page.goto(base);
    expect(forcedResponse?.status()).toBe(200);
    const forcedTrigger = page.locator(".site-header .nav-login");
    await expect(forcedTrigger).toBeVisible();
    await forcedTrigger.focus();
    const forced = await page.evaluate(() => {
      const themed = document.querySelector<HTMLElement>(".themed-site");
      const header = document.querySelector<HTMLElement>(".site-header");
      const focused = document.activeElement;
      if (!themed || !header || !(focused instanceof HTMLElement))
        throw new Error("missing themed site, header or focused control");
      const probe = (property: string, value: string) => {
        const element = document.createElement("span");
        element.style.setProperty(property, value);
        element.style.opacity = "0";
        themed.append(element);
        const computed = getComputedStyle(element).getPropertyValue(property);
        element.remove();
        return computed;
      };
      const badge = document.createElement("span");
      badge.className = "badge status-accepted";
      badge.textContent = "Accepted";
      themed.append(badge);
      const result = {
        decoration: getComputedStyle(themed, "::before").display,
        headerImage: getComputedStyle(header).backgroundImage,
        badge: getComputedStyle(badge).color,
        canvasText: probe("color", "CanvasText"),
        buttonBackground: getComputedStyle(focused).backgroundColor,
        buttonFace: probe("background-color", "ButtonFace"),
        buttonColour: getComputedStyle(focused).color,
        buttonText: probe("color", "ButtonText"),
        focus: getComputedStyle(focused).outlineColor,
        highlight: probe("color", "Highlight"),
        focusVisible: focused.matches(":focus-visible"),
      };
      badge.remove();
      return result;
    });
    expect(forced.decoration).toBe("none");
    expect(forced.headerImage).toBe("none");
    expect(forced.badge).toBe(forced.canvasText);
    expect(forced.buttonBackground).toBe(forced.buttonFace);
    expect(forced.buttonColour).toBe(forced.buttonText);
    if (forced.focusVisible) expect(forced.focus).toBe(forced.highlight);
  });

  test("fits the logged-in English header at the collapse boundaries", async ({
    page,
    context,
  }) => {
    await preferences(context);
    await context.addCookies([await seedSession(60001)]);
    for (const width of [951, 1024, 1100]) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(base);
      expect(response?.status()).toBe(200);
      await expect(page.locator(".menu-toggle")).toBeVisible();
      await expect(page.locator(".main-nav")).toBeHidden();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.locator(".menu-toggle").click();
      await expect(page.locator(".main-nav.open")).toBeVisible();
      const links = await page
        .locator(".main-nav.open > a")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return { left: rect.left, right: rect.right, height: rect.height };
          }),
        );
      for (const link of links) {
        expect(link.left).toBeGreaterThanOrEqual(0);
        expect(link.right).toBeLessThanOrEqual(width);
        expect(link.height).toBeGreaterThanOrEqual(43.5);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 1101, height: 900 });
    const response = await page.goto(base);
    expect(response?.status()).toBe(200);
    await expect(page.locator(".menu-toggle")).toBeHidden();
    await expect(page.locator(".main-nav")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".main-nav")
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    expect(
      await page
        .locator(".main-nav > a")
        .evaluateAll((links) =>
          links.every((link) => link.scrollWidth <= link.clientWidth + 1),
        ),
    ).toBe(true);
    const navBox = await page.locator(".main-nav").boundingBox();
    const actionsBox = await page.locator(".nav-actions").boundingBox();
    expect(navBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    if (navBox && actionsBox) {
      expect(navBox.x).toBeGreaterThanOrEqual(0);
      expect(navBox.x + navBox.width).toBeLessThanOrEqual(actionsBox.x + 0.5);
      expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(1101.5);
    }
    // Anonymous visitors use the narrower login link; check the collapsed
    // extreme and the desktop boundary again without a session cookie.
    await context.clearCookies({ name: "oclr_session" });
    for (const width of [951, 1101]) {
      await page.setViewportSize({ width, height: 900 });
      const anonymous = await page.goto(base);
      expect(anonymous?.status()).toBe(200);
      await expect(page.locator(".nav-login")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 951) {
        await expect(page.locator(".menu-toggle")).toBeVisible();
        await expect(page.locator(".main-nav")).toBeHidden();
      } else {
        await expect(page.locator(".menu-toggle")).toBeHidden();
        await expect(page.locator(".main-nav")).toBeVisible();
        expect(
          await page
            .locator(".main-nav")
            .evaluate(
              (element) => element.scrollWidth <= element.clientWidth + 1,
            ),
        ).toBe(true);
      }
    }
  });

  test("renders real navigation, sort, map-title, footer and select controls", async ({
    page,
    context,
    isMobile,
  }) => {
    await preferences(context);
    await seedPublicPolish(60001, 1230099, 1230000);
    // A published historical snapshot gives the real statistics table rows,
    // sortable headers and the round/team/map selects without mock markup.
    const archive = structuredClone(statisticsArchive);
    await seedEditions([
      {
        ...edition,
        slug: "s7",
        name: "Synthetic statistics regression",
        status: "completed",
        registration: null,
        archive,
      },
    ]);
    const source = statisticsSource();
    const snapshot = {
      archiveKey: statisticsArchiveKey(archive),
      source,
      poolId: archive.pools[0].id,
      included: source.games.map((game) => game.id),
    };
    await db().insert(historicalStatistics).values({
      editionSlug: "s7",
      mpId: source.match.id,
      fixtureId: archive.matches[0].id,
      version: 1,
      draft: snapshot,
      published: snapshot,
      publishedAt: new Date(),
    });
    const statsResponse = await page.goto("/tournaments/s7/statistics");
    expect(statsResponse?.status()).toBe(200);

    // Footer spans the page and paints no bounded rectangle with side gaps.
    const footer = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>(".site-footer");
      if (!element) throw new Error("missing .site-footer");
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: document.documentElement.clientWidth,
        background: getComputedStyle(element).backgroundColor,
      };
    });
    expect(footer.left).toBeLessThanOrEqual(1);
    expect(footer.width - footer.right).toBeLessThanOrEqual(1);
    expect(footer.background).toBe("rgba(0, 0, 0, 0)");

    // Global navigation: equal-height capsules with real side padding.
    if (isMobile) await page.locator(".menu-toggle").click();
    const nav = page.locator(isMobile ? ".main-nav.open > a" : ".main-nav > a");
    await expect(nav.first()).toBeVisible();
    const navMetrics = await nav.evaluateAll((links) =>
      links.map((element) => {
        const computed = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          height: rect.height,
          paddingLeft: parseFloat(computed.paddingLeft),
          paddingRight: parseFloat(computed.paddingRight),
          radius: parseFloat(computed.borderRadius),
          clipped: element.scrollWidth > element.clientWidth + 1,
        };
      }),
    );
    expect(navMetrics.length).toBeGreaterThan(0);
    // Selected and unselected links share one height; the tinted state adds no
    // padding or border width that could shift the row.
    expect(
      new Set(navMetrics.map((metric) => Math.round(metric.height))).size,
    ).toBe(1);
    for (const metric of navMetrics) {
      expect(metric.height).toBeGreaterThanOrEqual(43.5);
      expect(metric.paddingLeft).toBeGreaterThanOrEqual(15.5);
      expect(metric.paddingRight).toBeGreaterThanOrEqual(15.5);
      expect(metric.radius).toBeGreaterThanOrEqual(999);
      expect(metric.clipped).toBe(false);
    }
    const current = page.locator(".main-nav > a[aria-current]");
    if (await current.count()) {
      const box = await current.first().boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    }

    // Sortable headers are flat text controls with a real hit area.
    const sortButton = page.locator(".event-table thead th button").first();
    await expect(sortButton).toBeVisible();
    const sortStyle = await sortButton.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        background: computed.backgroundColor,
        backgroundImage: computed.backgroundImage,
        border: computed.borderTopWidth,
        shadow: computed.boxShadow,
        height: element.getBoundingClientRect().height,
      };
    });
    expect(sortStyle.background).toBe("rgba(0, 0, 0, 0)");
    expect(sortStyle.backgroundImage).toBe("none");
    expect(sortStyle.border).toBe("0px");
    expect(sortStyle.shadow).toBe("none");
    expect(sortStyle.height).toBeGreaterThanOrEqual(43.5);
    await sortButton.click();
    const sortHeader = sortButton.locator("xpath=ancestor::th[1]");
    await expect(sortHeader).toHaveAttribute("aria-sort", "descending");
    const activeSort = await sortButton.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        color: computed.color,
        weight: Number(computed.fontWeight),
        decoration: computed.textDecorationLine,
      };
    });
    const accentStrong = await page.evaluate(() => {
      const themed = document.querySelector<HTMLElement>(".themed-site");
      if (!themed) throw new Error("missing .themed-site");
      const probe = document.createElement("span");
      probe.style.color = "var(--site-accent-strong)";
      themed.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    expect(activeSort.color).toBe(accentStrong);
    expect(activeSort.weight).toBeGreaterThanOrEqual(700);
    expect(activeSort.decoration).toContain("underline");

    // Map titles are row triggers, not glossy CTAs.
    const mapResponse = await page.goto(`${base}/mappools`);
    expect(mapResponse?.status()).toBe(200);
    const mapTitle = page.locator("button.map-open-button").first();
    await expect(mapTitle).toBeVisible();
    const mapStyle = await mapTitle.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        background: computed.backgroundColor,
        backgroundImage: computed.backgroundImage,
        border: computed.borderTopWidth,
        shadow: computed.boxShadow,
        color: computed.color,
        height: element.getBoundingClientRect().height,
      };
    });
    expect(mapStyle.background).toBe("rgba(0, 0, 0, 0)");
    expect(mapStyle.backgroundImage).toBe("none");
    expect(mapStyle.border).toBe("0px");
    expect(mapStyle.shadow).toBe("none");
    expect(mapStyle.height).toBeGreaterThanOrEqual(43.5);
    // The compact table view uses the same flat title trigger class.
    const compact = page.getByRole("button", {
      name: "Compact table",
      exact: true,
    });
    await expect(compact.first()).toBeVisible();
    await compact.first().click();
    const compactTitle = page
      .locator("button.map-open-button.mappool-map-title")
      .first();
    await expect(compactTitle).toBeVisible();
    const compactStyle = await compactTitle.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        background: computed.backgroundColor,
        border: computed.borderTopWidth,
        shadow: computed.boxShadow,
        height: element.getBoundingClientRect().height,
      };
    });
    expect(compactStyle.background).toBe("rgba(0, 0, 0, 0)");
    expect(compactStyle.border).toBe("0px");
    expect(compactStyle.shadow).toBe("none");
    expect(compactStyle.height).toBeGreaterThanOrEqual(43.5);
    const foreground = await page.evaluate(() => {
      const themed = document.querySelector<HTMLElement>(".themed-site");
      if (!themed) throw new Error("missing .themed-site");
      const probe = document.createElement("span");
      probe.style.color = "var(--site-foreground)";
      themed.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    expect(mapStyle.color).toBe(foreground);

    // Round/team/map selects: one chevron, comfortably inside the control.
    const selectResponse = await page.goto("/tournaments/s7/statistics");
    expect(selectResponse?.status()).toBe(200);
    const select = page.locator("select").first();
    await expect(select).toBeVisible();
    const selectStyle = await select.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        appearance: computed.appearance,
        paddingRight: parseFloat(computed.paddingRight),
        minHeight: parseFloat(computed.minHeight),
        image: computed.backgroundImage,
        size: computed.backgroundSize,
        position: computed.backgroundPosition,
      };
    });
    expect(selectStyle.appearance).toBe("none");
    expect(selectStyle.paddingRight).toBeGreaterThanOrEqual(40);
    expect(selectStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(selectStyle.image).toContain("data:image/svg+xml");
    expect(selectStyle.size).toBe("12px 8px");
    expect(selectStyle.position).toMatch(/100%|calc/);

    await page.emulateMedia({ forcedColors: "active" });
    const forcedSelectResponse = await page.goto("/tournaments/s7/statistics");
    expect(forcedSelectResponse?.status()).toBe(200);
    const forcedSelect = await page
      .locator("select")
      .first()
      .evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          appearance: computed.appearance,
          image: computed.backgroundImage,
        };
      });
    expect(forcedSelect.appearance).toBe("auto");
    expect(forcedSelect.image).toBe("none");
  });
});
