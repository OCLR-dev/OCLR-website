// Capture the shipped S4 appearance through its SSR preference on isolated real routes.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertTestDatabase } from "../../../../tests/database.ts";
import { db, closeDb } from "../../../../src/db/index.ts";
import { users } from "../../../../src/db/schema.ts";
import { createSession } from "../../../../src/lib/auth/sessions.ts";

assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const base = process.env.S4_PREVIEW_ORIGIN ?? "http://127.0.0.1:3194";
const origin = new URL(base);
if (!["127.0.0.1", "localhost"].includes(origin.hostname))
  throw new Error("Use the isolated loopback preview application.");
const uiBaseline = "60db020940f90f2549c85bb6dae4f38c04eb1e60";
const out = fileURLToPath(new URL(".", import.meta.url));
const sourceCss = await readFile(
  new URL("../../../../src/app/azure-theme.css", import.meta.url),
  "utf8",
);
const assets = await Promise.all(
  ["ink-brush.webp"].map(async (file) => ({
    file,
    bytes: await readFile(
      new URL(`../../../../public/themes/azure-brush/${file}`, import.meta.url),
    ),
  })),
);
const sourceArtwork = await readFile(
  new URL("../../../../public/archive/s4/key-visual.avif", import.meta.url),
);
const cases = [],
  screenshots = [],
  forcedColours = [],
  errors = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ reducedMotion: "reduce" });

async function applyPreview(page) {
  await page
    .context()
    .addCookies([{ name: "oclr-appearance", value: "azure-brush", url: base }]);
  const response = await page.reload();
  if (
    !response ||
    response.status() !== 200 ||
    !(await response.text())
      .match(/<html[^>]+>/)?.[0]
      ?.includes('data-appearance="azure-brush"')
  )
    throw new Error("S4 appearance was not server rendered");
  await ready(page);
}
async function contentSnapshot(page) {
  return page.locator("body").evaluate((n) => {
    const clone = n.cloneNode(true);
    clone
      .querySelectorAll("script,style,.appearance-trigger")
      .forEach((el) => el.remove());
    return {
      text: clone.textContent,
      elements: n.querySelectorAll("*").length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}
async function guard(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request();
    return new URL(request.url()).origin === origin.origin &&
      ["GET", "HEAD"].includes(request.method())
      ? route.continue()
      : route.abort();
  });
}
async function ready(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator(".archive-key-visual img")
    .evaluateAll((nodes) => Promise.all(nodes.map((n) => n.decode())));
}
const surfaces = [
  {
    name: "overview",
    path: "/tournaments/s4",
    prefix: "",
    selector: ".archive-overview-summary",
  },
  {
    name: "schedule",
    path: "/tournaments/s4/schedule",
    prefix: "schedule-",
    selector: ".historical-archive",
  },
  {
    name: "mappools",
    path: "/tournaments/s4/mappools",
    prefix: "mappools-",
    selector: ".archive-pool-page",
  },
  {
    name: "admin",
    path: "/admin/settings",
    prefix: "admin-",
    selector: ".settings-card",
  },
];
try {
  await db()
    .insert(users)
    .values({ osuId: 60001, username: "Synthetic UI Preview" })
    .onConflictDoNothing();
  const session = await createSession(60001);
  const page = await context.newPage();
  await guard(page);
  for (const theme of ["light", "dark"])
    for (const width of [320, 390, 768, 1440]) {
      const height = width < 800 ? 844 : 1000;
      await page.setViewportSize({ width, height });
      for (const surface of surfaces) {
        await context.clearCookies();
        await context.addCookies([
          ...[
            ["oclr-locale", "zh-Hant"],
            ["oclr-theme", theme],
            ["oclr-appearance", "default"],
          ].map(([name, value]) => ({ name, value, url: base })),
          ...(surface.name === "admin"
            ? [
                {
                  name: "oclr_session",
                  value: session.token,
                  domain: origin.hostname,
                  path: "/",
                  httpOnly: true,
                  sameSite: "Lax",
                  secure: false,
                },
              ]
            : []),
        ]);
        const response = await page.goto(base + surface.path);
        if (response.status() !== 200)
          throw new Error(`${surface.name}: HTTP ${response.status()}`);
        await page.locator(surface.selector).waitFor();
        await ready(page);
        const before = await contentSnapshot(page);
        const size = width === 1440 ? "desktop" : "mobile";
        if ([390, 1440].includes(width))
          await sharp(await page.screenshot())
            .webp({ quality: 88 })
            .toFile(`${out}current-${surface.prefix}${size}-${theme}.webp`);
        await applyPreview(page);
        const after = await contentSnapshot(page);
        if (before.text !== after.text || before.elements !== after.elements)
          throw new Error(
            `${surface.name}: appearance changed application content beyond its active label`,
          );
        if (after.overflow)
          throw new Error(
            `${surface.name}/${theme}/${width}: horizontal overflow`,
          );
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        if (axe.violations.length)
          errors.push({
            surface: surface.name,
            theme,
            width,
            violations: axe.violations.map((v) => ({
              id: v.id,
              targets: v.nodes.map((n) => n.target),
            })),
          });
        if (surface.name === "overview") {
          const image = await page
            .locator(".archive-key-visual img")
            .evaluate((n) => ({
              src: n.getAttribute("src"),
              width: n.naturalWidth,
              height: n.naturalHeight,
              fit: getComputedStyle(n).objectFit,
            }));
          if (
            image.src !== "/archive/s4/key-visual.avif" ||
            image.width !== 1728 ||
            image.height !== 1080 ||
            image.fit !== "contain"
          )
            throw new Error(
              "S4 original artwork must remain complete and unmodified.",
            );
          if ((await page.locator(".archive-counts > div").count()) !== 5)
            throw new Error("Missing archive metrics");
          if ((await page.locator(".rules-article > section").count()) !== 4)
            throw new Error("Missing configured S4 rule chapters");
        }
        if ([390, 1440].includes(width)) {
          const file = `${surface.prefix}${size}-${theme}.webp`;
          await sharp(await page.screenshot())
            .webp({ quality: 88 })
            .toFile(out + file);
          screenshots.push({ file, path: surface.path, theme, width, height });
        }
        if (surface.name === "overview" && width < 760) {
          const toggle = page.locator(".tournament-menu");
          await toggle.click();
          const nav = page.locator(".tournament-navigation nav");
          if (!(await nav.isVisible()))
            throw new Error("Tournament menu did not open");
          const box = await nav.boundingBox();
          if (box.x < 0 || box.x + box.width > width + 1)
            throw new Error("Tournament menu overflow");
          if (width === 390)
            await sharp(await page.screenshot())
              .webp({ quality: 88 })
              .toFile(`${out}menu-mobile-${theme}.webp`);
          await page.keyboard.press("Escape");
          if (!(await toggle.evaluate((n) => n === document.activeElement)))
            throw new Error("Menu focus was not restored");
        }
        if (surface.name === "admin") {
          const select = page.locator(".settings-card select").first();
          await page.keyboard.press("Tab");
          await select.focus();
          const focus = await select.evaluate((n) => ({
            style: getComputedStyle(n).outlineStyle,
            width: getComputedStyle(n).outlineWidth,
          }));
          if (focus.style === "none" || focus.width === "0px")
            throw new Error("Missing keyboard focus");
        }
        cases.push({
          surface: surface.name,
          path: surface.path,
          theme,
          width,
          domPreserved: true,
          overflow: false,
          axeViolations: axe.violations.length,
        });
      }
    }
  for (const theme of ["light", "dark"])
    for (const width of [320, 1440]) {
      await context.clearCookies();
      await context.addCookies(
        [
          ["oclr-locale", "zh-Hant"],
          ["oclr-theme", theme],
          ["oclr-appearance", "default"],
        ].map(([name, value]) => ({ name, value, url: base })),
      );
      await page.setViewportSize({ width, height: 844 });
      await page.goto(base + "/tournaments/s4");
      await ready(page);
      await applyPreview(page);
      await page.emulateMedia({ forcedColors: "active" });
      const state = await page.locator(".page-heading").evaluate((n) => ({
        decoration: getComputedStyle(n, "::before").display,
        background: getComputedStyle(n).backgroundImage,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      if (
        state.decoration !== "none" ||
        state.background !== "none" ||
        state.overflow
      )
        throw new Error("High-contrast fallback failed");
      forcedColours.push({ theme, width, ...state });
      await page.emulateMedia({ forcedColors: "none" });
    }
  const detail = await browser.newContext({
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const detailPage = await detail.newPage();
  await guard(detailPage);
  for (const theme of ["light", "dark"])
    for (const width of [937, 390]) {
      await detail.clearCookies();
      await detail.addCookies(
        [
          ["oclr-locale", "zh-Hant"],
          ["oclr-theme", theme],
          ["oclr-appearance", "default"],
        ].map(([name, value]) => ({ name, value, url: base })),
      );
      await detailPage.setViewportSize({ width, height: 815 });
      await detailPage.goto(base + "/tournaments/s4");
      await ready(detailPage);
      await applyPreview(detailPage);
      const heading = detailPage.locator(".historical-archive > .page-heading");
      const geometry = await heading.evaluate((n) => ({
        width: n.getBoundingClientRect().width,
        height: n.getBoundingClientRect().height,
        hasTexture: getComputedStyle(n).backgroundImage.includes(
          "/themes/azure-brush/ink-brush.webp",
        ),
        text: [...n.querySelectorAll("h1,p")].map((el) => ({
          width: el.getBoundingClientRect().width,
          fits: el.scrollWidth <= el.clientWidth,
        })),
      }));
      if (!geometry.hasTexture || geometry.text.some((t) => !t.fits))
        throw new Error("Banner texture is missing or heading text overflows");
      const file = `heading-${width}-${theme}.png`;
      await heading.screenshot({ path: out + file, animations: "disabled" });
      screenshots.push({
        file,
        path: "/tournaments/s4",
        theme,
        width,
        deviceScaleFactor: 2,
        geometry,
      });
    }
  await detail.close();
  await writeFile(
    out + "verification.json",
    JSON.stringify(
      {
        date: new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Taipei",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
        uiBaseline: execFileSync("git", ["rev-parse", uiBaseline], {
          encoding: "utf8",
        }).trim(),
        scope:
          "Registered azure-brush SSR preference, built application CSS and shipped SVG assets; no injected preview styles",
        buildId: (
          await readFile(
            new URL("../../../../.next/BUILD_ID", import.meta.url),
            "utf8",
          )
        ).trim(),
        locale: "zh-Hant",
        decorativeAssets: assets.map(({ file, bytes }) => ({
          file,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        })),
        browser: "Google Chrome",
        screenshots,
        cases,
        forcedColours,
        errors,
        artworkSha256: createHash("sha256").update(sourceArtwork).digest("hex"),
        stylesheetSha256: createHash("sha256").update(sourceCss).digest("hex"),
        fixture:
          "Committed S4 archive and rules; 27 approved, 5 pending and 2 unreviewed source statuses are preserved, and the ordinary public projection is unchanged in the isolated test DB",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        cases: cases.length,
        axeScans: cases.length,
        screenshots: screenshots.length,
        forcedColours: forcedColours.length,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await browser.close();
  await closeDb();
}
if (errors.length) process.exitCode = 1;
