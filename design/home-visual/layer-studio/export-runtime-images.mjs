/** Runtime derivatives only; studio originals are never overwritten. Run from any cwd. */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const assets = new URL("./assets/", import.meta.url);
const output = new URL("../../../public/branding/home-s11/", import.meta.url);
if (process.argv.includes("--banner-photo")) {
  // Match the SVG's xMidYMin slice: the upper 6000 × 3000 pixels, at 2x density.
  const photo = await sharp(
    fileURLToPath(new URL("nasa-orion-6000.jpg", assets)),
  )
    .extract({ left: 0, top: 0, width: 6000, height: 3000 })
    .resize(2000, 1000)
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  process.stdout.write(photo);
} else {
  await mkdir(output, { recursive: true });
  for (const [name, widths] of [
    ["nebula-only", [480, 960, 1600, 2048]],
    ["foreground", [480, 960, 1600, 1774]],
    ["liru-refined-v2", [320, 640, 1024]],
  ]) {
    for (const width of widths) {
      const suffix = width === widths.at(-1) ? "" : `-${width}`;
      await sharp(fileURLToPath(new URL(`${name}.png`, assets)))
        .resize({ width, withoutEnlargement: true })
        .png({ palette: true, colours: 256, dither: 0.5, compressionLevel: 9 })
        .toFile(fileURLToPath(new URL(`${name}${suffix}.png`, output)));
    }
  }
}
