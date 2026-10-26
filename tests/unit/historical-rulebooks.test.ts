import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import {
  historicalRulebook,
  historicalRulebookSeason,
} from "../../src/lib/historical-rulebooks";
import s9 from "../../src/content/s9-rulebook.json";
import s5 from "../../docs/imports/s5-rulebook.json";

const archive = historicalArchiveSchema.parse(
  JSON.parse(readFileSync("docs/imports/s9-archive.json", "utf8")),
);
describe("S5 versioned historical rules", () => {
  const s5Archive = historicalArchiveSchema.parse(
    JSON.parse(readFileSync("docs/imports/s5-reviewed-import.json", "utf8")),
  );
  const configured = { version: s5.version, sections: s5.sections };

  it("reads the saved sections only for the evidenced workbook and rulebook pair", () => {
    const rules = historicalRulebook(s5Archive, configured);
    expect(rules).toEqual(s5);
    expect(historicalRulebookSeason(rules!)).toBe("5");
    expect(
      historicalRulebook(
        { ...s5Archive, editionSlug: "renamed-copy" },
        configured,
      ),
    ).toEqual(s5);
    expect(historicalRulebook(s5Archive)).toBeNull();
    expect(
      historicalRulebook({ ...s5Archive, links: [] }, configured),
    ).toBeNull();
    expect(
      historicalRulebook(
        { ...s5Archive, sourceUrl: archive.sourceUrl },
        configured,
      ),
    ).toBeNull();
  });

  it("uses later saved versions without replacing the literal source content", () => {
    const updated = {
      version: "organizer-revision",
      sections: s5.sections.slice(1),
    };
    expect(historicalRulebook(s5Archive, updated)).toMatchObject(updated);
  });

  it("preserves the source's nonempty lines in its original section order", () => {
    const normalize = (text: string) =>
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
    expect(
      normalize(
        [s5.title, ...s5.sections.flatMap((s) => [s.heading, s.body])].join(
          "\n",
        ),
      ),
    ).toBe(normalize(readFileSync("docs/imports/s5-rulebook.txt", "utf8")));
  });
});
describe("S9 historical rulebook supplement", () => {
  it("requires both the S9 source workbook and the organizer's rulebook identity", () => {
    expect(historicalRulebook(archive)).toBe(s9);
    expect(
      historicalRulebook({ ...archive, editionSlug: "preview-copy" }),
    ).toBe(s9);
    expect(
      historicalRulebook({
        ...archive,
        sourceUrl: "https://example.com/another-season",
      }),
    ).toBeNull();
    expect(historicalRulebook({ ...archive, links: [] })).toBeNull();
  });
  it("preserves every nonempty line of the provided document in eight sections", () => {
    const normalize = (text: string) =>
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
    const reconstructed = [
      s9.title,
      ...s9.sections.flatMap((section) => [section.heading, section.body]),
    ].join("\n");
    expect(s9.sections).toHaveLength(8);
    expect(normalize(reconstructed)).toBe(
      normalize(readFileSync("docs/imports/s9-rulebook.txt", "utf8")),
    );
    expect(s9.version).toContain("v1.2");
  });
  it("retains both source illustrations at valid text anchors and their original dimensions", () => {
    const figures = s9.sections.flatMap(
      (section) => ("figures" in section ? section.figures : []) ?? [],
    );
    expect(figures).toHaveLength(2);
    for (const section of s9.sections)
      for (const figure of ("figures" in section ? section.figures : []) ??
        []) {
        expect(section.body).toContain(figure.after);
        const image = readFileSync(`public${figure.src}`);
        expect(image.readUInt32BE(16)).toBe(figure.width);
        expect(image.readUInt32BE(20)).toBe(figure.height);
      }
  });
});

describe("S4 saved original sections", () => {
  const sourceUrl =
    "https://docs.google.com/spreadsheets/d/1QqF8leIqov2l3loi92hFHu82HEuplb9Iau2zPNUcySk";
  const sections = JSON.parse(
    readFileSync("docs/imports/s4-rules.json", "utf8"),
  ).map((s: { title: string; content: string }) => ({
    heading: s.title,
    body: s.content,
  }));
  const configured = { version: "OCLR S4规则说明（原文分段）", sections };
  it("renders the saved source text and order without depending on the slug", () => {
    for (const suffix of ["", "/edit"]) {
      const source = {
        ...archive,
        sourceUrl: sourceUrl + suffix,
        editionSlug: "renamed",
      };
      const rules = historicalRulebook(source, configured)!;
      expect(rules.sections).toEqual(sections);
      expect(rules.sections.map((s) => s.heading)).toEqual([
        "赛程规则",
        "比赛规则",
        "赛程安排",
        "STAFF",
      ]);
      expect(rules.version).toBe(configured.version);
      expect(historicalRulebookSeason(rules)).toBe("4");
      expect(
        readFileSync("public" + rules.documentUrl)
          .subarray(0, 4)
          .toString(),
      ).toBe("%PDF");
      expect(historicalRulebook(source)).toBeNull();
    }
    expect(historicalRulebook(archive, configured)).toBe(s9);
    expect(
      historicalRulebook(
        { ...archive, sourceUrl: "https://example.com/unknown" },
        configured,
      ),
    ).toBeNull();
  });
});

describe("S7 saved reconstructed rules", () => {
  const source = historicalArchiveSchema.parse(
    JSON.parse(readFileSync("docs/imports/s7-archive.json", "utf8")),
  );
  const configured = {
    version: "synthetic-s7-v1",
    sections: [
      {
        heading: "Synthetic group rules",
        body: "Four teams per group.\nFirst to six wins.",
      },
    ],
  };
  it("uses saved versions and literal sections independently of the edition slug", () => {
    const rules = historicalRulebook(
      { ...source, editionSlug: "renamed" },
      configured,
    )!;
    expect(rules).toMatchObject(configured);
    expect(rules.sections).toBe(configured.sections);
    expect(historicalRulebookSeason(rules)).toBe("7");
    const updated = {
      version: "synthetic-s7-v2",
      sections: [{ heading: "Revised", body: "Updated saved text" }],
    };
    expect(historicalRulebook(source, updated)).toMatchObject(updated);
  });
  it("keeps missing rules empty and does not identify other workbooks as S7", () => {
    expect(historicalRulebook(source)).toBeNull();
    expect(historicalRulebook(source, null)).toBeNull();
    expect(
      historicalRulebook(
        { ...source, sourceUrl: "https://example.com/unknown" },
        configured,
      ),
    ).toBeNull();
    expect(historicalRulebook(archive, configured)).toBe(s9);
  });
});
