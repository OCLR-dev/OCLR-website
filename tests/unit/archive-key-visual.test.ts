import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { archiveKeyVisual } from "../../src/lib/archive-key-visual";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
for (const season of [4, 5, 7, 8, 9, 10])
  it(`supplies S${season} art without relying on an editable slug`, () => {
    const a = historicalArchiveSchema.parse(
      JSON.parse(readFileSync(`docs/imports/s${season}-archive.json`, "utf8")),
    );
    expect(
      archiveKeyVisual({ ...a, editionSlug: "renamed" }, null)?.src,
    ).toContain(`/archive/s${season}/`);
    expect(archiveKeyVisual(a, "/custom.png")?.src).toBe("/custom.png");
    expect(
      archiveKeyVisual(
        { ...a, sourceUrl: "https://example.com/unknown" },
        null,
      ),
    ).toBeUndefined();
  });

it("maps a stored pre-WebP selection onto its current WebP artwork", () => {
  expect(
    archiveKeyVisual(
      { sourceUrl: "https://example.com/unknown" },
      "/archive/s5/key-visual.png",
    ),
  ).toEqual({
    src: "/archive/s5/key-visual.webp",
    width: 1920,
    height: 1080,
  });
});
it("uses the S4 original dimensions with and without the workbook edit suffix", () => {
  for (const suffix of ["", "/edit"])
    expect(
      archiveKeyVisual(
        {
          sourceUrl: `https://docs.google.com/spreadsheets/d/1QqF8leIqov2l3loi92hFHu82HEuplb9Iau2zPNUcySk${suffix}`,
        },
        null,
      ),
    ).toEqual({
      src: "/archive/s4/key-visual.avif",
      width: 1728,
      height: 1080,
    });
});
