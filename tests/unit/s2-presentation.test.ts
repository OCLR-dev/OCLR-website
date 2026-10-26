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
  "https://docs.google.com/spreadsheets/d/1lQrHwsbPb5nC-MDPbHSNkL2RFD1eEcS-LbGonEr10QY";
const originalSections = JSON.parse(
  readFileSync("docs/imports/s2-rules.json", "utf8"),
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

it("uses current saved S2 rules after public projection and slug changes", () => {
  for (const suffix of ["", "/edit"]) {
    const projected = publicHistoricalArchive(source(suffix));
    expect(projected.sourceFacts).toBeUndefined();
    const rules = historicalRulebook(projected, configured)!;
    expect(rules.sections).toEqual(configured.sections);
    expect(rules.sections.map((s) => s.heading)).toEqual([
      "背景",
      "总体规则",
      "赛程安排",
      "比赛规则",
      "比赛奖励",
    ]);
    expect(historicalRulebookSeason(rules)).toBe("2");
    expect(rules.documentUrl).toBe("/archive/s2/rules.pdf");
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

it("binds the S2 visual to the source workbook and allows explicit branding", async () => {
  const visual = {
    src: "/archive/s2/key-visual.avif",
    width: 1379,
    height: 862,
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
  expect([metadata.width, metadata.height]).toEqual([1379, 862]);
  for (const [file, hash] of [
    [
      "key-visual.avif",
      "f5a90a4b55dbc051846c9b2b5d5a0ebee3a20df82b618d1ab643fa108631fcbf",
    ],
    [
      "rules.pdf",
      "35319dd1aa0bbf030ff9b5e318045c55d12ef16feaa1c5066db34ad83dc6753e",
    ],
  ])
    expect(
      createHash("sha256")
        .update(readFileSync("public/archive/s2/" + file))
        .digest("hex"),
    ).toBe(hash);
});
