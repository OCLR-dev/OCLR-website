// Capture the registered Frost Waltz appearance through its SSR preference.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { assertTestDatabase } from "../../../../tests/database.ts";
import { db, closeDb } from "../../../../src/db/index.ts";
import { users } from "../../../../src/db/schema.ts";
import { createSession } from "../../../../src/lib/auth/sessions.ts";
assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const base = "http://127.0.0.1:3193";
const out = new URL(".", import.meta.url);
const css = await readFile(
  new URL("../../../../src/app/frost-theme.css", import.meta.url),
  "utf8",
);
const assets = await Promise.all(
  ["light", "dark"].map(async (theme) => ({
    theme,
    bytes: await readFile(
      new URL(
        `../../../../public/themes/frost-waltz/frost-field-${theme}.svg`,
        out,
      ),
    ),
  })),
);
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ reducedMotion: "reduce" });
const cases = [],
  errors = [];
async function ready(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator(".archive-key-visual img")
    .evaluateAll((ns) => Promise.all(ns.map((n) => n.decode())));
}
async function apply(page) {
  await context.addCookies([
    { name: "oclr-appearance", value: "frost-waltz", url: base },
  ]);
  const response = await page.reload();
  assert.equal(response.status(), 200);
  assert(
    (await response.text())
      .match(/<html[^>]+>/)?.[0]
      ?.includes('data-appearance="frost-waltz"'),
  );
  await ready(page);
  for (const theme of ["light", "dark"]) {
    const response = await page.request.get(
      `${base}/themes/frost-waltz/frost-field-${theme}.svg`,
    );
    assert.equal(response.status(), 200);
    assert(
      (await response.body()).equals(
        assets.find((a) => a.theme === theme).bytes,
      ),
    );
  }
}
async function snapshot(page) {
  return page.locator("body").evaluate((n) => {
    const c = n.cloneNode(true);
    c.querySelectorAll(
      "script,style,title,meta,link,next-route-announcer,.appearance-trigger",
    ).forEach((e) => e.remove());
    return c.textContent;
  });
}
async function guard(page) {
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    return url.startsWith(base + "/") &&
      ["GET", "HEAD"].includes(route.request().method())
      ? route.continue()
      : route.abort();
  });
}
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
      await page.setViewportSize({ width, height: width < 800 ? 844 : 1000 });
      for (const [name, path, prefix] of [
        ["overview", "/tournaments/s3", ""],
        ["schedule", "/tournaments/s3/schedule", "schedule-"],
        ["mappools", "/tournaments/s3/mappools", "mappools-"],
        ["admin", "/admin/settings", "admin-"],
      ]) {
        await context.clearCookies();
        await context.addCookies([
          ...[
            ["oclr-locale", "zh-Hant"],
            ["oclr-theme", theme],
            ["oclr-appearance", "default"],
          ].map(([name, value]) => ({ name, value, url: base })),
          ...(name === "admin"
            ? [
                {
                  name: "oclr_session",
                  value: session.token,
                  domain: "127.0.0.1",
                  path: "/",
                  httpOnly: true,
                  sameSite: "Lax",
                  secure: false,
                },
              ]
            : []),
        ]);
        assert.equal((await page.goto(base + path)).status(), 200);
        await ready(page);
        const before = await snapshot(page);
        const size = width === 1440 ? "desktop" : "mobile";
        if ([390, 1440].includes(width))
          await sharp(await page.screenshot())
            .webp({ quality: 90 })
            .toFile(
              new URL(`current-${prefix}${size}-${theme}.webp`, out).pathname,
            );
        await apply(page);
        assert.equal(await snapshot(page), before);
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${name}/${width}/${theme} overflow`,
        );
        const audit = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.deepEqual(
          audit.violations.map((v) => ({
            id: v.id,
            targets: v.nodes.map((n) => n.target),
          })),
          [],
          `${name}/${width}/${theme}`,
        );
        if (name === "overview") {
          assert.deepEqual(
            await page
              .locator(".archive-key-visual img")
              .evaluate((n) => [
                n.naturalWidth,
                n.naturalHeight,
                getComputedStyle(n).objectFit,
              ]),
            [995, 621, "contain"],
          );
          assert.equal(await page.locator(".archive-counts > div").count(), 5);
        }
        if ([390, 1440].includes(width))
          await sharp(await page.screenshot())
            .webp({ quality: 90 })
            .toFile(new URL(`${prefix}${size}-${theme}.webp`, out).pathname);
        if (name === "overview" && width < 760) {
          await page.locator(".tournament-menu").click();
          assert(await page.locator(".tournament-navigation nav").isVisible());
          const box = await page
            .locator(".tournament-navigation nav")
            .boundingBox();
          assert(box.x >= 0 && box.x + box.width <= width + 1);
          await page.keyboard.press("Escape");
        }
        cases.push({
          name,
          width,
          theme,
          axeViolations: 0,
          textUnchanged: true,
          overflow: false,
        });
      }
    }
  for (const theme of ["light", "dark"])
    for (const width of [390, 937]) {
      await context.clearCookies();
      await context.addCookies(
        [
          ["oclr-theme", theme],
          ["oclr-locale", "zh-Hant"],
        ].map(([name, value]) => ({ name, value, url: base })),
      );
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + "/tournaments/s3");
      await ready(page);
      await apply(page);
      const heading = page.locator(".historical-archive > .page-heading");
      assert(
        await heading.evaluate((n) =>
          getComputedStyle(n).backgroundImage.includes("frost-field"),
        ),
      );
      await heading.screenshot({
        path: new URL(`heading-${width}-${theme}.png`, out).pathname,
      });
      await page.emulateMedia({ forcedColors: "active" });
      assert.equal(
        await heading.evaluate((n) => getComputedStyle(n).backgroundImage),
        "none",
      );
      await page.emulateMedia({ forcedColors: "none" });
    }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("verification.json", out),
    JSON.stringify(
      {
        date: "2026-10-29",
        baseline: "5032b947",
        runtime: process.version,
        scope:
          "Registered frost-waltz SSR preference, built CSS and shipped SVG assets. No injected styles.",
        fixture:
          "Synthetic design-only placeholder, not historical S3 data; one placeholder team/captain and empty schedule/mappools.",
        buildId: (
          await readFile(new URL("../../../../.next/BUILD_ID", out), "utf8")
        ).trim(),
        cssSha256: createHash("sha256").update(css).digest("hex"),
        assets: assets.map((a) => ({
          theme: a.theme,
          sha256: createHash("sha256").update(a.bytes).digest("hex"),
        })),
        cases,
        errors,
        additionalChecks: [
          "original artwork 995x621/contain",
          "unchanged content except appearance trigger after SSR selection",
          "five existing metric rows",
          "mobile menu geometry",
          "4 heading/forced-colors cases",
          "reduced motion context",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${cases.length} actual-page checks passed`);
} finally {
  await context.close();
  await browser.close();
  await closeDb();
}
