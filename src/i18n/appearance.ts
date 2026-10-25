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
    default:
      return tr("Original design");
  }
}
