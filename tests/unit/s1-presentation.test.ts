import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { expect, it } from "vitest";
import { archiveKeyVisual } from "../../src/lib/archive-key-visual";
import { editionSchema } from "../../src/lib/editions";
import {
  historicalArchiveSchema,
  publicHistoricalArchive,
} from "../../src/lib/historical-archive";
import {
  historicalRulebook,
  historicalRulebookSeason,
} from "../../src/lib/historical-rulebooks";

const sourceUrl =
  "https://docs.google.com/spreadsheets/d/10OvY6V2_nJpmv3LekQJZw6Eo5Hy1V-ggSoOQIxIdm6I";
const originalSections = JSON.parse(
  readFileSync("docs/imports/s1-rules.json", "utf8"),
) as { title: string; content: string }[];
const configured = {
  version: "synthetic-current-version",
  sections: originalSections.map(({ title, content }) => ({
    heading: title,
    body: content,
  })),
};

function source(suffix = "") {
  return historicalArchiveSchema.parse({
    formatVersion: 2,
    editionSlug: "synthetic-renamed",
    sourceUrl: sourceUrl + suffix,
    capturedOn: "2026-01-01",
    notes: [],
    links: [],
    teams: [{ id: "synthetic", name: "Synthetic team", source: "Test" }],
    players: [
      {
        osuId: 1,
        username: "Synthetic captain",
        teamId: "synthetic",
        role: "captain",
        tier: 0,
        source: "Test",
      },
    ],
    picks: [],
    staff: [],
    standings: [],
    matches: [],
    pools: [],
    sourceFacts: [
      {
        category: "rules",
        label: "Private backup",
        text: "Private source facts are not the saved rulebook.",
        source: "Test",
      },
    ],
  });
}

it("uses current saved S1 rules after public projection and slug changes", () => {
  for (const suffix of ["", "/edit"]) {
    const projected = publicHistoricalArchive(source(suffix));
    expect(projected.sourceFacts).toBeUndefined();
    const rules = historicalRulebook(projected, configured)!;
    expect(rules.sections).toEqual(configured.sections);
    expect(rules.sections.map((s) => s.heading)).toEqual([
      "背景",
      "总体规则",
      "赛程安排",
      "组队规则",
      "比赛规则",
      "比赛奖励",
      "Staff",
    ]);
    expect(historicalRulebookSeason(rules)).toBe("1");
    expect(rules.documentUrl).toBe("/archive/s1/rules.pdf");
    expect(historicalRulebook(projected)).toBeNull();
    expect(
      historicalRulebook(projected, {
        version: "synthetic-updated",
        sections: [{ heading: "Updated", body: "Saved native update." }],
      })?.sections,
    ).toEqual([{ heading: "Updated", body: "Saved native update." }]);
  }
  expect(
    historicalRulebook(
      { ...source(), sourceUrl: "https://example.com/unknown" },
      configured,
    ),
  ).toBeNull();
});

it("binds the S1 visual to the source workbook and allows explicit branding", async () => {
  const visual = {
    src: "/archive/s1/key-visual.webp",
    width: 1728,
    height: 1080,
  };
  for (const suffix of ["", "/edit"]) {
    expect(archiveKeyVisual(source(suffix), null)).toEqual(visual);
    expect(archiveKeyVisual(source(suffix), visual.src)).toEqual(visual);
    expect(archiveKeyVisual(source(suffix), "/custom.png")?.src).toBe(
      "/custom.png",
    );
  }
  expect(
    archiveKeyVisual({ sourceUrl: "https://example.com/unknown" }, null),
  ).toBeUndefined();
  expect(
    editionSchema.shape.branding.parse({
      logo: visual.src,
      keyVisual: visual.src,
      background: null,
    }),
  ).toMatchObject({ logo: visual.src, keyVisual: visual.src });
  const metadata = await sharp("public" + visual.src).metadata();
  expect([metadata.width, metadata.height]).toEqual([1728, 1080]);
  for (const [file, hash] of [
    [
      "key-visual.webp",
      "33776a2e6f3deaa3b7463a861d5da20bfe0e051e5bd9515b9c26e6c797f74295",
    ],
    [
      "rules.pdf",
      "312ce9e9f282348a9706d06986a5acd8820e51063bb30aa4ce25afe6b1910e25",
    ],
  ])
    expect(
      createHash("sha256")
        .update(readFileSync("public/archive/s1/" + file))
        .digest("hex"),
    ).toBe(hash);
});
