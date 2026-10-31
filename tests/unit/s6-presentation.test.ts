import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  historicalArchiveSchema,
  recordedArchiveMatch,
  archiveWinner,
  approveArchiveMatches,
  publicHistoricalArchive,
} from "../../src/lib/historical-archive";
import { archiveEventMatches } from "../../src/lib/archive-event-matches";
import { archiveBracket } from "../../src/lib/archive-bracket";
import {
  editionSchema,
  normalizeEditionBranding,
} from "../../src/lib/editions";
import {
  historicalRulebook,
  historicalRulebookSeason,
} from "../../src/lib/historical-rulebooks";
import { archiveKeyVisual } from "../../src/lib/archive-key-visual";
import s9 from "../../src/content/s9-rulebook.json";

const archive = historicalArchiveSchema.parse(
  JSON.parse(readFileSync("docs/imports/s6-confirmed-archive.json", "utf8")),
);
const rules = editionSchema.shape.rules.parse(
  JSON.parse(readFileSync("docs/imports/s6-configured-rules.json", "utf8")),
)!;

it("records exactly the organizer-approved matches while retaining their source evidence", () => {
  const approved = approveArchiveMatches(
    archive,
    archive.matches.map((m) => m.id),
    { approvedOn: "2026-10-25", source: "Admin approval" },
  );
  expect(() =>
    approveArchiveMatches(
      archive,
      [archive.matches[0].id, archive.matches[0].id],
      { approvedOn: "2026-10-25", source: "Admin approval" },
    ),
  ).toThrow();
  expect(() =>
    approveArchiveMatches(approved, [approved.matches[0].id], {
      approvedOn: "2026-10-25",
      source: "Admin approval",
    }),
  ).toThrow();
  expect(approved.matches.filter(recordedArchiveMatch)).toHaveLength(33);
  expect(archive.matches.filter(recordedArchiveMatch)).toHaveLength(0);
  expect(approved.standings).toEqual(archive.standings);
  expect(approved.matches.flatMap((m) => m.review!.games)).toEqual(
    archive.matches.flatMap((m) => m.review!.games),
  );
  for (const m of approved.matches) {
    const original = archive.matches.find((old) => old.id === m.id)!;
    expect(
      historicalArchiveSchema.safeParse({ ...approved, matches: [m] }).success,
    ).toBe(true);
    expect(m.review!.rawScore).toEqual(original.review!.rawScore);
    expect(m.score).toEqual(original.review!.workingScore);
    expect(m.review!.approval?.approvedOn).toBe("2026-10-25");
    expect(archiveWinner(m)).not.toBeNull();
    expect(
      historicalArchiveSchema.safeParse({
        ...approved,
        matches: [{ ...m, review: { ...m.review!, approval: undefined } }],
      }).success,
    ).toBe(false);
    expect(
      historicalArchiveSchema.safeParse({
        ...approved,
        matches: [{ ...m, review: { ...m.review!, status: "pending" } }],
      }).success,
    ).toBe(false);
    expect(
      historicalArchiveSchema.safeParse({
        ...approved,
        matches: [{ ...m, score: [99, 0] }],
      }).success,
    ).toBe(false);
  }
  const rows = archiveEventMatches(
    approved,
    approved.matches,
    (s, id) => `/${s}/${id}`,
    "Asia/Shanghai",
    "en",
  );
  expect(rows.find((m) => m.id === "mp-84398168")?.score).toEqual([3, 5]);
  expect(rows.find((m) => m.id === "mp-85503945")?.score).toEqual([2, 6]);
  expect(rows.every((m) => m.reviewScore === undefined)).toBe(true);
  expect(rows.every((m) => m.roomOpenedAt?.includes("UTC+8"))).toBe(true);
  expect(
    archiveBracket(approved, (id) => id)?.groups.flatMap((g) =>
      g.rounds.flatMap((r) => r.matches),
    ),
  ).toHaveLength(33);
  const published = publicHistoricalArchive(approved);
  expect(published.matches).toHaveLength(33);
  expect(published.matches.every((m) => !m.review && m.roomOpenedAt)).toBe(
    true,
  );
  expect(published.sourceFacts).toBeUndefined();
  expect(published.reviewTables).toBeUndefined();
  expect(published.qualifiers).toBeUndefined();
  expect(published.notes).toEqual([]);
  expect(published.unresolvedPlayers).toEqual(archive.unresolvedPlayers);
  expect(historicalArchiveSchema.safeParse(published).success).toBe(true);
  expect(publicHistoricalArchive(archive).matches).toHaveLength(0);
  expect(
    archiveBracket(published, (id) => id)?.groups.filter(
      (g) => g.layout === "grid",
    ),
  ).toHaveLength(4);
});

it("uses the saved S6 section editor only for its evidenced source pair", () => {
  expect(historicalRulebook(archive, rules)?.sections).toEqual(rules.sections);
  expect(historicalRulebookSeason(historicalRulebook(archive, rules)!)).toBe(
    "6",
  );
  expect(
    historicalRulebook({ ...archive, editionSlug: "renamed" }, rules)?.sections,
  ).toEqual(rules.sections);
  expect(
    historicalRulebook(
      { ...archive, sourceUrl: "https://example.com/another-season" },
      rules,
    ),
  ).toBeNull();
  expect(historicalRulebook({ ...archive, links: [] }, rules)).toBeNull();
  expect(historicalRulebook(archive)).toBeNull();
  const s9Archive = historicalArchiveSchema.parse(
    JSON.parse(readFileSync("docs/imports/s9-archive.json", "utf8")),
  );
  expect(historicalRulebook(s9Archive, rules)).toBe(s9);
});

it("preserves all supplied rule sections and labels the obsolete group proposal", () => {
  expect(rules.sections.map((s) => s.heading)).toEqual([
    "重点规则",
    "比赛流程",
    "BP流程",
    "时限",
  ]);
  const text = rules.sections.map((s) => s.body).join("\n");
  for (const fact of [
    "BO9 2Ban",
    "BO11 2Ban",
    "BO13 2Ban",
    "无法选择相同MOD",
    "不得超过5分钟",
    "15分钟",
    "60秒，90秒，120秒",
    "2天",
    "4轮的瑞士轮",
    "!mp start 30",
    "第一轮最后选择的队伍将连续选两名选手",
  ])
    expect(text).toContain(fact);
  expect(rules.sections.find((s) => s.heading === "比赛流程")!.body).toMatch(
    /已废止[\s\S]*两个小组[\s\S]*现行规则[\s\S]*4轮的瑞士轮/,
  );
});

it("maps the original S6 image in both branding slots and minimal read summaries", () => {
  expect(
    editionSchema.shape.branding.parse(
      normalizeEditionBranding({
        branding: {
          logo: "/archive/s6/key-visual.jpg",
          keyVisual: "/archive/s6/key-visual.jpg",
          background: null,
        },
      }).branding,
    ),
  ).toEqual({
    logo: "/archive/s6/key-visual.webp",
    keyVisual: "/archive/s6/key-visual.webp",
    background: null,
  });
  expect(archiveKeyVisual({ sourceUrl: archive.sourceUrl }, null)).toEqual({
    src: "/archive/s6/key-visual.webp",
    width: 1920,
    height: 1080,
  });
  expect(
    archiveKeyVisual(
      { sourceUrl: archive.sourceUrl },
      "/archive/s7/key-visual.jpg",
    )?.src,
  ).toBe("/archive/s7/key-visual.jpg");
});
