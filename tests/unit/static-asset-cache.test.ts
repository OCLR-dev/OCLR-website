import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { publicAssetCacheHeaders } from "../../src/lib/static-asset-cache";

describe("public asset cache boundary", () => {
  it("groups existing public images and fonts into bounded, exact rules", async () => {
    const root = mkdtempSync(join(tmpdir(), "oclr-cache-test-"));
    try {
      mkdirSync(join(root, "branding"));
      mkdirSync(join(root, "reactions"));
      for (const file of [
        "branding/logo.svg",
        "branding/logo+(dark)|alternate.svg",
        "font.woff2",
        "README.md",
        "data.json",
      ])
        writeFileSync(join(root, file), "fixture");
      for (let i = 0; i < 1_100; i++) {
        const filename = `reaction-${String(i).padStart(4, "0")}.png`;
        writeFileSync(join(root, "reactions", filename), "fixture");
      }

      const rules = publicAssetCacheHeaders(root, true);
      expect(rules.length).toBeLessThan(1_000);
      const cacheControl = async (path: string) => {
        const response = await unstable_getResponseFromNextConfig({
          url: `http://localhost${path}`,
          nextConfig: { headers: async () => rules },
        });
        return response.headers.get("Cache-Control");
      };

      for (const path of [
        "/branding/logo.svg",
        "/branding/logo+(dark)|alternate.svg",
        "/font.woff2",
        "/reactions/reaction-0000.png",
        "/reactions/reaction-1099.png",
      ]) {
        expect(await cacheControl(path)).toBe(
          "public, max-age=300, must-revalidate",
        );
      }
      for (const path of [
        "/README.md",
        "/data.json",
        "/api/branding/logo.svg",
        "/branding/logoXsvg",
        "/branding/logo.svg/extra",
        "/branding/alternate.svg",
        "/reactions/reaction-1100.png",
      ]) {
        expect(await cacheControl(path)).toBeNull();
      }
      expect(publicAssetCacheHeaders(root, false)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});
