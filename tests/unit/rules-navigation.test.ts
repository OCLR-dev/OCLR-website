import { describe, expect, it } from "vitest";
import {
  rulesBodyText,
  rulesContentsLabel,
  rulesSectionIds,
  rulesRedirectHref,
} from "../../src/lib/rules-navigation";
describe("rules heading anchors", () => {
  it("retains Chinese and normalizes fullwidth characters", () => {
    expect(rulesSectionIds(["比赛规则", "Ｒｕｌｅｓ & Eligibility"])).toEqual([
      "rule-比赛规则",
      "rule-rules-eligibility",
    ]);
  });
  it("is stable and avoids duplicate and slug-collision IDs", () => {
    const headings = ["Rules", "Rules", "Rules-2", "!", "!", "RULES"];
    const ids = rulesSectionIds(headings);
    expect(new Set(ids).size).toBe(headings.length);
    expect(ids).toEqual(rulesSectionIds(headings));
    expect(ids).toEqual([
      "rule-rules",
      "rule-rules-2",
      "rule-rules-2-2",
      "rule-section",
      "rule-section-2",
      "rule-rules-3",
    ]);
  });
  it("bounds long headings and safely retains text-derived anchors", () => {
    const ids = rulesSectionIds(["x".repeat(500), "<script>alert(1)</script>"]);
    expect(ids[0].length).toBeLessThan(90);
    expect(ids[1]).not.toContain("<");
  });
});

describe("legacy rules links", () => {
  it("maps decoded chapter anchors while keeping the selected edition", () => {
    expect(
      rulesRedirectHref(
        "/tournaments/s11",
        "#rule-%E6%AF%94%E8%B5%9B%E8%A7%84%E5%88%99",
        {
          "rule-比赛规则": "rules-2",
        },
      ),
    ).toBe("/tournaments/s11#rules-2");
    expect(
      rulesRedirectHref("/tournaments/s8", "#rule-比赛信息", {
        "rule-比赛信息": "rule-比赛信息",
      }),
    ).toBe("/tournaments/s8#rule-%E6%AF%94%E8%B5%9B%E4%BF%A1%E6%81%AF");
  });
  it("falls back to the same edition rules for absent, malformed or unrecognized fragments", () => {
    for (const hash of [
      "",
      "#",
      "#unknown",
      "#%E0%A4%A",
      "#__proto__",
      "#https://example.com",
    ]) {
      expect(rulesRedirectHref("/tournaments/s7", hash, {})).toBe(
        "/tournaments/s7#rules",
      );
    }
  });
});

describe("historical contents labels", () => {
  it("removes only trailing colons for S8/S9/S10 without changing headings or anchors", () => {
    const headings = ["比賽信息：", "A: B:", "EX模式：  ", "No colon"];
    for (const season of ["8", "9", "10"]) {
      expect(headings.map((h) => rulesContentsLabel(h, season))).toEqual([
        "比賽信息",
        "A: B",
        "EX模式",
        "No colon",
      ]);
    }
    expect(rulesContentsLabel(headings[0], "11")).toBe(headings[0]);
    expect(rulesContentsLabel(headings[0])).toBe(headings[0]);
    expect(rulesSectionIds(headings)).toEqual(rulesSectionIds([...headings]));
  });
});

describe("S8 rendered body whitespace", () => {
  it("preserves text, meaningful breaks and figure anchors without reformatting other seasons", async () => {
    const s8 = (await import("../../src/content/s8-rulebook.json")).default;
    for (const section of s8.sections) {
      const normalized = rulesBodyText(section.body, "8");
      expect(normalized).not.toMatch(/\n{3,}/);
      expect(normalized.replace(/\s/g, "")).toBe(
        section.body.replace(/\s/g, ""),
      );
      expect(rulesBodyText(section.body, "9")).toBe(section.body.trim());
      for (const figure of ("figures" in section ? section.figures : []) ??
        []) {
        expect(section.body).toContain(figure.after);
      }
    }
    expect(rulesBodyText("one\n\n\n\nfive\nnext", "8")).toBe(
      "one\n\nfive\nnext",
    );
  });
});
