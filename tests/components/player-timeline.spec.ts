import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const theme of ["light", "dark"]) {
  for (const participated of [false, true]) {
    test(`S6 shares the complete season background (${theme}, participated=${participated})`, async ({
      page,
      isMobile,
    }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(
        `/player-timeline?theme=${theme}${participated ? "&participated" : ""}`,
      );
      const s6 = page.getByRole(participated ? "link" : "button", {
        name: /^S6 ·/,
      });
      await s6.focus();
      const tip = page.getByRole("note");
      await expect(tip).toContainText("S6 · 星環脈衝");
      await expect(tip).toContainText("2021年5月8日 – 2021年6月20日");
      await expect(tip).toContainText(participated ? "\n參賽" : "未參賽");
      const visual = tip.locator('[aria-hidden="true"]');
      const field = `/themes/orbital-pulse/orbital-field-${theme}.svg`;
      await expect(visual).toHaveCSS("background-image", new RegExp(field));
      await expect(visual).toHaveCSS("background-size", "cover");
      await expect(visual).toHaveCSS("opacity", "0.4");
      await expect(page.locator(".page-heading")).toHaveCSS(
        "background-image",
        new RegExp(field),
      );
      const asset = await page.request.get(field);
      expect(asset.status()).toBe(200);
      expect(asset.headers()["content-type"]).toContain("image/svg+xml");
      expect(
        await page.evaluate(async (src) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          return image.naturalWidth > 0 && image.naturalHeight > 0;
        }, field),
      ).toBe(true);
      const box = (await tip.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
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
      await page.screenshot({
        path: info.outputPath(`s6-${theme}-${participated}.png`),
      });

      // Neighbouring seasons keep their own backgrounds, and S6 restores its
      // complete artwork on pointer, keyboard and touch interaction.
      for (const [season, artwork] of [
        [5, `/themes/prism-overture/prism-field-${theme}.svg`],
        [7, "/themes/graphite-arena/honeycomb.svg"],
      ] as const) {
        const neighbour = page.getByRole("button", {
          name: new RegExp(`^S${season} ·`),
        });
        await neighbour.focus();
        await expect(visual).toHaveCSS("background-image", new RegExp(artwork));
        await s6.focus();
        await expect(visual).toHaveCSS("background-image", new RegExp(field));
      }
      if (!participated) {
        await s6.blur();
        if (isMobile) {
          await s6.tap();
          await expect(s6).toHaveAttribute("aria-pressed", "true");
        } else {
          await s6.hover();
        }
        await expect(visual).toHaveCSS("background-image", new RegExp(field));
        await s6.focus();
        if (!isMobile) await page.mouse.move(0, 0);
        await page.keyboard.press("Enter");
        await page.keyboard.press("Escape");
      } else {
        await expect(s6).toHaveAttribute("href", "/tournaments/s6");
      }
      await s6.blur();
      await expect(tip).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
