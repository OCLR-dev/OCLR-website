import { describe, expect, it } from "vitest";
import { relativeLuminance } from "../../src/lib/color-contrast";
import { starColor, starInk } from "../../src/lib/beatmap-star-color";
import { getModInfo, modColors, slotModInfo } from "../../src/lib/mod-colors";
function contrast(a: string, b: string) {
  const values = [relativeLuminance(a), relativeLuminance(b)].sort(
    (a, b) => b - a,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}
describe("map card badge contrast", () => {
  it("keeps every star bucket and invalid rating readable", () => {
    for (const stars of [
      null,
      undefined,
      NaN,
      Infinity,
      -1,
      ...Array.from({ length: 101 }, (_, i) => i / 10),
    ])
      expect(contrast(starColor(stars), starInk(stars))).toBeGreaterThanOrEqual(
        4.5,
      );
  });
  it("preserves mod backgrounds with readable labels including fallback slots", () => {
    for (const [key, palette] of Object.entries(modColors)) {
      const mod = getModInfo(key);
      expect(mod.bg).toBe(palette.bg);
      expect(contrast(mod.bg, mod.color)).toBeGreaterThanOrEqual(4.5);
    }
    expect(slotModInfo("HD10")).toEqual(getModInfo("HD"));
    for (const key of [undefined, "unknown"]) {
      const mod = getModInfo(key);
      expect(contrast(mod.bg, mod.color)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
