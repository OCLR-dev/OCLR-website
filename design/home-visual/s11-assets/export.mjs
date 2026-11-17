/** Export #421 artwork to the existing S11 asset URLs; no application edits. */
import { chromium } from "playwright";
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { exportCurrentHero } from "./export-current-hero.mjs";
import { execFileSync } from "node:child_process";

const root = new URL("../../../", import.meta.url);
execFileSync(
  "python3",
  [fileURLToPath(new URL("sync-logo.py", import.meta.url))],
  {
    stdio: "inherit",
  },
);
const studio = new URL("design/home-visual/layer-studio/assets/", root);
const publicDir = new URL("public/", root);
const data = async (name, type) =>
  `data:${type};base64,${(await readFile(new URL(name, studio))).toString("base64")}`;
const assets = Object.fromEntries(
  await Promise.all(
    [
      ["sky", "nebula-only.png", "image/png"],
      ["wordmark", "logo.svg", "image/svg+xml"],
    ].map(async ([key, name, type]) => [key, await data(name, type)]),
  ),
);
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chromium",
});
async function render(width, height, html, transparent = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 3,
  });
  try {
    const page = await context.newPage();
    await page.setContent(
      `<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}img{display:block;position:absolute;height:auto;max-width:none} .canvas{position:relative;width:100%;height:100%;overflow:hidden;${transparent ? "" : "background:#0c0a1b;"}}</style><div class="canvas">${html}</div>`,
    );
    await page
      .locator("img")
      .evaluateAll((images) =>
        Promise.all(images.map((image) => image.decode())),
      );
    return await page.screenshot({ omitBackground: transparent });
  } finally {
    await context.close();
  }
}
const img = (key, style) =>
  `<img alt="" src="${assets[key]}" style="${style}">`;
const sky = img(
  "sky",
  "inset:0;width:100%;height:100%;object-fit:cover;object-position:center top;filter:saturate(.78) brightness(1.8)",
);
async function webp(buffer, filename, width, height) {
  await sharp(buffer)
    .resize(width, height)
    .webp({ quality: 88, effort: 6 })
    .toFile(fileURLToPath(new URL(filename, publicDir)));
}
try {
  await exportCurrentHero(browser, {
    includeBackground: !process.argv.includes("--logo-only"),
  });
  const square = await render(
    400,
    400,
    sky +
      '<div style="position:absolute;inset:0;background:#07091f66"></div>' +
      img("wordmark", "left:7%;top:30%;width:86%"),
  );
  await webp(square, "oclr-s11-square-logo.webp", 1200, 1200);
  const wordmark = await render(
    1200,
    490,
    img("wordmark", "inset:0;width:100%;height:100%"),
    true,
  );
  for (const [name, width] of [
    ["classic-wordmark-soft", 2086],
    ["classic-wordmark", 2087],
  ])
    await sharp(wordmark)
      .trim({ threshold: 5 })
      .resize(width, 754, { fit: "contain", background: "#00000000" })
      .png({ palette: true, colours: 256, compressionLevel: 9 })
      .toFile(fileURLToPath(new URL(`oclr-s11-${name}.png`, publicDir)));
  await writeFile(
    new URL("branding/oclr-s11-logo.svg", publicDir),
    await readFile(new URL("logo.svg", studio)),
  );
  // Widen the photographic backdrop, leaving the approved centered logo and frame undistorted.
  let banner = await readFile(
    new URL("branding/oclr-s11-winter-banner.svg", publicDir),
    "utf8",
  );
  banner = banner
    .replace('viewBox="0 0 1000 500"', 'viewBox="-250 0 1500 500"')
    .replace(
      'width="1000" height="500" role=',
      'width="1500" height="500" role=',
    );
  banner = banner.replace(
    /<(rect|image)\b([^>]*?)width="1000" height="500"/g,
    '<$1 x="-250" $2width="1500" height="500"',
  );
  const bannerUri = `data:image/svg+xml;base64,${Buffer.from(banner).toString("base64")}`;
  await webp(
    await render(
      1200,
      400,
      `<img alt="" src="${bannerUri}" style="inset:0;width:100%;height:100%">`,
    ),
    "oclr-s11-banner.webp",
    3840,
    1280,
  );
} finally {
  await browser.close();
}
