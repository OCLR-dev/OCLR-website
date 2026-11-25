import { rulesSectionIds } from "./rules-navigation";
import type { Edition } from "./editions";
import { historicalRulebook } from "./historical-rulebooks";
import { informationPreview } from "./tournament-information";

export type ChatSource = { title: string; url: string; text: string };
export function linksToSeasonSection(
  text: string,
  slug: string,
  section: "players" | "mappools" | "teams" | "draft" | "schedule",
) {
  const links = text.matchAll(
    /(?:^|[\s<(]|\[)(?:https:\/\/(?:www\.)?oclr\.org)?\/tournaments\/([a-z0-9-]+)\/(players|mappools|teams|draft|schedule)(?=\/?(?:$|[?#\s>),，。]))/gi,
  );
  return Array.from(links).some(
    (match) => match[1] === slug && match[2] === section,
  );
}

const concepts = [
  [
    "換人",
    "换人",
    "替換",
    "替换",
    "替補",
    "替补",
    "轮换",
    "輪換",
    "substitution",
    "substitute",
    "substitutions",
    "roster change",
  ],
  ["選手", "选手", "隊員", "队员", "player", "players"],
  ["隊伍", "队伍", "戰隊", "战队", "team", "teams"],
  ["隊長", "队长", "captain"],
  ["統計", "统计", "數據", "数据", "statistics", "rating"],
  ["排名", "排行", "積分", "积分", "standings", "leaderboard", "rank"],
  ["預測", "预测", "pickem"],
  ["賽果", "赛果", "比分", "result", "score"],
  ["賽程", "赛程", "賽事安排", "赛事安排", "schedule", "fixtures"],
  ["獎項", "奖项", "獎勵", "奖励", "awards"],
  ["工作人員", "工作人员", "staff"],
  ["對陣", "对阵", "bracket"],
  ["報名", "报名", "register", "registration"],
  ["資格", "资格", "eligibility", "eligible"],
  ["選秀", "选秀", "draft"],
  ["遲到", "迟到", "late"],
  ["禁圖", "禁图", "ban"],
  ["選圖", "选图", "pick"],
  ["圖池", "图池", "mappool", "pool", "map pool"],
  ["準決賽", "半决赛", "半決賽", "semifinal"],
  ["決賽", "决赛", "final"],
  ["四分之一决赛", "八強", "八强", "quarterfinal"],
];
const ignored = new Set(
  "the and for what is are can this that does do how when a of to in me tell 我們 我们 可以 請問 请问 這屆 这届 規則 规则 rules rule".split(
    " ",
  ),
);
export function chatTerms(text: string) {
  const input = text.normalize("NFKC").toLowerCase();
  const result = new Set<string>();
  for (const [word] of input.matchAll(/[a-z0-9]+|[\p{Script=Han}]+/gu)) {
    if (/^[a-z0-9]/.test(word)) result.add(word);
    else
      for (let i = 0; i < word.length - 1; i++)
        result.add(word.slice(i, i + 2));
  }
  for (const group of concepts) {
    if (group.some((word) => input.includes(word)))
      for (const word of group) result.add(word);
  }
  return [...result].filter((term) => !ignored.has(term));
}

export function publishedRuleChapters(edition: Edition) {
  const archive =
    edition.archive && historicalRulebook(edition.archive, edition.rules);
  const preview = !edition.archive && informationPreview(edition.slug);
  const sections = edition.archive
    ? (archive?.sections ?? [])
    : preview
      ? preview.rules.map((rule) => ({
          heading: rule.heading,
          body: rule.paragraphs.join("\n"),
        }))
      : [
          ...(edition.eligibility
            ? [
                {
                  heading: "Eligibility / 報名資格 / 报名资格",
                  body: edition.eligibility,
                },
              ]
            : []),
          ...(edition.rules?.sections ?? []),
        ];
  const ids = edition.archive
    ? rulesSectionIds(sections.map((s) => s.heading))
    : sections.map((_, i) => `rules-${i + 1}`);
  const version = archive?.version ?? edition.rules?.version;
  return sections.map((section, i) => ({
    title: section.heading,
    url: `/tournaments/${edition.slug}#${encodeURIComponent(ids[i])}`,
    body: section.body,
    version,
  }));
}

export function ruleExcerpts(
  chapters: ReturnType<typeof publishedRuleChapters>,
): ChatSource[] {
  return chapters.flatMap((section) => {
    const parts: ChatSource[] = [];
    // Keep adjoining sentences when a chapter exceeds the model's per-excerpt budget.
    for (let start = 0; start < section.body.length; start += 950) {
      parts.push({
        title: section.title,
        url: section.url,
        text: [section.version, section.body.slice(start, start + 1150)]
          .filter(Boolean)
          .join("\n"),
      });
      if (start + 1150 >= section.body.length) break;
    }
    return parts;
  });
}

export function rankedSources<T extends ChatSource>(
  sources: T[],
  question: string,
  limit: number,
  allowFallback = false,
) {
  const keywords = chatTerms(question);
  return sources
    .map((source) => {
      const heading = source.title.normalize("NFKC").toLowerCase();
      const text = source.text.normalize("NFKC").toLowerCase();
      const score = keywords.reduce(
        (s, k) =>
          s + (heading.includes(k) ? 3 : 0) + (text.includes(k) ? 1 : 0),
        0,
      );
      return { source, score };
    })
    .filter((hit) => allowFallback || hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((hit) => hit.source);
}
