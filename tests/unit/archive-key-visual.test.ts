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
