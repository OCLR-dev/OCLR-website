// Review evidence from actual application routes; no alternate page renderer.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertTestDatabase } from "../../../../tests/database.ts";
import { db, closeDb } from "../../../../src/db/index.ts";
import { users } from "../../../../src/db/schema.ts";
import { createSession } from "../../../../src/lib/auth/sessions.ts";
assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const base = process.env.S10_PREVIEW_ORIGIN ?? "http://127.0.0.1:3195";
const origin = new URL(base);
if (!["127.0.0.1", "localhost"].includes(origin.hostname))
  throw new Error("Use the isolated loopback preview application.");
const out = fileURLToPath(new URL(".", import.meta.url));
const uiBaseline =
  process.env.S10_UI_BASELINE ?? "0d3e203d22c33fb61e988f80f2a7ab561c1a8563";
execFileSync("git", ["rev-parse", "origin/main"], {
  encoding: "utf8",
}).trim();
execFileSync("git", [
  "diff",
  "--exit-code",
  uiBaseline,
  "--",
  "src",
  "messages",
  "public/branding",
]);
let overlay = await readFile(new URL("../s10.css", import.meta.url), "utf8");
// Embed the reviewed local illustration; no application route or external request.
const panorama = await readFile(new URL("city-pop-coast.webp", import.meta.url));
overlay = overlay.replaceAll(
  'url("./s10/city-pop-coast.webp")',
  `url("data:image/webp;base64,${panorama.toString("base64")}")`,
);
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
      path: "/tournaments/s10",
      prefix: "",
      selector: ".archive-overview-summary",
    },
    {
      name: "mappools",
      path: "/tournaments/s10/mappools",
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
        await page.evaluate(() => document.fonts.ready);
        await page
          .locator(".archive-key-visual img")
          .evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
        // Save before/after from the exact same DOM; the overlay never inserts UI.
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
        await page.addStyleTag({ content: overlay });
        await page.evaluate(() =>
          document.documentElement.setAttribute("data-s10-preview", ""),
        );
        const after = await page.locator("body").evaluate((node) => ({
          elements: node.querySelectorAll("*").length,
          text: node.innerText,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }));
        if (before.text !== after.text || before.elements !== after.elements)
          throw new Error(
            "Overlay altered the rendered UI content or component tree.",
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
          if (!(await page.locator("#rules .rules-article").isVisible()))
            throw new Error("Latest historical handbook missing.");
          const original = await page.locator(".archive-key-visual img").evaluate(image => ({
            src: image.getAttribute("src"), width: image.naturalWidth,
            height: image.naturalHeight, fit: getComputedStyle(image).objectFit,
          }));
          if (original.src !== "/archive/s10/thumbnail.png" || original.width !== 1024 || original.height !== 1024 || original.fit !== "contain")
            throw new Error("Preserve the complete original 1024x1024 S10 artwork.");
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
              has: page.locator('a[href="/tournaments/s10/staff"]'),
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
              .locator(".rules-article h2")
              .first()
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
        });
      }
    }
  }
  // City illustration must disappear cleanly in system high-contrast mode.
  for (const theme of ["light", "dark"]) {
    for (const width of [320, 1440]) {
      await context.clearCookies();
      await context.addCookies([
        { name: "oclr-locale", value: "zh-Hans", url: base },
        { name: "oclr-theme", value: theme, url: base },
      ]);
      await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 });
      await page.goto(base + "/tournaments/s10");
      await page.locator(".archive-key-visual img").waitFor();
      await page.addStyleTag({ content: overlay });
      await page.evaluate(() =>
        document.documentElement.setAttribute("data-s10-preview", ""),
      );
      await page.emulateMedia({ forcedColors: "active" });
      if (width === 320) await page.locator(".tournament-menu").click();
      const state = await page.evaluate(() => {
        const nav = document.querySelector(".tournament-navigation nav");
        const box = nav.getBoundingClientRect();
        return {
          image: getComputedStyle(document.querySelector(".page-heading"), "::before").display,
          heading: getComputedStyle(
            document.querySelector(".page-heading"),
            "::after",
          ).display,
          navigation: getComputedStyle(nav).backgroundImage,
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
        state.heading !== "none" ||
        state.navigation !== "none" ||
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
        selectionVisible: true,
        menuInViewport: true,
      });
      await page.emulateMedia({ forcedColors: "none" });
    }
  }
  await writeFile(
    out + "verification.json",
    JSON.stringify(
      {
        date: "2026-10-26",
        uiBaseline,
        scope:
          "Actual current application routes with browser-only S10 CSS overlay; public committed S10 archive and one synthetic local test account; no business commands",
        locale: "zh-Hans",
        browser: "Google Chrome",
        design: "Vivid hand-drawn city-pop panorama in the original S10 sky-blue, cyan, peach-pink and cream palette",
        decorativeAssets: ["city-pop-coast.webp"],
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
