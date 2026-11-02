import { expect, test, type Page } from "@playwright/test";

// Liru's character-sheet card on the homepage hero (#638).

const card = ".home-liru-card";

async function cardShown(page: Page) {
  return page
    .locator(card)
    .evaluate(
      (node) =>
        getComputedStyle(node).visibility === "visible" &&
        getComputedStyle(node).opacity === "1",
    );
}

async function box(page: Page, selector: string) {
  return (await page.locator(selector).first().boundingBox())!;
}

function centre(rect: { x: number; y: number; width: number; height: number }) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function apart(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return (
    a.x >= b.x + b.width ||
    b.x >= a.x + a.width ||
    a.y >= b.y + b.height ||
    b.y >= a.y + a.height
  );
}

// a pointer moving at a person's pace: small steps, one frame apart
async function glide(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 30,
) {
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
    await page.waitForTimeout(16);
  }
}

test.describe("with a mouse", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "mouse only");
  });

  test("the card opens on Liru and stays while the pointer moves to its arrow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const start = centre(await box(page, ".home-liru-link"));
    await page.mouse.move(start.x, start.y);
    await expect.poll(() => cardShown(page)).toBe(true);
    const arrow = centre(await box(page, `${card} .home-liru-go`));
    await glide(page, start, arrow);
    expect(await cardShown(page)).toBe(true);
    // a detour through the gap below the card still arrives in time
    await page.mouse.move(start.x, start.y);
    const below = await box(page, card);
    await glide(
      page,
      start,
      { x: below.x + below.width - 30, y: below.y + below.height + 20 },
      6,
    );
    await glide(
      page,
      { x: below.x + below.width - 30, y: below.y + below.height + 20 },
      arrow,
      6,
    );
    expect(await cardShown(page)).toBe(true);
    await page.mouse.click(arrow.x, arrow.y);
    await expect(page).toHaveURL(/\/wiki\/liru$/);
  });

  test("leaving closes the card after a short delay", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const start = centre(await box(page, ".home-liru-link"));
    await page.mouse.move(start.x, start.y);
    await expect.poll(() => cardShown(page)).toBe(true);
    const hero = await box(page, ".home-feature");
    await page.mouse.move(hero.x + hero.width - 20, hero.y + hero.height - 90);
    await page.waitForTimeout(100);
    expect(
      await page.locator(card).evaluate((n) => getComputedStyle(n).visibility),
    ).toBe("visible");
    await expect
      .poll(() =>
        page.locator(card).evaluate((n) => getComputedStyle(n).visibility),
      )
      .toBe("hidden");
  });

  test("the transparent parts of the artwork do not react", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const art = await box(page, ".home-hero-character img");
    for (const [fx, fy] of [
      [0.12, 0.12], // sky above the fan, left of her head
      [0.08, 0.5], // left of the fan
    ]) {
      await page.mouse.move(art.x + art.width * fx, art.y + art.height * fy);
      await page.waitForTimeout(400);
      expect(await cardShown(page)).toBe(false);
      expect(
        await page
          .locator(".home-hero-character")
          .evaluate((n) => getComputedStyle(n).transform),
      ).toBe("none");
    }
  });

  test("the keyboard reaches Liru once and opens the sheet", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator(".home-liru-link").focus();
    await expect.poll(() => cardShown(page)).toBe(true);
    await expect(page.locator(".home-liru-link")).toHaveAccessibleName(
      "View Liru's character sheet",
    );
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document.activeElement?.classList.contains("home-liru-card"),
      ),
    ).toBe(false);
    await page.locator(".home-liru-link").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/wiki\/liru$/);
  });

  test("the card keeps clear of the logo, the entries and Liru's face", async ({
    page,
  }) => {
    for (const [width, height] of [
      [1280, 720],
      [1366, 768],
      [1440, 900],
      [1920, 990],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      const start = centre(await box(page, ".home-liru-link"));
      await page.mouse.move(start.x, start.y);
      await expect.poll(() => cardShown(page)).toBe(true);
      const shown = await box(page, card);
      expect(apart(shown, await box(page, ".home-hero-logo"))).toBe(true);
      expect(apart(shown, await box(page, ".home-entry-links"))).toBe(true);
      // her hair starts 37 % across the artwork
      const art = await box(page, ".home-hero-character img");
      expect(shown.x + shown.width).toBeLessThanOrEqual(
        art.x + art.width * 0.37 + 1,
      );
      expect(shown.y).toBeGreaterThanOrEqual(art.y - 20);
      await page.mouse.move(0, 0);
    }
  });

  test("below 1280px Liru links straight to her sheet without the card", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto("/");
    await expect(page.locator(card)).toBeHidden();
    await page.locator(".home-liru-link").click();
    await expect(page).toHaveURL(/\/wiki\/liru$/);
  });

  test("reduced motion shows the card in place without movement", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const start = centre(await box(page, ".home-liru-link"));
    await page.mouse.move(start.x, start.y);
    await page.waitForTimeout(30);
    expect(await cardShown(page)).toBe(true);
    for (const selector of [card, ".home-hero-character"])
      expect(
        await page
          .locator(selector)
          .evaluate((n) => getComputedStyle(n).transform),
      ).toBe("none");
  });
});

test.describe("on a touch screen", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "touch only");
  });

  const open = (page: Page) =>
    page
      .locator("#home-liru-ask")
      .evaluate((node) => node.matches(":popover-open"));

  test("the first tap asks, a tap on the card opens the sheet", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(card)).toBeHidden();
    await page.locator(".home-liru-tap").tap();
    await expect.poll(() => open(page)).toBe(true);
    await expect(page).toHaveURL(/\/$/);
    const ask = await box(page, ".home-liru-ask-card");
    const viewport = page.viewportSize()!;
    expect(ask.x).toBeGreaterThanOrEqual(0);
    expect(ask.x + ask.width).toBeLessThanOrEqual(viewport.width);
    expect(apart(ask, await box(page, ".home-entry-links"))).toBe(true);
    expect(apart(ask, await box(page, ".home-hero-logo"))).toBe(true);
    // inside the hero, and off her face (x 40-85 %, y 5-28 % of the art)
    const hero = await box(page, ".home-feature");
    expect(ask.y + ask.height).toBeLessThanOrEqual(hero.y + hero.height);
    const art = await box(page, ".home-hero-character img");
    const face = {
      x: art.x + art.width * 0.4,
      y: art.y + art.height * 0.05,
      width: art.width * 0.45,
      height: art.height * 0.23,
    };
    expect(apart(ask, face)).toBe(true);
    // the "Go" button keeps to one line
    expect(
      (await box(page, ".home-liru-ask .home-liru-go")).height,
    ).toBeLessThan(36);
    // the tapped area stays invisible (the site's buttons are purple pills)
    expect(
      await page.locator(".home-liru-tap").evaluate((n) => {
        const style = getComputedStyle(n);
        return [style.backgroundImage, style.backgroundColor, style.boxShadow];
      }),
    ).toEqual(["none", "rgba(0, 0, 0, 0)", "none"]);
    await page.locator(".home-liru-ask-card").tap();
    await expect(page).toHaveURL(/\/wiki\/liru$/);
  });

  test("a tap elsewhere closes the question", async ({ page }) => {
    await page.goto("/");
    await page.locator(".home-liru-tap").tap();
    await expect.poll(() => open(page)).toBe(true);
    const logo = await box(page, ".home-hero-logo");
    await page.touchscreen.tap(logo.x + 10, logo.y + logo.height + 30);
    await expect.poll(() => open(page)).toBe(false);
    await expect(page).toHaveURL(/\/$/);
  });

  test("the entry buttons stay on top of Liru's tap area", async ({ page }) => {
    await page.goto("/");
    const links = page.locator(".home-entry-links a");
    for (let i = 0; i < (await links.count()); i++) {
      const point = centre((await links.nth(i).boundingBox())!);
      expect(
        await page.evaluate(
          ({ x, y }) =>
            document.elementFromPoint(x, y)?.closest(".home-entry-links") !==
            null,
          point,
        ),
      ).toBe(true);
    }
  });
});
