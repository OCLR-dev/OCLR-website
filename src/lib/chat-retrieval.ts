import { rulesSectionIds } from "./rules-navigation";
import type { Edition } from "./editions";
import { historicalRulebook } from "./historical-rulebooks";
import { informationPreview } from "./tournament-information";

export type ChatSource = { title: string; url: string; text: string };
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
function terms(text: string) {
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

export function rankedSources(
  sources: ChatSource[],
  question: string,
  limit: number,
  allowFallback = false,
) {
  const keywords = terms(question);
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
