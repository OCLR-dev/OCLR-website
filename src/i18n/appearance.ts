import type { Appearance } from "@/lib/preferences";

/** Keep all appearance names registered as literal translation messages. */
export function appearanceLabel(
  value: Appearance,
  tr: (message: string) => string,
) {
  switch (value) {
    case "cute-pastel":
      return tr("Cute pastel");
    case "swiss-minimal":
      return tr("Swiss minimal");
    case "claymorphism":
      return tr("Claymorphism");
    case "manga-halftone":
      return tr("Manga halftone");
    case "glassmorphism":
      return tr("Glassmorphism");
    case "esports-broadcast":
      return tr("Esports broadcast");
    case "retro-arcade":
      return tr("Retro arcade");
    case "frutiger-aero":
      return tr("Frutiger Aero");
    case "skyline-pop":
      return tr("S10 · Skyline Pop");
    default:
      return tr("Original design");
  }
}
