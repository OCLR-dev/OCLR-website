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
export const appearances = [
  "default",
  "cute-pastel",
  "swiss-minimal",
  "claymorphism",
  "manga-halftone",
  "glassmorphism",
  "esports-broadcast",
  "retro-arcade",
  "frutiger-aero",
  "skyline-pop",
  "glacier-blue",
  "sakura-circuit",
  "graphite-arena",
  "orbital-pulse",
] as const;
export type Appearance = (typeof appearances)[number];
export const appearanceCookie = "oclr-appearance";
export function isAppearance(value: unknown): value is Appearance {
  return appearances.some((appearance) => appearance === value);
}
export function readAppearance(
  value: string | undefined,
  siteDefault: Appearance = "default",
): Appearance {
  return isAppearance(value) ? value : siteDefault;
}
