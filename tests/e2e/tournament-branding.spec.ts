import { test, expect } from "@playwright/test";
import { closeDb } from "../../src/db";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import { seedSession } from "./session";
import { englishStorage } from "../fixtures/preferences";
import { extendedSchemas } from "../../src/lib/extended-read-resources";
import { publicTournamentSchema } from "../../src/lib/read-api-contract";

const assets = [
  { src: "/archive/s8/thumbnail.jpg", width: 1920, height: 1080 },
  { src: "/archive/s9/thumbnail.png", width: 1920, height: 1080 },
  { src: "/archive/s10/thumbnail.png", width: 1024, height: 1024 },
];
const labels = {
  en: {
    logo: "Square logo",
    key: "Key visual",
    seasons: [
      "OCLR Season 1 — ",
      "OCLR Season 2 — ",
      "OCLR Season 3 — ",
      "OCLR Season 4 — ",
      "OCLR Season 5 (β) — ",
    ],
  },
  "zh-Hans": {
    logo: "方形标志",
    key: "主视觉",
    seasons: [
      "OCLR 第 1 赛季 — ",
      "OCLR 第 2 赛季 — ",
      "OCLR 第 3 赛季 — ",
      "OCLR 第 4 赛季 — ",
      "OCLR 第 5 赛季（β） — ",
    ],
  },
  "zh-Hant": {
    logo: "方形標誌",
    key: "主視覺",
    seasons: [
      "OCLR 第 1 賽季 — ",
      "OCLR 第 2 賽季 — ",
      "OCLR 第 3 賽季 — ",
      "OCLR 第 4 賽季 — ",
      "OCLR 第 5 賽季（β） — ",
    ],
  },
};
const earlyAssets = [
  "/archive/s1/key-visual.webp",
  "/archive/s2/key-visual.avif",
  "/archive/s3/key-visual.avif",
  "/archive/s4/key-visual.avif",
  "/archive/s5/key-visual.png",
];

test.describe("tournament artwork options (#356)", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("localizes both selectors and previews S8–S10 at desktop and narrow mobile widths", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await seedEditions([edition]);
    for (const [locale, copy] of Object.entries(labels))
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          { name: "oclr-locale", value: locale, url: "http://127.0.0.1:3100" },
          { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
        ]);
        await page.goto("/admin/tournaments/test-cup/settings");
        const logo = page.getByRole("combobox", {
          name: copy.logo,
          exact: true,
        });
        const visual = page.getByRole("combobox", {
          name: copy.key,
          exact: true,
        });
        for (const [index, src] of earlyAssets.entries())
          for (const [select, kind] of [
            [logo, copy.logo],
            [visual, copy.key],
          ] as const)
            await expect(select.locator(`option[value='${src}']`)).toHaveText(
              copy.seasons[index] + kind,
            );
        for (const width of isMobile ? [320, 390] : [1440]) {
          await page.setViewportSize({ width, height: 1000 });
          if (theme === "light") {
            await logo.selectOption("/archive/s5/key-visual.png");
            await visual.selectOption("/archive/s5/key-visual.png");
            for (const preview of await page
              .locator(".settings-artwork-preview")
              .all())
              await expect(preview).toHaveJSProperty("naturalWidth", 1920);
            await page.locator(".settings-artwork-grid").screenshot({
              path: info.outputPath(`beta-${locale}-${width}.png`),
            });
          }
          for (const asset of assets) {
            await logo.selectOption(asset.src);
            await visual.selectOption(asset.src);
            const previews = page.locator(".settings-artwork-preview");
            await expect(previews).toHaveCount(2);
            for (const preview of await previews.all()) {
              await expect(preview).toHaveAttribute("src", asset.src);
              await expect(preview).toHaveJSProperty(
                "naturalWidth",
                asset.width,
              );
              await expect(preview).toHaveJSProperty(
                "naturalHeight",
                asset.height,
              );
              await expect(preview).toHaveCSS("object-fit", "contain");
            }
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
          }
          if (locale === "zh-Hant")
            await page.locator(".settings-artwork-grid").screenshot({
              path: info.outputPath(`branding-${theme}-${width}.png`),
            });
        }
      }
  });
  test("saves each visual, reloads the shared contracts and renders the complete public image", async ({
    page,
    context,
    browser,
    isMobile,
  }, info) => {
    test.setTimeout(90000);
    const slug = `branding-${isMobile ? "mobile" : "desktop"}-test`;
    const archive = { ...historicalArchive, editionSlug: slug };
    await seedEditions([
      {
        ...edition,
        slug,
        name: "Branding verification",
        status: "completed",
        registration: null,
        archive,
      },
    ]);
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await page.goto(`/admin/tournaments/${slug}/settings`);
    const logo = page.getByRole("combobox", {
      name: "Square logo",
      exact: true,
    });
    const visual = page.getByRole("combobox", {
      name: "Key visual",
      exact: true,
    });
    const guest = await browser.newContext({
      storageState: englishStorage,
      baseURL: "http://127.0.0.1:3100",
    });
    const publicPage = await guest.newPage();
    await publicPage.setViewportSize({
      width: isMobile ? 320 : 1440,
      height: 1000,
    });
    try {
      for (const asset of assets) {
        await logo.selectOption(asset.src);
        await visual.selectOption(asset.src);
        await page
          .getByRole("button", { name: "Save general settings", exact: true })
          .click();
        await expect(page.getByRole("status")).toContainText("saved");
        await page.reload();
        await expect(logo).toHaveValue(asset.src);
        await expect(visual).toHaveValue(asset.src);
        const workspace = await (
          await context.request.get(`/api/admin/tournaments/${slug}`)
        ).json();
        expect(
          extendedSchemas.tournamentForAdmin.safeParse(workspace).success,
        ).toBe(true);
        expect(workspace.edition.archive).toEqual(archive);
        expect(workspace.edition.branding).toEqual({
          logo: asset.src,
          keyVisual: asset.src,
          background: null,
        });
        const dto = await (
          await guest.request.get(`/api/v1/tournaments/${slug}`)
        ).json();
        const data = publicTournamentSchema.parse(dto.data);
        expect(data.branding.keyVisual).toBe(asset.src);
        expect(data.overview.kind).toBe("historical_archive");
        if (data.overview.kind === "historical_archive")
          expect(data.overview.keyVisual).toEqual(asset);
        for (const theme of ["light", "dark"]) {
          await guest.addCookies([
            { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
          ]);
          await publicPage.goto(`/tournaments/${slug}`);
          const image = publicPage.getByRole("img", {
            name: "Branding verification key visual",
            exact: true,
          });
          await expect(image).toHaveAttribute("src", asset.src);
          await expect(image).toHaveAttribute("width", String(asset.width));
          await expect(image).toHaveAttribute("height", String(asset.height));
          await expect(image).toHaveJSProperty("naturalWidth", asset.width);
          await expect(image).toHaveCSS("object-fit", "contain");
          expect(
            await publicPage.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await publicPage.locator(".archive-overview-summary").screenshot({
            path: info.outputPath(
              `public-s${assets.indexOf(asset) + 8}-${theme}.png`,
            ),
          });
        }
      }
      for (const value of ["/oclr-s11-key-visual.webp", ""]) {
        await visual.selectOption(value);
        if (!value) await logo.selectOption("");
        await page
          .getByRole("button", { name: "Save general settings", exact: true })
          .click();
        await expect(page.getByRole("status")).toContainText("saved");
        await page.reload();
        await expect(visual).toHaveValue(value);
      }
      await publicPage.reload();
      await expect(publicPage.locator(".archive-key-visual")).toHaveCount(0);
    } finally {
      await guest.close();
    }
  });
});
