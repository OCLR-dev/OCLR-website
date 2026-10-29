export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";
export const themeCookie = "oclr-theme";
// Last observed system brightness: a rendering hint, never a manual choice.
export const systemThemeCookie = "oclr-system-theme";
export const systemThemeQuery = "(prefers-color-scheme: dark)";
export function readTheme(value: string | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}
export function readThemePreference(
  value: string | undefined,
): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolveTheme(
  preference: ThemePreference,
  systemTheme: string | undefined,
): Theme {
  return preference === "system" ? readTheme(systemTheme) : preference;
}
// Runs in <head> before first paint, so following the system never flashes
// the server's guess. Without matchMedia the server-rendered value remains.
export const themeScript = `(function(){try{var c=document.cookie,p=/(?:^|;\\s*)${themeCookie}=(light|dark)(?:;|$)/.exec(c),h=/(?:^|;\\s*)${systemThemeCookie}=(light|dark)(?:;|$)/.exec(c),s=matchMedia("${systemThemeQuery}").matches?"dark":"light";if(!h||h[1]!==s)document.cookie="${systemThemeCookie}="+s+"; Path=/; Max-Age=31536000; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"");document.documentElement.dataset.theme=p?p[1]:s}catch(e){}})()`;
// Only these cross-season designs may be selected by visitors or site Admins.
export const publicAppearances = [
  "default",
  "cute-pastel",
  "swiss-minimal",
  "claymorphism",
  "manga-halftone",
  "glassmorphism",
  "esports-broadcast",
  "retro-arcade",
  "frutiger-aero",
] as const;
// New designs must explicitly opt into publicAppearances to be publicly selectable.
export const seasonAppearances = [
  "skyline-pop",
  "glacier-blue",
  "sakura-circuit",
  "graphite-arena",
  "orbital-pulse",
  "prism-overture",
  "azure-brush",
  "frost-waltz",
  "verdant-prelude",
  "chromatic-origins",
] as const;
export const appearances = [
  ...publicAppearances,
  ...seasonAppearances,
] as const;
export type Appearance = (typeof appearances)[number];
export type PublicAppearance = (typeof publicAppearances)[number];
export const appearanceCookie = "oclr-appearance";
export function isAppearance(value: unknown): value is Appearance {
  return appearances.some((appearance) => appearance === value);
}
/** Decode saved edition configuration, not visitor cookies or site defaults. */
export function readAppearance(
  value: string | undefined,
  siteDefault: Appearance = "default",
): Appearance {
  return isAppearance(value) ? value : siteDefault;
}

/** Visitor cookies and whole-site defaults cannot select season designs. */
export function isPublicAppearance(value: unknown): value is PublicAppearance {
  return publicAppearances.some((appearance) => appearance === value);
}
export function readVisitorAppearance(
  value: string | undefined,
  inherited: Appearance = "default",
): Appearance {
  return isPublicAppearance(value) ? value : inherited;
}
export function readSiteAppearance(
  value: string | undefined,
): PublicAppearance {
  return isPublicAppearance(value) ? value : "default";
}
