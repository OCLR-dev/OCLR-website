import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicAssetCacheHeaders } from "../../src/lib/static-asset-cache";

describe("public asset cache boundary", () => {
  it("includes existing public images/fonts only and disables the policy in dev", () => {
    const root = mkdtempSync(join(tmpdir(), "oclr-cache-test-"));
    try {
      mkdirSync(join(root, "branding"));
      for (const file of [
        "branding/logo.svg",
        "font.woff2",
        "README.md",
        "data.json",
      ])
        writeFileSync(join(root, file), "fixture");
      const rules = publicAssetCacheHeaders(root, true);
      expect(rules.map((rule) => rule.source)).toEqual([
        "/branding/logo.svg",
        "/font.woff2",
      ]);
      expect(
        rules.every(
          (rule) =>
            rule.headers[0].value === "public, max-age=300, must-revalidate",
        ),
      ).toBe(true);
      expect(publicAssetCacheHeaders(root, false)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});
