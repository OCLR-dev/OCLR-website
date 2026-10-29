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
    case "glacier-blue":
      return tr("S9 · Glacier Blue");
    case "sakura-circuit":
      return tr("S8 · Sakura Circuit");
    case "graphite-arena":
      return tr("S7 · Graphite Arena");
    case "orbital-pulse":
      return tr("S6 · Orbital Pulse");
    case "prism-overture":
      return tr("S5 · Prism Overture");
    case "azure-brush":
      return tr("S4 · Azure Brush");
    case "verdant-prelude":
      return tr("S2 · Verdant Prelude");
    case "chromatic-origins":
      return tr("S1 · Chromatic Origins");
    case "frost-waltz":
      return tr("S3 · Frost Waltz");
    default:
      return tr("Original design");
  }
}
