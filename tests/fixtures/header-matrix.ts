import { appearances, type Appearance } from "../../src/lib/preferences";
import { locales, type Locale } from "../../src/i18n/config";

export type HeaderCase = {
  locale: Locale;
  theme: "light" | "dark";
  appearance: Appearance;
};
export function headerMatrix(
  mode = "full",
  selected = "",
  firefox = false,
): HeaderCase[] {
  if (!["smoke", "full"].includes(mode))
    throw new Error("Unknown header matrix mode");
  const filter = selected ? selected.split(",") : [];
  if (
    filter.some(
      (name) => !appearances.some((appearance) => appearance === name),
    )
  )
    throw new Error("Unknown header appearance");
  if (mode === "smoke" && filter.length)
    throw new Error("Selection requires full mode");
  const cases: HeaderCase[] = [];
  for (const locale of locales)
    for (const theme of ["light", "dark"] as const)
      for (const appearance of appearances) {
        const exhaustive =
          mode === "full" && (!filter.length || filter.includes(appearance));
        if (
          !exhaustive &&
          appearance !== "default" &&
          (firefox || locale !== "en")
        )
          continue;
        cases.push({ locale, theme, appearance });
      }
  if (!cases.length) throw new Error("Empty header matrix");
  return cases;
}
export function headerWidths(mode = "full") {
  if (!["smoke", "full"].includes(mode))
    throw new Error("Unknown header matrix mode");
  return mode === "full"
    ? [
        320, 360, 375, 390, 412, 430, 674, 760, 819, 950, 951, 1024, 1100, 1101,
        1440,
      ]
    : [320, 390, 760, 950, 951, 1100, 1101, 1440];
}
export function compactHeaderWidths(mode = "full") {
  headerWidths(mode);
  return mode === "full" ? [320, 360, 375, 390, 412, 430] : [320, 390, 430];
}
