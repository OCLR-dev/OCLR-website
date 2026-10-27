// Review evidence from actual application routes; no alternate page renderer.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertTestDatabase } from "../../../../tests/database.ts";
import { db, closeDb } from "../../../../src/db/index.ts";
import { users } from "../../../../src/db/schema.ts";
import { createSession } from "../../../../src/lib/auth/sessions.ts";
assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const base = process.env.S7_PREVIEW_ORIGIN ?? "http://127.0.0.1:3197";
const origin = new URL(base);
if (!["127.0.0.1", "localhost"].includes(origin.hostname))
  throw new Error("Use the isolated loopback preview application.");
const out = fileURLToPath(new URL(".", import.meta.url));
const uiBaseline =
  process.env.S7_UI_BASELINE ?? "5c9f0834548ebe4c0ce91ca5bc24efa94138fb32";
execFileSync("git", [
  "diff",
  "--exit-code",
  uiBaseline,
  "--",
  "src",
  "messages",
  "public",
]);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const cases = [],
  errors = [],
  shots = [],
  materialChecks = [];
const context = await browser.newContext({
  reducedMotion: "reduce",
  viewport: { width: 1440, height: 1000 },
});
let session;
try {
  await db()
    .insert(users)
    .values({ osuId: 60001, username: "Synthetic UI Preview" })
    .onConflictDoNothing();
  session = await createSession(60001);

  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  // No outgoing provider traffic or business commands during visual review.
  await page.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      url.origin !== origin.origin ||
      !["GET", "HEAD"].includes(request.method())
    )
      return route.abort();
    return route.continue();
  });
  const surfaces = [
    {
      name: "overview",
      path: "/tournaments/s7",
      prefix: "",
      selector: ".archive-overview-summary",
    },
    {
      name: "mappools",
      path: "/tournaments/s7/mappools",
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
  for (const theme of ["light", "dark"]) {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 800 ? 844 : 1000 });
      for (const surface of surfaces) {
        await context.clearCookies();
        await context.addCookies([
          { name: "oclr-locale", value: "zh-Hans", url: base },
          { name: "oclr-appearance", value: "default", url: base },
          { name: "oclr-theme", value: theme, url: base },
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
        await page.waitForLoadState("networkidle");
        await page.evaluate(() => document.fonts.ready);
        await page
          .locator(".archive-key-visual img")
          .evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
        // Compare the same application tree with default and registered appearance.
        const before = await page.locator("body").evaluate((node) => ({
          elements: node.querySelectorAll("*").length,
          text: node.innerText,
        }));
        if (width === 390 || width === 1440) {
          await sharp(await page.screenshot())
            .webp({ quality: 88 })
            .toFile(
              `${out}current-${surface.prefix}${width === 1440 ? "desktop" : "mobile"}-${theme}.webp`,
            );
        }
        {
          await context.addCookies([
            { name: "oclr-appearance", value: "graphite-arena", url: base },
          ]);
          await page.reload();
          await page.locator(surface.selector).waitFor();
          await page.waitForLoadState("networkidle");
          await page.evaluate(() => document.fonts.ready);
          await page
            .locator(".archive-key-visual img")
            .evaluateAll((imgs) =>
              Promise.all(imgs.map((img) => img.decode())),
            );
        }
        const after = await page.locator("body").evaluate((node) => ({
          elements: node.querySelectorAll("*").length,
          text: node.innerText,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }));
        if (before.text !== after.text || before.elements !== after.elements)
          throw new Error(
            "Appearance changed the rendered UI content or component tree.",
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
          const count = await page.locator(".archive-counts > div").count();
          if (count !== 5)
            throw new Error(
              "Latest archive overview must retain five metric rows.",
            );
          if (!(await page.locator("#rules").isVisible()))
            throw new Error("Latest historical rules section missing.");
          const original = await page
            .locator(".archive-key-visual img")
            .evaluate((image) => ({
              src: image.getAttribute("src"),
              width: image.naturalWidth,
              height: image.naturalHeight,
              fit: getComputedStyle(image).objectFit,
            }));
          if (
            original.src !== "/archive/s7/key-visual.jpg" ||
            original.width !== 1920 ||
            original.height !== 1080 ||
            original.fit !== "contain"
          )
            throw new Error(
              "S7 must retain the complete original 1920x1080 artwork.",
            );
        }
        if (width === 390 || width === 1440) {
          const name = `${surface.prefix}${width === 1440 ? "desktop" : "mobile"}-${theme}.webp`;
          await sharp(await page.screenshot())
            .webp({ quality: 88 })
            .toFile(out + name);
          shots.push({
            file: name,
            path: surface.path,
            theme,
            width,
            height: width < 800 ? 844 : 1000,
          });
        }
        if (surface.name === "overview") {
          if (width < 760) {
            const trigger = page.locator(".tournament-menu");
            await trigger.click();
            const menu = page.getByRole("navigation").filter({
              has: page.locator('a[href="/tournaments/s7/staff"]'),
            });
            if (!(await menu.isVisible()))
              throw new Error("Current tournament mobile menu failed.");
            if (width === 390)
              await sharp(await page.screenshot())
                .webp({ quality: 88 })
                .toFile(`${out}menu-mobile-${theme}.webp`);
            await page.keyboard.press("Escape");
            if (
              !(await trigger.evaluate(
                (node) => node === document.activeElement,
              ))
            )
              throw new Error("Tournament menu focus not restored.");
          }
          await page.evaluate(() => window.scrollTo(0, 650));
          const header = await page.locator(".site-header").boundingBox(),
            bar = await page.locator(".event-context").boundingBox();
          if (bar.y < header.height - 1 || bar.y > header.height + 16)
            throw new Error("Measured latest header stack regressed.");
          if (width === 390 || width === 1440) {
            await page
              .locator("#rules")
              .evaluate((node) => node.scrollIntoView({ block: "start" }));
            const file = `rules-${width === 1440 ? "desktop" : "mobile"}-${theme}.webp`;
            await sharp(await page.screenshot())
              .webp({ quality: 88 })
              .toFile(out + file);
            shots.push({
              file,
              path: surface.path + "#rules",
              theme,
              width,
              height: width < 800 ? 844 : 1000,
            });
          }
        }
        cases.push({
          surface: surface.name,
          path: surface.path,
          theme,
          width,
          domPreserved: true,
          overflow: false,
          axeViolations: axe.violations.length,
          ...(surface.name === "overview"
            ? {
                metrics: await page
                  .locator(".archive-counts > div")
                  .evaluateAll((nodes) =>
                    nodes.map((node) => ({
                      label: node.querySelector("dt").textContent,
                      value: node.querySelector("dd").textContent,
                    })),
                  ),
              }
            : {}),
        });
      }
    }
  }
  // Engineering linework retires in system high-contrast mode.
  for (const theme of ["light", "dark"]) {
    for (const width of [320, 1440]) {
      await context.clearCookies();
      await context.addCookies([
        { name: "oclr-locale", value: "zh-Hans", url: base },
        { name: "oclr-theme", value: theme, url: base },
        { name: "oclr-appearance", value: "graphite-arena", url: base },
      ]);
      await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 });
      await page.goto(base + "/tournaments/s7");
      await page.locator(".archive-key-visual img").waitFor();
      await page.emulateMedia({ forcedColors: "active" });
      if (width === 320) await page.locator(".tournament-menu").click();
      const state = await page.evaluate(() => {
        const nav = document.querySelector(".tournament-navigation nav");
        const box = nav.getBoundingClientRect();
        return {
          image: getComputedStyle(document.querySelector(".archive-key-visual"))
            .backgroundImage,
          linework: getComputedStyle(
            document.querySelector(".page-heading"),
            "::before",
          ).display,
          heading: getComputedStyle(
            document.querySelector(".page-heading"),
            "::after",
          ).display,
          navigation: getComputedStyle(nav).backgroundImage,
          metalRemoved: [
            ".site-header",
            ".page-heading",
            ".archive-counts",
          ].every((selector) => {
            const style = getComputedStyle(document.querySelector(selector));
            return (
              style.backgroundImage === "none" && style.boxShadow === "none"
            );
          }),
          selection: getComputedStyle(nav.querySelector("a[aria-current]"))
            .outlineStyle,
          inViewport:
            box.left >= 0 &&
            box.right <= innerWidth &&
            box.bottom <= innerHeight,
        };
      });
      if (
        state.image !== "none" ||
        state.linework !== "none" ||
        state.heading !== "none" ||
        state.navigation !== "none" ||
        !state.metalRemoved ||
        state.selection === "none" ||
        !state.inViewport
      )
        throw new Error(
          `Forced-colors material fallback: ${JSON.stringify(state)}`,
        );
      if (width === 320) {
        await page.keyboard.press("Escape");
        if (
          !(await page
            .locator(".tournament-menu")
            .evaluate((node) => node === document.activeElement))
        )
          throw new Error("Forced-colors menu focus was not restored.");
      }
      materialChecks.push({
        theme,
        width,
        height: width === 320 ? 568 : 1000,
        forcedColors: "passed",
        decorationRemoved: true,
        metalRemoved: true,
        selectionVisible: true,
        menuInViewport: true,
      });
      await page.emulateMedia({ forcedColors: "none" });
    }
  }
  // Native 2x detail captures of the shipped insert, with its actual heading behind it.
  const detailContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  try {
    const detailPage = await detailContext.newPage();
    detailPage.on("pageerror", (error) => errors.push(error.message));
    await detailPage.route("**/*", (route) => {
      const request = route.request();
      if (
        new URL(request.url()).origin !== origin.origin ||
        !["GET", "HEAD"].includes(request.method())
      )
        return route.abort();
      return route.continue();
    });
    for (const theme of ["light", "dark"]) {
      await detailContext.clearCookies();
      await detailPage.setViewportSize({ width: 1440, height: 1000 });
      await detailContext.addCookies([
        { name: "oclr-locale", value: "zh-Hans", url: base },
        { name: "oclr-appearance", value: "graphite-arena", url: base },
        { name: "oclr-theme", value: theme, url: base },
      ]);
      await detailPage.goto(base + "/tournaments/s7");
      await detailPage.waitForLoadState("networkidle");
      await detailPage.evaluate(() => document.fonts.ready);
      const heading = await detailPage.locator(".page-heading").boundingBox();
      const clip = {
        x: Math.floor(heading.x + heading.width - 320),
        y: Math.floor(heading.y),
        width: 320,
        height: Math.ceil(heading.height),
      };
      const file = `detail-desktop-${theme}.png`;
      await detailPage.screenshot({
        path: out + file,
        clip,
        animations: "disabled",
      });
      shots.push({
        file,
        path: "/tournaments/s7",
        theme,
        width: 1440,
        height: 1000,
        detail: { ...clip, deviceScaleFactor: 2 },
      });
      // Match the reported narrow-desktop mappool controls and literal long titles.
      await detailPage.setViewportSize({ width: 699, height: 815 });
      await detailPage.goto(base + "/tournaments/s7/mappools");
      await detailPage.waitForLoadState("networkidle");
      for (const [name, selector] of [
        ["map-controls", ".map-browse-toolbar"],
        ["map-nm2", "#map-NM2"],
        ["map-ace1", "#map-ACE1"],
      ]) {
        const target = detailPage.locator(selector);
        await target.evaluate((node) =>
          node.scrollIntoView({ block: "center" }),
        );
        const file = `${name}-${theme}.png`;
        await target.screenshot({ path: out + file, animations: "disabled" });
        shots.push({
          file,
          path: "/tournaments/s7/mappools",
          theme,
          width: 699,
          height: 815,
          detail: { selector, deviceScaleFactor: 2 },
        });
      }
      await detailContext.addCookies([
        {
          name: "oclr_session",
          value: session.token,
          domain: origin.hostname,
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
          secure: false,
        },
        { name: "oclr-locale", value: "zh-Hant", url: base },
      ]);
      for (const width of [937, 390]) {
        await detailPage.setViewportSize({ width, height: 815 });
        if ((await detailPage.goto(base + "/admin/tournaments/s7")).status() !== 200)
          throw new Error("Synthetic edition Admin preview unavailable.");
        await detailPage.waitForLoadState("networkidle");
        if (width === 390) await detailPage.locator(".admin-menu-toggle").click();
        const selector = "#admin-menu .admin-nav-group:first-child";
        const target = detailPage.locator(selector);
        const violations = (
          await new AxeBuilder({ page: detailPage })
            .include(".sidebar")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations;
        if (violations.length) throw new Error("Admin sidebar accessibility violation.");
        const file = `admin-sidebar-${width === 390 ? "mobile-" : ""}${theme}.png`;
        await target.screenshot({ path: out + file, animations: "disabled" });
        shots.push({
          file,
          path: "/admin/tournaments/s7",
          theme,
          locale: "zh-Hant",
          width,
          height: 815,
          detail: { selector, deviceScaleFactor: 2 },
          axeViolations: 0,
        });
      }
    }
  } finally {
    await detailContext.close();
  }
  await writeFile(
    out + "verification.json",
    JSON.stringify(
      {
        date: "2026-10-27",
        uiBaseline,
        scope:
          "Actual registered S7 appearance with SSR cookie and shipped assets; public committed S7 archive and one synthetic local test account; no business commands",
        locale: "zh-Hans",
        browser: "Google Chrome",
        material:
          "Brushed silver and gunmetal plates; machined three-socket hexagonal insert with silver bevels, recessed inner walls, countersunk fasteners and a gold edge; full original S7 key visual",
        decorativeAssets: ["/themes/graphite-arena/honeycomb.svg"],
        materialChecks,
        screenshots: shots,
        cases,
        errors,
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
        screenshots: shots.length,
        materialChecks: materialChecks.length,
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
