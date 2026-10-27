import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const labels = {
  "zh-Hans": { title: "莉露（LR娘）：OCLR 吉祥物", credits: "来源与授权" },
  "zh-Hant": { title: "莉露（LR娘）：OCLR 吉祥物", credits: "來源與授權" },
  en: {
    title: "Liru (LR-chan): the OCLR mascot",
    credits: "Credits and licence",
  },
};
const appearances = [
  "default",
  "cute-pastel",
  "swiss-minimal",
  "claymorphism",
  "manga-halftone",
  "glassmorphism",
  "esports-broadcast",
  "retro-arcade",
  "frutiger-aero",
  "skyline-pop",
  "glacier-blue",
  "sakura-circuit",
  "graphite-arena",
];
// Every appearance in the default locale, plus the other locales in the default appearance.
const cases = [
  ...appearances.map((appearance) => ["zh-Hans", appearance] as const),
  ["zh-Hant", "default"] as const,
  ["en", "default"] as const,
];

for (const [locale, appearance] of cases)
  for (const theme of ["light", "dark"])
    test(`Liru Wiki article: ${locale}, ${appearance}, ${theme}`, async ({
      page,
      context,
      isMobile,
    }) => {
      await context.addCookies(
        [
          ["oclr-locale", locale],
          ["oclr-appearance", appearance],
          ["oclr-theme", theme],
        ].map(([name, value]) => ({
          name,
          value,
          url: "http://127.0.0.1:3100",
        })),
      );
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const width of isMobile ? [320, 390] : [1440]) {
        await page.setViewportSize({ width, height: 900 });
        const response = await page.goto("/wiki/liru");
        expect(response?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("#wiki-title")).toHaveText(
          labels[locale].title,
        );
        await expect(
          page.locator(".wiki-articles a[aria-current='page']"),
        ).toHaveAttribute("href", "/wiki/liru");
        const figures = page.locator(".wiki-figure");
        await expect(figures).toHaveCount(3);
        for (const img of await figures.locator("img").all()) {
          await img.scrollIntoViewIfNeeded();
          await expect(img).toHaveAttribute("alt", /.{10,}/);
          await expect
            .poll(() =>
              img.evaluate((node: HTMLImageElement) =>
                node.complete ? node.naturalWidth : 0,
              ),
            )
            .toBe(1600);
          const box = (await img.boundingBox())!;
          expect(box.width).toBeLessThanOrEqual(width);
        }
        await expect(
          page.getByRole("heading", { name: labels[locale].credits }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "CC BY 4.0" }),
        ).toHaveAttribute(
          "href",
          "https://creativecommons.org/licenses/by/4.0/",
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          (await new AxeBuilder({ page }).include(".wiki-page").analyze())
            .violations,
        ).toEqual([]);
      }
      expect(errors).toEqual([]);
    });
