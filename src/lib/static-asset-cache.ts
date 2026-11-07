import { readdirSync } from "node:fs";
import { join } from "node:path";

// These are repository-owned public assets, never uploads or application routes.
// Exact paths avoid accidentally caching a private route ending in .png/.js.
export function publicAssetCacheHeaders(root: string, production: boolean) {
  if (!production) return [];
  const walk = (directory: string, prefix = ""): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory())
        return walk(join(directory, entry.name), `${relative}/`);
      return entry.isFile() &&
        /\.(?:avif|webp|png|jpe?g|svg|ico|woff2?|ttf|otf)$/i.test(entry.name)
        ? [relative]
        : [];
    });
  // Group literal paths, leaving room for Next's escaping and anchors within
  // its 4,096-character compiled regex limit.
  const patterns: string[] = [];
  let pattern = "";
  for (const file of walk(root).sort()) {
    const literal = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (pattern && pattern.length + literal.length + 1 > 2_000) {
      patterns.push(pattern);
      pattern = "";
    }
    pattern = pattern ? `${pattern}|${literal}` : literal;
  }
  if (pattern) patterns.push(pattern);

  return patterns.map((alternatives) => ({
    source: `/(${alternatives})`,
    headers: [
      { key: "Cache-Control", value: "public, max-age=300, must-revalidate" },
    ],
  }));
}
