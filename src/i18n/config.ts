export const locales = ["zh-Hans", "zh-Hant", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "zh-Hans";
export const localeCookie = "oclr-locale";
function matchLanguage(language: string): Locale | undefined {
  try {
    const locale = new Intl.Locale(language);
    if (locale.language === "en") return "en";
    if (locale.language !== "zh") return;
    // An explicit script takes precedence over the region (e.g. zh-Hans-TW).
    if (locale.script)
      return locale.script === "Hant"
        ? "zh-Hant"
        : locale.script === "Hans"
          ? "zh-Hans"
          : undefined;
    return ["TW", "HK", "MO"].includes(locale.region ?? "")
      ? "zh-Hant"
      : "zh-Hans";
  } catch {
    return;
  }
}

export function readLocale(
  value: string | undefined,
  acceptLanguage?: string | null,
): Locale {
  if (locales.includes(value as Locale)) return value as Locale;

  const preferences = (acceptLanguage ?? "")
    .split(",")
    .flatMap((entry) => {
      // Ignore malformed ranges/weights and q=0; equal weights keep wire order.
      const match = entry
        .trim()
        .match(
          /^([a-z]{1,8}(?:-[a-z0-9]{1,8})*)(?:\s*;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?$/i,
        );
      if (!match) return [];
      const quality = match[2] === undefined ? 1 : Number(match[2]);
      return quality > 0 ? [{ language: match[1], quality }] : [];
    })
    .sort((a, b) => b.quality - a.quality);
  for (const { language } of preferences) {
    const locale = matchLanguage(language);
    if (locale) return locale;
  }
  return defaultLocale;
}
