// Regenerates copy.md from the COPY object in wireframe.html.
// Usage: node docs/design/pickem/copy.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, "wireframe.html"), "utf8");
const start = html.indexOf("const COPY = {");
const end = html.indexOf("\n};\n", start);
if (start < 0 || end < 0)
  throw new Error("COPY object not found in wireframe.html");
const source = html.slice(start + "const COPY = ".length, end + 2);
const copy = runInNewContext(`(${source})`);

const TITLES = {
  "navigation & header": "导航与页首",
  "rules panel": "玩法",
  card: "场次卡",
  aside: "侧栏：我的进度与榜单摘要",
  "my picks": "我的预测",
  leaderboard: "排行榜与显示设置",
  visitor: "访客",
  "page states": "页面级状态",
};
const LANGS = ["zh-Hans", "zh-Hant", "en"];
const sections = [];
for (const line of source.split("\n")) {
  const heading = line.match(/^\s*\/\/\s*(.+)$/);
  const key = line.match(/^\s*(\w+):\s*\{/);
  if (heading) sections.push({ title: heading[1].trim(), keys: [] });
  else if (key) sections.at(-1).keys.push(key[1]);
}

const cell = (value) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
const reused = sections.flatMap((s) => s.keys).filter((k) => k.startsWith("x_"));
const proposed = sections
  .map((s) => ({ ...s, keys: s.keys.filter((k) => !k.startsWith("x_")) }))
  .filter((s) => s.keys.length);
const total = proposed.reduce((n, s) => n + s.keys.length, 0);

const out = [
  "# Pick’em 玩家页文案（#1268）",
  "",
  "> 由 `copy.mjs` 从 [wireframe.html](wireframe.html) 的 `COPY` 生成，请勿直接修改本文件。改动 `COPY` 后在仓库根目录执行 `node docs/design/pickem/copy.mjs`。",
  "",
  `状态：提案，共 ${total} 条新文案。中文用语交主办确认后才能进入 \`messages/*.json\`。术语取舍见 [README](README.md#术语)。`,
  "",
  "- `{name}` 是线框里的占位符。实作时以英文原文作为 `tr()` 来源，由 `npm run i18n:extract` 生成词条，占位符按现有目录写法改为 `{value0}` 等。",
  "- 队名、轮次名与 osu! 名称保持原文，不翻译。时间由 `formatDate` 输出，不写进文案。",
  "",
  "## 沿用现有词条",
  "",
  "以下界面文字已在 `messages/*.json` 中，直接使用现有英文原文：",
  "",
  reused.map((k) => `\`${copy[k].en}\``).join("、"),
  "",
];
for (const section of proposed) {
  out.push(`## ${TITLES[section.title] ?? section.title}`, "");
  out.push(`| 键 | ${LANGS.join(" | ")} |`, `| --- | ${LANGS.map(() => "---").join(" | ")} |`);
  for (const key of section.keys)
    out.push(`| \`${key}\` | ${LANGS.map((lang) => cell(copy[key][lang])).join(" | ")} |`);
  out.push("");
}
writeFileSync(join(dir, "copy.md"), out.join("\n"));
console.log(`copy.md: ${total} proposed strings, ${reused.length} reused`);
