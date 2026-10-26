// Review artifacts only. No application server, environment files or database.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve, extname } from "node:path";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const root = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(root, "../../..");
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const file = resolve(repo, "." + path);
    const allowed = [root, join(repo, "public/archive")].some((dir) =>
      file.startsWith(dir.replace(/\/$/, "") + "/"),
    );
    if (!allowed) {
      response.writeHead(404).end();
      return;
    }
    const type =
      {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "text/javascript",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".webp": "image/webp",
      }[extname(file)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/docs/design/season-themes/`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const seasons = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["s9", "s8", "s7"];
if (seasons.some((season) => !["s9", "s8", "s7"].includes(season)))
  throw new Error(
    "S10 now uses actual application routes: node --import tsx docs/design/season-themes/s10/capture.mjs. This static verifier accepts s9 s8 s7 only.",
  );
const results = [];
const errors = [];
try {
  for (const season of seasons) {
    mkdirSync(join(root, season), { recursive: true });
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${season}: ${error.message}`));
    const failed = [];
    page.on("requestfailed", (request) => failed.push(request.url()));
    for (const mode of ["light", "dark"]) {
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: width < 800 ? 844 : 1050 });
        await page.goto(new URL(`${season}.html?theme=${mode}`, base).href);
        await page.locator(".artwork img").evaluate((image) => image.decode());
        await page
          .getByRole("button", {
            name: mode === "dark" ? "Light" : "Dark",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", {
            name: mode === "dark" ? "Dark" : "Light",
            exact: true,
          })
          .click();
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          mode: document.documentElement.dataset.theme,
          brokenImage: [...document.images].some(
            (image) => !image.complete || image.naturalWidth === 0,
          ),
          cookies: document.cookie,
        }));
        if (
          layout.overflow ||
          layout.brokenImage ||
          layout.mode !== mode ||
          layout.cookies
        )
          throw new Error(
            `${season}/${mode}/${width}: ${JSON.stringify(layout)}`,
          );
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        if (axe.violations.length) {
          errors.push(
            `${season}/${mode}/${width}: ${JSON.stringify(axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
          );
        }
        if (width === 1440 || width === 390) {
          const shot = await page.screenshot({ fullPage: true });
          await sharp(shot)
            .webp({ quality: 88 })
            .toFile(
              join(
                root,
                season,
                `${width === 1440 ? "desktop" : "mobile"}-${mode}.webp`,
              ),
            );
        }
        // All panels, keyboard tab navigation and form behavior at every size/mode.
        await page.getByRole("tab", { name: "Schedule", exact: true }).click();
        if (!(await page.locator("#panel-schedule").isVisible()))
          throw new Error("Schedule panel missing");
        await page.keyboard.press("ArrowRight");
        if (!(await page.locator("#panel-mappools").isVisible()))
          throw new Error("Arrow-key navigation failed");
        await page.keyboard.press("End");
        if (!(await page.locator("#panel-settings").isVisible()))
          throw new Error("End-key navigation failed");
        await page
          .getByRole("textbox", { name: "Tournament name" })
          .fill("OCLR sample");
        await page
          .getByRole("button", { name: "Preview changes", exact: true })
          .click();
        if (!(await page.locator("output").textContent()).includes("沒有儲存"))
          throw new Error("Preview did not report local-only operation");
        await page.getByRole("button", { name: "Reset", exact: true }).click();
        if (
          (await page
            .getByRole("textbox", { name: "Tournament name" })
            .inputValue()) !== `OCLR Season ${season.slice(1)}`
        )
          throw new Error("Reset failed");
        const adminAxe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        if (adminAxe.violations.length)
          errors.push(
            `${season}/${mode}/${width}/admin: ${JSON.stringify(adminAxe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
          );
        if (
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )
        )
          throw new Error("Admin overflow");
        if (width === 390 || width === 1440) {
          await page.locator("#competition").scrollIntoViewIfNeeded();
          const shot = await page.screenshot();
          await sharp(shot)
            .webp({ quality: 88 })
            .toFile(
              join(
                root,
                season,
                `admin-${width === 1440 ? "desktop" : "mobile"}-${mode}.webp`,
              ),
            );
        }
        results.push({
          season,
          mode,
          width,
          overflow: false,
          brokenImages: false,
          axes: 2,
          keyboardAndForm: "passed",
        });
      }
    }
    if (failed.length)
      errors.push(`${season}: failed requests ${JSON.stringify(failed)}`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
writeFileSync(
  join(root, "verification-static.json"),
  JSON.stringify(
    {
      date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Taipei",
      }).format(new Date()),
      browser: "Headless Google Chrome",
      scope:
        "Static design samples; not application regression or production verification",
      cases: results,
      errors,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    { cases: results.length, axeScans: results.length * 2, errors },
    null,
    2,
  ),
);
if (errors.length) process.exitCode = 1;
