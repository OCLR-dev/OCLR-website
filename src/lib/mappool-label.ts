import type { AppTranslator } from "@/i18n/translate";

/** Pool families shared by the historical archive and the public displays. */
export type MappoolKind =
  | "group"
  | "elimination"
  | "semi"
  | "finals"
  | "grand"
  | "captain"
  | "coach";

export type MappoolIdentity = { kind: MappoolKind; round?: number };

const numerals: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function roundOf(raw: string | undefined) {
  if (!raw) return undefined;
  const han = numerals[raw];
  if (han) return han;
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

// Stored archive names keep spreadsheet suffixes such as "图池" or "赛图".
const decoration = /(?:\s*图池|\s*赛图数据|\s*赛图|\s*数据|\s*图)$/u;

/**
 * Source-specific names that carry no readable round. S5 numbers rounds inside
 * separate blocks ("第一轮", "二轮", "季后赛R1"); flattening them into one
 * elimination ladder keeps the stored order and avoids duplicate labels.
 */
const aliases = new Map<string, MappoolIdentity>([
  ["第一轮赛图", { kind: "elimination", round: 1 }],
  ["二轮赛图数据", { kind: "elimination", round: 2 }],
  ["季后赛R1图池", { kind: "elimination", round: 3 }],
  ["S6ES", { kind: "elimination" }],
  ["S6FS", { kind: "finals" }],
]);

function parseStoredName(name: string): MappoolIdentity | null {
  const raw = name.trim();
  const alias = aliases.get(raw);
  if (alias) return alias;
  const bare = raw
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(decoration, "")
    .trim();
  const group = /^(?:小组赛|group\s*stage)\s*(?:第\s*)?(\d+|[一二三四五六七八九十])\s*轮?$/i.exec(
    bare,
  );
  if (group) return { kind: "group", round: roundOf(group[1]) };
  if (/^(?:小组赛|group\s*stage)$/i.test(bare)) return { kind: "group" };
  const elimination =
    /^(?:淘汰赛|elimination\s*stage)\s*(?:第\s*)?(\d+|[一二三四五六七八九十])\s*轮?$/i.exec(
      bare,
    );
  if (elimination)
    return { kind: "elimination", round: roundOf(elimination[1]) };
  if (/^(?:淘汰赛|elimination\s*stage)$/i.test(bare))
    return { kind: "elimination" };
  const roundOnly = /^第?\s*(\d+|[一二三四五六七八九十])\s*轮$/.exec(bare);
  if (roundOnly) return { kind: "elimination", round: roundOf(roundOnly[1]) };
  if (/^(?:半决赛|semi[\s-]*finals?)$/i.test(bare)) return { kind: "semi" };
  if (/^(?:总决赛|grand\s*finals?)$/i.test(bare)) return { kind: "grand" };
  if (/^(?:决赛|final(?:s|\s*stage)?)$/i.test(bare)) return { kind: "finals" };
  if (/^(?:队长资格赛|captain[\s-]*qualifier)$/i.test(bare))
    return { kind: "captain" };
  if (/^(?:教练(?:资格)?赛|coach[\s-]*qualifier)$/i.test(bare))
    return { kind: "coach" };
  return null;
}

/**
 * Read a stored pool name as its canonical family and optional round. The pool
 * id disambiguates reused names: S7 stored its semifinal as "淘汰赛" under "sf".
 */
export function parseMappoolName(
  name: string,
  id?: string,
): MappoolIdentity | null {
  const identity = parseStoredName(name);
  if (
    identity?.kind === "elimination" &&
    (id ?? "").trim().toLowerCase() === "sf"
  )
    return { kind: "semi" };
  return identity;
}

/** Translate a stored pool name; unknown names stay literal. */
export function mappoolDisplayName(
  tr: AppTranslator,
  name: string,
  id?: string,
) {
  const identity = parseMappoolName(name, id);
  if (!identity) return name;
  const round = identity.round;
  switch (identity.kind) {
    case "group":
      return round
        ? tr("Group Stage {round}", { round })
        : tr("Group Stage");
    case "elimination":
      return round
        ? tr("Elimination Stage {round}", { round })
        : tr("Elimination Stage");
    case "semi":
      return tr("Semi-Finals");
    case "finals":
      return tr("Finals");
    case "grand":
      return tr("Grand Finals");
    case "captain":
      return tr("Captain Qualifier");
    case "coach":
      return tr("Coach Qualifier");
    default:
      return name;
  }
}
