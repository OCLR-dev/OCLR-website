import { describe, expect, it } from "vitest";
import {
  appearanceCookie,
  appearances,
  readAppearance,
  readTheme,
  isAppearance,
} from "../../src/lib/preferences";

describe("visitor appearance preference", () => {
  it("supports only the whitelisted original, pastel, Swiss and clay designs", () => {
    expect(appearances).toEqual([
      "default",
      "cute-pastel",
      "swiss-minimal",
      "claymorphism",
    ]);
    expect(appearanceCookie).toBe("oclr-appearance");
    expect(readAppearance("cute-pastel")).toBe("cute-pastel");
  });
  it.each([
    undefined,
    "",
    "default",
    "unknown",
    "dark",
    "<script>alert(1)</script>",
    "cute-pastel dark",
  ])(
    "falls back safely for %s without mixing design with brightness",
    (value) => {
      expect(readAppearance(value)).toBe("default");
    },
  );
  it("preserves the independent light/dark preference", () => {
    for (const appearance of appearances) {
      expect(readAppearance(appearance)).toBe(appearance);
      expect(readTheme("dark")).toBe("dark");
      expect(readTheme("light")).toBe("light");
      expect(readTheme("cute-pastel")).toBe("light");
    }
  });
  it("uses the site default only when there is no valid personal override", () => {
    expect(readAppearance(undefined, "cute-pastel")).toBe("cute-pastel");
    expect(readAppearance("unknown", "cute-pastel")).toBe("cute-pastel");
    expect(readAppearance("default", "cute-pastel")).toBe("default");
    expect(readAppearance("cute-pastel", "default")).toBe("cute-pastel");
    expect(readAppearance(undefined, "swiss-minimal")).toBe("swiss-minimal");
    expect(readAppearance("swiss-minimal", "cute-pastel")).toBe(
      "swiss-minimal",
    );
    expect(readAppearance("claymorphism", "default")).toBe("claymorphism");
    expect(readAppearance(undefined, "claymorphism")).toBe("claymorphism");
    expect(isAppearance("default")).toBe(true);
    expect(isAppearance(undefined)).toBe(false);
    expect(isAppearance("site")).toBe(false);
  });
});
