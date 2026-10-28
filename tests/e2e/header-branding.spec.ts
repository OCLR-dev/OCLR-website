import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";

// Read-only cases own their browser context and have no shared fixture state.
// Allow individual sharding; each CI runner still uses only one DB worker.
test.describe.configure({ mode: "parallel" });

const labels = {
  "zh-Hans": { home: "OCLR 首页", wiki: "OCLR 维基" },
  "zh-Hant": { home: "OCLR 首頁", wiki: "OCLR 維基" },
  en: { home: "OCLR home", wiki: "OCLR Wiki" },
};
// Compare the rendered outlines to the approved asset, so an accessible label
// alone cannot hide another accidental OCL-only rendition.
const approvedPaths = Array.from(
  readFileSync("public/branding/oclr-wordmark.svg", "utf8").matchAll(
    /<path d="([^"]+)"/g,
  ),
  (match) => match[1],
);

for (const locale of ["zh-Hans", "zh-Hant", "en"] as const)
  for (const appearance of [
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
    "orbital-pulse",
  ])
    for (const theme of ["light", "dark"])
      test(`OCLR header: ${locale}, ${appearance}, ${theme}`, async ({
        page,
        context,
        isMobile,
      }, info) => {
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
          const response = await page.goto("/wiki");
          expect(response?.status()).toBe(200);
          await expect(page).toHaveTitle(new RegExp(labels[locale].wiki));
          await expect(page.locator("html")).toHaveAttribute("lang", locale);
          await expect(page.locator("html")).toHaveAttribute(
            "data-appearance",
            appearance,
          );
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme,
          );
          const header = page.locator(".site-header");
          const home = header.getByRole("link", {
            name: labels[locale].home,
            exact: true,
          });
          await expect(home).toHaveAttribute("href", "/");
          const logo = home.locator("svg");
          await expect(logo).toBeVisible();
          const artwork = await logo.evaluate((svg: SVGSVGElement) => ({
            paths: Array.from(svg.querySelectorAll("path"), (p) =>
              p.getAttribute("d"),
            ),
            transforms: svg.querySelectorAll("[transform]").length,
            bounds: {
              x: svg.getBBox().x,
              y: svg.getBBox().y,
              width: svg.getBBox().width,
              height: svg.getBBox().height,
            },
            viewBox: {
              x: svg.viewBox.baseVal.x,
              y: svg.viewBox.baseVal.y,
              width: svg.viewBox.baseVal.width,
              height: svg.viewBox.baseVal.height,
            },
            ratio:
              svg.getBoundingClientRect().width /
              svg.getBoundingClientRect().height,
          }));
          expect(artwork.paths).toEqual(approvedPaths);
          expect(artwork.transforms).toBe(0);
          expect(artwork.ratio).toBeCloseTo(1465 / 430, 2);
          expect(artwork.bounds.x).toBeGreaterThanOrEqual(artwork.viewBox.x);
          expect(artwork.bounds.y).toBeGreaterThanOrEqual(artwork.viewBox.y);
          expect(artwork.bounds.x + artwork.bounds.width).toBeLessThanOrEqual(
            artwork.viewBox.x + artwork.viewBox.width,
          );
          expect(artwork.bounds.y + artwork.bounds.height).toBeLessThanOrEqual(
            artwork.viewBox.y + artwork.viewBox.height,
          );
          const geometry = await header.evaluate((node) => {
            const elements = Array.from(
              node.querySelector(".nav-wrap")!.children,
            ).filter((el) => el.getBoundingClientRect().width > 0);
            const boxes = elements.map((el) => el.getBoundingClientRect());
            return {
              overflow: document.documentElement.scrollWidth > innerWidth,
              outside: boxes.some(
                (box) => box.left < 0 || box.right > innerWidth,
              ),
              overlap: boxes.some((a, i) =>
                boxes
                  .slice(i + 1)
                  .some(
                    (b) =>
                      Math.min(a.right, b.right) - Math.max(a.left, b.left) >
                        1 &&
                      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1,
                  ),
              ),
            };
          });
          expect(geometry).toEqual({
            overflow: false,
            outside: false,
            overlap: false,
          });
          if (isMobile) {
            const toggle = header.locator(".menu-toggle");
            await toggle.focus();
            await page.keyboard.press("Enter");
            await expect(toggle).toHaveAttribute("aria-expanded", "true");
          }
          const wiki = header.locator(".main-nav").getByRole("link", {
            name: labels[locale].wiki,
            exact: true,
          });
          await expect(wiki).toBeVisible();
          await expect(wiki).toHaveAttribute("href", "/wiki");
          await expect(wiki).toHaveAttribute("aria-current", "page");
          expect(
            (await new AxeBuilder({ page }).include(".site-header").analyze())
              .violations,
          ).toEqual([]);
          await expect(page.locator(".wiki-page .eyebrow")).toContainText(
            labels[locale].wiki,
          );
          const screenshot = info.outputPath(`header-${width}.png`);
          await (isMobile ? page : header).screenshot({
            path: screenshot,
            animations: "disabled",
          });
          await info.attach(`header-${width}`, {
            path: screenshot,
            contentType: "image/png",
          });
          await wiki.focus();
          await expect(wiki).toBeFocused();
          await page.keyboard.press("Enter");
          await expect(page).toHaveURL(/\/wiki$/);
          if (isMobile)
            await expect(header.locator(".menu-toggle")).toHaveAttribute(
              "aria-expanded",
              "false",
            );
          // The same-route link can show a modal loading overlay. Wait until
          // it releases keyboard focus before activating the brand link.
          await page.waitForLoadState("networkidle");
          await expect(page.locator("[data-loading-overlay]")).toHaveCount(0);
          await home.press("Enter");
          await expect(page).toHaveURL("http://127.0.0.1:3100/");
        }
        expect(errors).toEqual([]);
      });
