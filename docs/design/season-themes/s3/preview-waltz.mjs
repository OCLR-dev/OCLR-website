// Render the actual PageHeading function in isolation; no database or credentials.
import ts from "typescript";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
const source = await readFile(
  new URL("../../../../src/components/ui.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "ui.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const heading = ast.statements.find(
  (n) => ts.isFunctionDeclaration(n) && n.name?.text === "PageHeading",
);
assert(heading, "PageHeading component not found");
const compiled = ts.transpileModule(heading.getText(ast), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
const component = {};
new Function("exports", "require", compiled)(
  component,
  createRequire(import.meta.url),
);
const markup = renderToStaticMarkup(
  createElement(
    component.PageHeading,
    { eyebrow: "OCLR · SEASON 3", title: "雪花圓舞曲" },
    "Frost Waltz · Banner 設計預覽",
  ),
);
const lightAsset = (
  await readFile(new URL("frost-field-light.svg", import.meta.url))
).toString("base64");
const darkAsset = (
  await readFile(new URL("frost-field-dark.svg", import.meta.url))
).toString("base64");
const html = `<!doctype html><html lang="zh-Hant" data-s3-preview data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S3 · 雪花圓舞曲 Banner</title><link rel="stylesheet" href="../../../../src/app/globals.css"><link rel="stylesheet" href="../../../../src/app/public-tournament.css"><link rel="stylesheet" href="../s3.css"><style>
:root {--font-sans:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{background:#101e2a}.themed-site{min-height:100vh;color:var(--site-foreground);padding:32px}main{max-width:1400px;margin:auto}.review-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:0 auto 24px;max-width:1400px}.review-controls p{margin:0;color:var(--site-muted);font-size:14px}.review-controls button{min-height:44px;padding:8px 16px;border:1px solid var(--site-control-border);border-radius:8px;background:var(--site-surface);color:var(--site-foreground);font:inherit}.review-controls button:focus-visible{outline:3px solid var(--site-focus);outline-offset:3px}html[data-s3-preview] .themed-site{--frost-snow-field:url('data:image/svg+xml;base64,${lightAsset}')}html[data-s3-preview][data-theme="dark"] .themed-site{--frost-snow-field:url('data:image/svg+xml;base64,${darkAsset}')}@media(max-width:760px){.themed-site{padding:16px}}
</style></head><body><div class="themed-site"><div class="review-controls"><button type="button" aria-pressed="true" id="mode">深色模式</button><p>獨立 Banner 元件預覽 · 以三拍聚散、轉身與光帶描繪雪花圓舞曲</p></div><main class="historical-archive">${markup}</main></div><script>document.getElementById('mode').onclick=function(){const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';this.setAttribute('aria-pressed',String(dark));this.textContent=dark?'深色模式':'明亮模式';};</script></body></html>`;
await writeFile(new URL("waltz-banner.html", import.meta.url), html);
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  reducedMotion: "reduce",
  deviceScaleFactor: 2,
});
const cases = [];
try {
  const page = await context.newPage();
  await page.goto(new URL("waltz-banner.html", import.meta.url).href);
  for (const width of [320, 390, 768, 937, 1440])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 700 });
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        const b = document.getElementById("mode");
        b.textContent = t === "dark" ? "深色模式" : "明亮模式";
        b.setAttribute("aria-pressed", String(t === "dark"));
      }, theme);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(async () => {
        const value = getComputedStyle(
          document.querySelector(".page-heading"),
        ).backgroundImage;
        const data = value.match(
          /url\(["']?(data:image\/svg\+xml[^"')]+)["']?\)/,
        )?.[1];
        if (!data) throw new Error("Missing SVG background");
        const img = new Image();
        img.src = data;
        await img.decode();
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
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
      );
      const banner = page.locator(".page-heading");
      assert(
        await banner.evaluate((n) =>
          [...n.querySelectorAll("h1,p")].every(
            (e) => e.scrollWidth <= e.clientWidth,
          ),
        ),
      );
      assert(
        await banner.evaluate((n) =>
          getComputedStyle(n).backgroundImage.includes("data:image/svg+xml"),
        ),
      );
      await banner.screenshot({
        path: new URL(`waltz-heading-${width}-${theme}.png`, import.meta.url)
          .pathname,
      });
      await page.emulateMedia({ forcedColors: "active" });
      assert.equal(
        await banner.evaluate((n) => getComputedStyle(n).backgroundImage),
        "none",
      );
      await page.emulateMedia({ forcedColors: "none" });
      cases.push({
        width,
        theme,
        axeViolations: 0,
        overflow: false,
        forcedColors: true,
      });
    }
  await page.locator("#mode").focus();
  assert(
    await page.locator("#mode").evaluate((n) => n.matches(":focus-visible")),
  );
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await writeFile(
    new URL("waltz-verification.json", import.meta.url),
    JSON.stringify(
      {
        scope:
          "Isolated actual PageHeading component with existing source styles; not full app screenshots. Full-app recapture blocked by local PostgreSQL shared-memory limit.",
        runtime: process.version,
        componentSha256: createHash("sha256")
          .update(heading.getText(ast))
          .digest("hex"),
        assets: await Promise.all(
          ["light", "dark"].map(async (theme) => ({
            theme,
            sha256: createHash("sha256")
              .update(
                await readFile(
                  new URL(`frost-field-${theme}.svg`, import.meta.url),
                ),
              )
              .digest("hex"),
          })),
        ),
        cases,
        keyboard: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("10 banner cases / Axe / forced colors / keyboard passed");
} finally {
  await context.close();
  await browser.close();
}
