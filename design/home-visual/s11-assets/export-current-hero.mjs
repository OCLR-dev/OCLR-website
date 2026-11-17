/** Render the approved homepage layers to the existing tournament artwork URLs. */
import { chromium } from "playwright";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const publicDir = new URL("../../../public/", import.meta.url);
async function asset(path, mime) {
  return `data:${mime};base64,${(await readFile(new URL(path, publicDir))).toString("base64")}`;
}

export async function exportCurrentHero(
  browser,
  { includeBackground = true } = {},
) {
  const [sky, person, mist, logo, season, katu] = await Promise.all([
    asset("branding/home-hero/nebula-v2-2560.webp", "image/webp"),
    asset("branding/home-hero/liru-cn-v3-1111.webp", "image/webp"),
    asset("branding/home-hero/ink-mist.webp", "image/webp"),
    asset("branding/home-s11/oclr-layer.svg", "image/svg+xml"),
    asset("branding/home-s11/season-layer.svg", "image/svg+xml"),
    asset("branding/home-s11/katu-cropped.svg", "image/svg+xml"),
  ]);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 3,
  });
  try {
    const page = await context.newPage();
    await page.setContent(`<!doctype html><style>
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0c0a1b}
      img{display:block;position:absolute;max-width:none}
      .sky{inset:0;width:100%;height:100%;object-fit:cover;object-position:70% 32%}
      .shade{position:absolute;inset:0;background:linear-gradient(90deg,#100d20e6 0%,#100d20b3 38%,#100d2033 64%,transparent 82%)}
      .mist{right:-4%;bottom:4%;width:62%;height:auto;opacity:.12}
      .person{right:7%;top:5%;height:138%;width:auto}
      .logo{position:absolute;left:6%;top:25%;width:48%;aspect-ratio:1180/430}
      .layer{top:-13.953%;left:0;width:101.695%;height:auto;aspect-ratio:1200/490;filter:drop-shadow(1px -1px 0 #ffffff59) drop-shadow(0 0 8px #9b6cff55)}
      .season{position:absolute;mask:url('${season}') 0 0/100% 100% no-repeat;background:linear-gradient(135deg,#f4eeff,#e6dbff 35%,#b89cff) 97.4% 74%/14.5% 18.4% no-repeat}
      .katu{top:2.326%;left:78.81%;width:8.475%;height:auto}
    </style><img class="sky" src="${sky}" alt=""><div class="shade"></div>
    <img class="mist" src="${mist}" alt=""><img class="person" src="${person}" alt="">
    <div class="logo"><img class="layer" src="${logo}" alt=""><div class="layer season"></div><img class="katu" src="${katu}" alt=""></div>`);
    await page
      .locator("img")
      .evaluateAll((images) =>
        Promise.all(images.map((image) => image.decode())),
      );
    // Decode the same S11 mask as an image before capturing the CSS layer.
    await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
    }, season);
    const visual = await page.screenshot();
    async function webp(buffer, filename, width, height) {
      const output = fileURLToPath(new URL(filename, publicDir));
      await sharp(buffer)
        .resize(width, height)
        .webp({ quality: 88, effort: 6 })
        .toFile(output);
      const metadata = await sharp(output).metadata();
      if (metadata.width !== width || metadata.height !== height)
        throw new Error(`Unexpected dimensions: ${filename}`);
      process.stdout.write(`${filename}: ${width}×${height}\n`);
    }
    await webp(visual, "oclr-s11-key-visual.webp", 1920, 1080);
    for (const width of [640, 960, 1280, 1920, 2560, 3840]) {
      await webp(
        visual,
        `oclr-s11-key-visual-enhanced-${width}.webp`,
        width,
        (width * 9) / 16,
      );
    }
    if (includeBackground) {
      await page.locator(".logo").evaluate((element) => {
        element.remove();
      });
      await page.setViewportSize({ width: 1280, height: 600 });
      await webp(
        await page.screenshot(),
        "oclr-s11-website-background.webp",
        3840,
        1800,
      );
    }
  } finally {
    await context.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chromium",
  });
  try {
    await exportCurrentHero(browser);
  } finally {
    await browser.close();
  }
}
