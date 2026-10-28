/** Export #421 artwork to the existing S11 asset URLs; no application edits. */
import { chromium } from "playwright";
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const studio = new URL("design/home-visual/layer-studio/assets/", root);
const publicDir = new URL("public/", root);
const data = async (name, type) =>
  `data:${type};base64,${(await readFile(new URL(name, studio))).toString("base64")}`;
const assets = Object.fromEntries(
  await Promise.all(
    [
      ["sky", "nebula-only.png", "image/png"],
      ["ground", "foreground.png", "image/png"],
      ["person", "liru-refined-v2.png", "image/png"],
      ["logo", "oclr-layer.svg", "image/svg+xml"],
      ["season", "season-layer.svg", "image/svg+xml"],
      ["katu", "katu-cropped.svg", "image/svg+xml"],
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
const scene =
  sky +
  img("ground", "left:-29.1%;top:89.2%;width:94.4%") +
  '<div style="position:absolute;inset:0;background:linear-gradient(90deg,#0c0a1b 0%,#0c0a1b99 43%,transparent 100%)"></div>' +
  img(
    "person",
    "left:63%;top:28%;width:53.97609%;transform:perspective(1200px) rotateY(12deg)",
  );
const lettering =
  img("logo", "left:4.3788%;top:14.4727%;width:46.4545%") +
  img("season", "left:-32.0428%;top:-7.97239%;width:90.5268%") +
  img("katu", "left:41.4881%;top:22.0044%;width:4.68417%");
async function webp(buffer, filename, width, height) {
  await sharp(buffer)
    .resize(width, height)
    .webp({ quality: 88, effort: 6 })
    .toFile(fileURLToPath(new URL(filename, publicDir)));
}
try {
  const visual = await render(1280, 720, scene + lettering);
  await webp(visual, "oclr-s11-key-visual.webp", 1920, 1080);
  for (const width of [640, 960, 1280, 1920, 2560, 3840])
    await webp(
      visual,
      `oclr-s11-key-visual-enhanced-${width}.webp`,
      width,
      (width * 9) / 16,
    );
  await webp(
    await render(1280, 600, scene),
    "oclr-s11-website-background.webp",
    3840,
    1800,
  );
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
