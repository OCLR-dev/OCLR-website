import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { editionSchema } from "../../src/lib/editions";
import { archiveKeyVisual } from "../../src/lib/archive-key-visual";
import { historicalTournamentOverview } from "../../src/lib/public-read-models";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";

const assets = [
  { src: "/archive/s8/thumbnail.jpg", width: 1920, height: 1080 },
  { src: "/archive/s9/thumbnail.png", width: 1920, height: 1080 },
  { src: "/archive/s10/thumbnail.png", width: 1024, height: 1024 },
];

describe("built-in tournament branding (#356)", () => {
  it.each(assets)(
    "accepts and projects $src using the unchanged asset's own dimensions",
    async (asset) => {
      const configured = editionSchema.parse({
        ...edition,
        branding: { logo: asset.src, keyVisual: asset.src, background: null },
      });
      const metadata = await sharp(`public${asset.src}`).metadata();
      expect({ width: metadata.width, height: metadata.height }).toEqual({
        width: asset.width,
        height: asset.height,
      });
      expect(archiveKeyVisual(historicalArchive, asset.src)).toEqual(asset);
      expect(
        historicalTournamentOverview(configured, historicalArchive).keyVisual,
      ).toEqual(asset);
      expect(
        archiveKeyVisual(
          {
            sourceUrl:
              "https://docs.google.com/spreadsheets/d/16ASDCD95p3TgfjgSHCjXmRN3KJuuAD4KS0fImpcTiiM/edit",
          },
          asset.src,
        ),
      ).toEqual(asset);
    },
  );
  it("keeps existing choices and clearing while refusing arbitrary paths and URLs", () => {
    for (const src of [
      null,
      "/oclr-s11-key-visual.webp",
      "/archive/s1/key-visual.webp",
      "/archive/s3/key-visual.avif",
      "/archive/s4/key-visual.avif",
      "/archive/s5/key-visual.png",
    ])
      expect(
        editionSchema.shape.branding.safeParse({
          logo: null,
          background: null,
          keyVisual: src,
        }).success,
      ).toBe(true);
    for (const src of [
      "https://example.com/art.png",
      "/archive/s8/unknown.png",
      "/archive/s8/../s10/thumbnail.png",
    ])
      expect(
        editionSchema.shape.branding.safeParse({
          logo: null,
          background: null,
          keyVisual: src,
        }).success,
      ).toBe(false);
    expect(archiveKeyVisual(historicalArchive, null)).toBeUndefined();
    expect(
      archiveKeyVisual(
        {
          sourceUrl:
            "https://docs.google.com/spreadsheets/d/12BGS8WRnl10OdeUKyvmOypFzpTYCpHgx9QY1mw-0hlw/edit",
        },
        null,
      ),
    ).toEqual(assets[2]);
  });
});
