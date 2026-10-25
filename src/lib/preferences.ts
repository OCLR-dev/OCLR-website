export type Theme = "light" | "dark";
export const themeCookie = "oclr-theme";
export function readTheme(value: string | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}
export const appearances = [
  "default",
  "cute-pastel",
  "swiss-minimal",
  "claymorphism",
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
