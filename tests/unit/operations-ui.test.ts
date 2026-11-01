import { describe, it, expect } from "vitest";
import { draftOverlayUrl } from "../../src/lib/overlay-url";
import { countryFlagData } from "../../src/lib/country-flag";
import {
  inheritedAppearance,
  type AppearanceScope,
} from "../../src/lib/appearance-scope";
import { readAppearance } from "../../src/lib/preferences";
const scopes: AppearanceScope[] = [
  {
    slug: "public-cup",
    published: true,
    staff: false,
    defaultAppearance: "cute-pastel",
  },
  {
    slug: "private-cup",
    published: false,
    staff: true,
    defaultAppearance: "cute-pastel",
  },
  {
    slug: "inherited-cup",
    published: true,
    staff: true,
    defaultAppearance: null,
  },
];
describe("scoped tournament appearance", () => {
  const inherited = (
    path: string,
    search = "",
    site: "default" | "cute-pastel" = "default",
  ) => inheritedAppearance(path, new URLSearchParams(search), scopes, site);
  it("inherits the current edition only, never the last visited one", () => {
    expect(inherited("/tournaments/public-cup/mappools")).toEqual({
      appearance: "cute-pastel",
      edition: true,
    });
    expect(inherited("/privacy")).toEqual({
      appearance: "default",
      edition: false,
    });
    expect(inherited("/players/42", "edition=public-cup").appearance).toBe(
      "cute-pastel",
    );
    expect(
      inherited("/tournaments/inherited-cup", "", "cute-pastel").appearance,
    ).toBe("cute-pastel");
  });
  it("does not apply private editions on public routes or unauthorized Admin routes", () => {
    expect(inherited("/tournaments/private-cup").edition).toBe(false);
    expect(
      inherited("/admin/tournaments/private-cup/settings").appearance,
    ).toBe("cute-pastel");
    expect(inherited("/admin/tournaments/public-cup/settings").edition).toBe(
      false,
    );
    expect(inherited("/tournaments/public-cup-other").edition).toBe(false);
  });
  it("keeps explicit visitor choice first, and broadcasts isolated", () => {
    expect(
      readAppearance(
        "default",
        inherited("/tournaments/public-cup").appearance,
      ),
    ).toBe("default");
    expect(inherited("/tournaments/public-cup/draft/overlay").edition).toBe(
      false,
    );
    expect(
      inherited("/tournaments/public-cup/draft", "presenter=1").edition,
    ).toBe(false);
  });
});
describe("OBS overlay source", () => {
  it("uses the existing edition route with no credential or query material", () => {
    expect(
      draftOverlayUrl("https://example.org/base?token=private#hash", "s11"),
    ).toBe("https://example.org/tournaments/s11/draft/overlay");
    expect(draftOverlayUrl("http://localhost:3000", "future-cup")).toBe(
      "http://localhost:3000/tournaments/future-cup/draft/overlay",
    );
  });
  it.each([
    ["javascript:alert(1)", "s11"],
    ["https://user:secret@example.org", "s11"],
    ["https://example.org", "../admin"],
    ["https://example.org", "s11?token=secret"],
  ])("rejects unsafe source %s / %s", (origin, slug) =>
    expect(() => draftOverlayUrl(origin, slug)).toThrow(),
  );
});
describe("cached country flags", () => {
  it("provides localized accessible names", () => {
    expect(countryFlagData("TW", "en")).toMatchObject({
      code: "TW",
      name: "Taiwan",
      src: "/flags/twemoji/1f1f9-1f1fc.svg",
    });
    expect(countryFlagData("JP", "zh-Hant")?.name).toBe("日本");
  });
  it.each([null, undefined, "", "ZZ", "XX", "<script>"])(
    "omits invalid or missing country %s",
    (code) => expect(countryFlagData(code, "en")).toBeNull(),
  );
});
