import { readFileSync } from "node:fs";

// Read the shipped styles instead of duplicating their asset filenames in tests.
export const bundledSeasonThemes = [
  { appearance: "skyline-pop", stylesheet: "skyline-theme.css" },
  { appearance: "glacier-blue", stylesheet: "glacier-theme.css" },
  { appearance: "sakura-circuit", stylesheet: "sakura-theme.css" },
  { appearance: "graphite-arena", stylesheet: "graphite-theme.css" },
  { appearance: "orbital-pulse", stylesheet: "orbital-theme.css" },
  { appearance: "prism-overture", stylesheet: "prism-theme.css" },
  { appearance: "azure-brush", stylesheet: "azure-theme.css" },
].map(({ appearance, stylesheet }) => ({
  appearance,
  assets: [
    ...new Set(
      Array.from(
        readFileSync(
          new URL(`../../src/app/${stylesheet}`, import.meta.url),
          "utf8",
        ).matchAll(/url\(\s*["']?(\/themes\/[^\s"')]+)["']?\s*\)/g),
        (match) => match[1],
      ),
    ),
  ],
}));
