import { expect, test, type Page } from "@playwright/test";

async function scroll(page: Page, y: number) {
  await page.evaluate(async (top) => {
    // Let a preceding viewport resize establish the new scroll baseline before
    // this gesture; resize events are delivered asynchronously by the browser.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    window.scrollTo(0, top);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }, y);
}
const header = (page: Page) => page.locator(".site-header");

test("phone hides after downward travel and reveals on reverse without moving content", async ({
  page,
}) => {
  for (const appearance of ["default", "cute-pastel", "swiss-minimal"]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width: 390, height: 568 });
      await page.goto(`/header?appearance=${appearance}&theme=${theme}`);
      const height = (await header(page).boundingBox())!.height;
      const contentTop = await page
        .locator("main")
        .evaluate((n) => n.getBoundingClientRect().top + window.scrollY);
      await scroll(page, 64);
      await expect(header(page)).toHaveAttribute("data-scroll-hidden", "false");
      await scroll(page, 160);
      await expect(header(page)).toHaveAttribute("data-scroll-hidden", "true");
      await expect
        .poll(() =>
          header(page).evaluate((n) => n.getBoundingClientRect().bottom),
        )
        .toBeLessThanOrEqual(0);
      expect(
        await header(page).evaluate((n) => n.getBoundingClientRect().height),
      ).toBeCloseTo(height, 3);
      expect(
        await page
          .locator("main")
          .evaluate((n) => n.getBoundingClientRect().top + window.scrollY),
      ).toBeCloseTo(contentTop, 3);
      await scroll(page, 155);
      await expect(header(page)).toHaveAttribute("data-scroll-hidden", "true");
      await scroll(page, 146);
      await expect(header(page)).toHaveAttribute("data-scroll-hidden", "false");
      await scroll(page, 400);
      await expect(header(page)).toHaveAttribute("data-scroll-hidden", "true");
      // Changing only browser chrome height must preserve the hidden state.
      await page.setViewportSize({ width: 390, height: 600 });
      await expect(header(page)).toHaveAttribute("data-scroll-hidden", "true");
      await scroll(page, 0);
      await expect(header(page)).toHaveAttribute("data-scroll-hidden", "false");
    }
  }
});

test("menu, account dropdown and keyboard focus keep the phone header usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route("https://a.ppy.sh/**", (route) => route.abort());
  await page.goto("/header?user=staff");
  await page.locator(".menu-toggle").click();
  await scroll(page, 200);
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "false");
  await page.locator(".theme-control").click();
  await scroll(page, 300);
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "false");
  await page.keyboard.press("Escape");
  await page.locator(".menu-toggle").click();
  await page.locator("button.account-control").click();
  await scroll(page, 450);
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "false");
  await page.keyboard.press("Escape");
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await scroll(page, 600);
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "true");
  await page.locator(".brand").focus();
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "false");
  await page.keyboard.press("Tab");
  // Safari's platform tab setting can skip buttons; explicitly focus the
  // header control after keyboard input rather than assuming a tab order.
  await page.locator(".menu-toggle").focus();
  await expect(page.locator(".menu-toggle")).toBeFocused();
  await scroll(page, 800);
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "false");
});

test("desktop, route restoration and reduced motion reset the header safely", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 760, height: 568 });
  await page.goto("/header");
  await scroll(page, 200);
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "true");
  await expect(header(page)).toHaveCSS("transition-duration", "0s");
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "false");
  await scroll(page, 400);
  await expect(header(page)).toHaveCSS("transform", "none");
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "false");
  await scroll(page, 550);
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "true");
  await page
    .locator("[data-route-change]")
    .evaluate((node: HTMLButtonElement) => node.click());
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "false");
  expect(await page.evaluate(() => scrollY)).toBe(550);
  await scroll(page, 700);
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "false");
});

test("bottom overscroll does not look like reverse travel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto("/header");
  const max = await page.evaluate(
    () => document.documentElement.scrollHeight - innerHeight,
  );
  await scroll(page, max);
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "true");
  for (const y of [max + 80, max + 20, max]) {
    // Inject Safari-style out-of-range readings without claiming a real gesture.
    await page.evaluate(async (value) => {
      Object.defineProperty(window, "scrollY", { configurable: true, value });
      window.dispatchEvent(new Event("scroll"));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    }, y);
    await expect(header(page)).toHaveAttribute("data-scroll-hidden", "true");
  }
});

test("tournament context follows the visible header height", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto("/header?tournament=1");
  const bar = page.locator(".event-context");
  const height = await header(page).evaluate(
    (n) => n.getBoundingClientRect().height,
  );
  await scroll(page, 220);
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "true");
  await expect(bar).toHaveCSS("top", "0px");
  await expect
    .poll(() => bar.evaluate((n) => n.getBoundingClientRect().top))
    .toBe(0);
  await scroll(page, 200);
  await expect(header(page)).toHaveAttribute("data-scroll-hidden", "false");
  await expect(bar).toHaveCSS("top", `${height}px`);
});
