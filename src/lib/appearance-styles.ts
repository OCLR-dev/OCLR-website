import type { Appearance } from "./preferences";
export const appearanceStyleSources = {
  "nebula-bloom": "nebula",
  "cute-pastel": "pastel",
  "swiss-minimal": "swiss",
  claymorphism: "clay",
  "manga-halftone": "manga",
  glassmorphism: "glass",
  "esports-broadcast": "esports",
  "retro-arcade": "arcade",
  "frutiger-aero": "frutiger",
  "skyline-pop": "skyline",
  "glacier-blue": "glacier",
  "sakura-circuit": "sakura",
  "graphite-arena": "graphite",
  "orbital-pulse": "orbital",
  "prism-overture": "prism",
  "azure-brush": "azure",
  "verdant-prelude": "verdant",
  "chromatic-origins": "chromatic",
  "frost-waltz": "frost",
} satisfies Record<Exclude<Appearance, "default">, string>;
export function appearanceStylesheet(appearance: Appearance) {
  return appearance === "default"
    ? null
    : `/appearance-styles/${appearance}.css`;
}
const pending = new Map<string, Promise<void>>();
function hasAppearanceRules(link: HTMLLinkElement) {
  try {
    return Boolean(link.sheet?.cssRules.length);
  } catch {
    // A failed request can leave a sheet whose rules cannot be read.
    return false;
  }
}
/** Load a new appearance before changing its selector, keeping the current paint. */
export function ensureAppearanceStylesheet(
  appearance: Appearance,
): Promise<void> {
  const href = appearanceStylesheet(appearance);
  if (!href) return Promise.resolve();
  const existing = [
    ...document.querySelectorAll<HTMLLinkElement>(
      `link[data-oclr-appearance-style="${appearance}"]`,
    ),
  ].find(hasAppearanceRules);
  if (existing) {
    existing.disabled = false;
    return Promise.resolve();
  }
  const current = pending.get(href);
  if (current) return current;
  const promise = new Promise<void>((resolve, reject) => {
    // An SSR link may already have emitted its error before hydration. Chromium
    // can retain an inaccessible sheet in that case. Retry with a client-owned
    // link so this promise observes a new load without removing React's node.
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.oclrAppearanceStyle = appearance;
    const loaded = () => {
      link.media = "all";
      pending.delete(href);
      resolve();
    };
    const failed = () => {
      link.remove();
      pending.delete(href);
      reject(new Error("Appearance stylesheet could not be loaded."));
    };
    link.addEventListener("load", loaded, { once: true });
    link.addEventListener("error", failed, { once: true });
    link.media = "not all";
    document.head.append(link);
  });
  pending.set(href, promise);
  return promise;
}
export function activateAppearanceStylesheet(appearance: Appearance) {
  for (const link of document.querySelectorAll<HTMLLinkElement>(
    "link[data-oclr-appearance-style]",
  )) {
    if (!hasAppearanceRules(link)) {
      link.disabled = true;
      continue;
    }
    // Keep successful sheets loaded for later choices. Toggling disabled can
    // discard their sheet and retry a failed SSR link when re-enabling it.
    link.media =
      link.dataset.oclrAppearanceStyle === appearance ? "all" : "not all";
    link.disabled = false;
  }
  document.documentElement.dataset.appearance = appearance;
}
