/** Vendor only the unchanged SVG subset used by osu!; never downloads at runtime.
 * See docs/country-flags.md for package integrity and license provenance. */
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";

const [packagePath, graphicsLicense] = process.argv.slice(2);
if (!packagePath || !graphicsLicense)
  throw new Error(
    "Usage: node --import tsx scripts/vendor-country-flags.ts EXTRACTED_PACKAGE LICENSE_GRAPHICS",
  );
const source = resolve(packagePath);
const pkg = JSON.parse(await readFile(resolve(source, "package.json"), "utf8"));
if (pkg.name !== "@discordapp/twemoji" || pkg.version !== "16.0.1")
  throw new Error("Expected the reviewed @discordapp/twemoji@16.0.1 package.");
const destination = resolve("public/flags/twemoji");
const entries = [];
for (const file of (await readdir(resolve(source, "dist/svg"))).sort()) {
  if (!/^1f1[e-f][0-9a-f]-1f1[e-f][0-9a-f]\.svg$/.test(file)) continue;
  const code = file
    .slice(0, -4)
    .split("-")
    .map((part) => String.fromCharCode(parseInt(part, 16) - 127397))
    .join("");
  if (!/^[A-Z]{2}$/.test(code)) throw new Error(`Invalid flag: ${file}`);
  const bytes = await readFile(resolve(source, "dist/svg", file));
  if (
    !bytes.includes('viewBox="0 0 36 36"') ||
    /<(script|foreignObject)|(?:href|onload)\s*=/i.test(bytes.toString())
  )
    throw new Error(`Review unexpected SVG content/dimensions: ${file}`);
  entries.push([
    code,
    {
      file,
      width: 36,
      height: 36,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  ] as const);
}
if (entries.length !== 259)
  throw new Error("Expected the reviewed 259 regional flag SVGs.");
await mkdir(destination, { recursive: true });
for (const [, { file }] of entries)
  await copyFile(resolve(source, "dist/svg", file), resolve(destination, file));
await copyFile(
  resolve(source, "LICENSE"),
  resolve(destination, "LICENSE-MIT.txt"),
);
await writeFile(
  resolve(destination, "LICENSE-GRAPHICS.txt"),
  (await readFile(resolve(graphicsLicense), "utf8")).replace(/[ \t]+$/gm, ""),
);
entries.sort(([a], [b]) => a.localeCompare(b, "en"));
await writeFile(
  resolve(destination, "manifest.json"),
  JSON.stringify(Object.fromEntries(entries), null, 2) + "\n",
);
await writeFile(
  resolve("src/lib/country-flag-assets.json"),
  JSON.stringify(
    Object.fromEntries(
      entries.map(([code, { file, width, height }]) => [
        code,
        { file, width, height },
      ]),
    ),
    null,
    2,
  ) + "\n",
);
console.log(`Vendored ${entries.length} unchanged country flag SVGs.`);
