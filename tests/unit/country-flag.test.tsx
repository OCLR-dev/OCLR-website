import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { countryFlagData } from "../../src/lib/country-flag";
import assets from "../../src/lib/country-flag-assets.json";
import manifest from "../../public/flags/twemoji/manifest.json";
import { CountryFlag } from "../../src/components/country-flag";
import { english } from "../../src/i18n/translate";

vi.mock("../../src/i18n/shared", () => ({ useAppTranslations: () => english }));
vi.stubGlobal("React", React);

describe("local country flag resolution", () => {
  it.each(["CN", "cn", " Cn "])("normalizes %s to one pinned asset", (code) => {
    expect(countryFlagData(code, "en")).toEqual({
      code: "CN",
      name: "China",
      src: "/flags/twemoji/1f1e8-1f1f3.svg",
      width: 36,
      height: 36,
    });
  });
  it.each([
    null,
    undefined,
    "",
    " ",
    "ZZ",
    "XX",
    "UK",
    "USA",
    "C1",
    "../CN",
    "CN.svg",
    "https://example.test/CN",
    "ſs",
  ])("omits missing, unsupported or unsafe input %s", (code) => {
    expect(countryFlagData(code, "en")).toBeNull();
    expect(renderToStaticMarkup(<CountryFlag code={code} />)).toBe("");
  });
  it.each(["EU", "UN", "XK", "AC", "EA", "IC", "TA"])(
    "supports the upstream special region %s",
    (code) => {
      expect(countryFlagData(code, "en")?.code).toBe(code);
    },
  );
  it("localizes names and tolerates an invalid locale", () => {
    expect(countryFlagData("JP", "zh-Hans")?.name).toBe("日本");
    expect(countryFlagData("JP", "zh-Hant")?.name).toBe("日本");
    expect(countryFlagData("JP", "en")?.name).toBe("Japan");
    expect(countryFlagData("JP", "invalid_locale")?.name).toBe("Japan");
  });
  it("reserves dimensions, labels meaningful flags and hides redundant ones", () => {
    const meaningful = renderToStaticMarkup(
      <CountryFlag code="JP" size="small" />,
    );
    expect(meaningful).toContain('role="img"');
    expect(meaningful).toContain('aria-label="Japan flag"');
    expect(meaningful).toContain("width:18px;height:18px");
    expect(meaningful).toContain('width="36" height="36"');
    expect(meaningful).not.toContain("/_next/image");
    const decorative = renderToStaticMarkup(
      <CountryFlag code="TW" decorative />,
    );
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain('role="img"');
    expect(decorative).not.toContain("aria-label=");
  });
});

describe("vendored flag integrity", () => {
  it("ships the entire supported set as inert, unchanged SVGs with native dimensions", () => {
    const folder = new URL("../../public/flags/twemoji/", import.meta.url);
    expect(Object.keys(assets)).toHaveLength(259);
    expect(Object.keys(manifest)).toEqual(Object.keys(assets));
    expect(
      readdirSync(folder)
        .filter((file) => file.endsWith(".svg"))
        .sort(),
    ).toEqual(
      Object.values(assets)
        .map((asset) => asset.file)
        .sort(),
    );
    for (const [code, asset] of Object.entries(assets)) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(asset.file).toMatch(/^1f1[e-f][\da-f]-1f1[e-f][\da-f]\.svg$/);
      const bytes = readFileSync(new URL(asset.file, folder));
      expect(bytes.toString()).toContain(
        `viewBox="0 0 ${asset.width} ${asset.height}"`,
      );
      expect(bytes.toString()).not.toMatch(
        /<(script|foreignObject)|(?:href|onload)\s*=/i,
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        manifest[code as keyof typeof manifest].sha256,
      );
      expect(countryFlagData(code, "en")).not.toBeNull();
    }
    expect(readFileSync(new URL("NOTICE.md", folder), "utf8")).toContain(
      "without modification",
    );
    expect(
      readFileSync(new URL("LICENSE-GRAPHICS.txt", folder), "utf8"),
    ).toContain("Attribution 4.0 International");
  });
});
