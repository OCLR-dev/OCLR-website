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
  return walk(root)
    .sort()
    .map((file) => ({
      source: `/${file.replace(/[():*+?{}[\]\\]/g, "\\$&")}`,
      headers: [
        { key: "Cache-Control", value: "public, max-age=300, must-revalidate" },
      ],
    }));
}
