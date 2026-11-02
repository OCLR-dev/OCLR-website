/**
 * - Preliminary split between gameplay badges (tournament placements) and
 * - non-gameplay badges (mapping, contests, community work).
 *
 * - This is a keyword heuristic for display or review triage, not an
 * - authoritative classification: badge descriptions come from osu! and are not
 * - structured, so unknown wording stays "others".
 */
export type BadgeActivity = "gameplay" | "mapping" | "contest" | "others";

// 明确排除工作人员/职能人员（Staff 与 gameplay 无关）
const STAFF = /\b(?:staff|commentator|streamer|referee|host|organizer)\b/i;

// 创作与制图类
const MAPPING =
    /\bmapp(?:er|ing|ool)|\bbeatmaps?\b|\bmod(?:ding|der)\b|\bstoryboards?\b|\bskins?\b|\bnominators?\b|\bspotlights?\b|\bproject\s+loved\b|\bwikis?\b/i;

// 创意竞赛类（非游戏实操对战）。
// 注意：部分 contest 名称中不含 "contest" 一词，只叫 "XX Cup"（如 Pending Cup、
// Newspaper Cup、Featured Artist Cup）。这类必须在 TOURNAMENT_TERMS 的 "cup"
// 之前显式拦截，否则会被误判为 gameplay。
const CONTEST =
    /\b(?:contests?|pending\s+cup|newspaper\s+cup|featured\s+artist\s+cup)\b/i;

// 世界杯系列（World Cup 需要名次来区分选手与 Staff）
const WORLD_CUP = /\b(?:[otmc]wc|world\s+cup)\b/i;
const WORLD_CUP_PLACEMENT =
    /\b(?:1st|2nd|3rd|first|second|third|top\s?[123])\b|\b(?:winner|winning|champion|victor(?:y|ious)|runner[- ]?up)\b/i;

// 扩大泛锦标赛/杯赛/联赛关键词（覆盖 cup, tourney, championship, league 等）
const TOURNAMENT_TERMS =
    /\b(?:tournaments?|tourney|tourneys|cups?|championships?|league)\b/i;

export function classifyBadgeActivity(
    name: string | null | undefined,
): BadgeActivity {
  const badge = name?.trim();
  if (!badge) return "others";

  // 1. 工作人员职位一律不属于 gameplay
  if (STAFF.test(badge)) return "others";

  // 2. 制图/Modding 等保持 mapping
  if (MAPPING.test(badge)) return "mapping";

  // 3. 创意竞赛类（含 "XX Cup" 型 mapping contest）保持 contest。
  //    必须先于第 5 步的 TOURNAMENT_TERMS，否则 "cup" 会把它吃掉。
  if (CONTEST.test(badge)) return "contest";

  // 4. 世界杯奖牌：必须有具体名次/冠军头衔才算 gameplay（排除 OWC Staff 等）
  if (WORLD_CUP.test(badge)) {
    if (WORLD_CUP_PLACEMENT.test(badge)) return "gameplay";
    return "others";
  }

  // 5. 其他各类锦标赛、杯赛、联赛（如 yutang cup winner）统一归为 gameplay
  if (TOURNAMENT_TERMS.test(badge)) return "gameplay";

  return "others";
}

/** True only when the badge description points at a gameplay result. */
export function isGameplayBadge(name: string | null | undefined): boolean {
  return classifyBadgeActivity(name) === "gameplay";
}