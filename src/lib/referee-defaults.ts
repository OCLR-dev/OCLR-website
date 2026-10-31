import type { ScoringRules } from "./competition-model";
import type { RefereeCommandPolicy } from "./referee-commands";
import type { RefereePolicy } from "./referee-model";

export type RefereeDefaults = {
  wins: number;
  policy: RefereePolicy;
  commands: Omit<RefereeCommandPolicy, "roomSize">;
};
/** S11 public rules v1.9, reviewed 2026-10-30. A draft, never persisted on read. */
export function s11RefereeDefaults(
  season: string | null,
  series: ScoringRules["series"] | null,
): RefereeDefaults | null {
  if (
    !/^s?11$/i.test(season ?? "") ||
    series?.type !== "first_to" ||
    ![6, 7].includes(series.wins)
  )
    return null;
  return {
    wins: series.wins,
    policy: {
      steps: s11RefereeSteps(series.wins, "split"),
      commands: null,
      banCategoryRules: { allowRepeats: false, repeatExceptions: ["NM", "FM"] },
    },
    commands: {
      noFail: true,
      banSeconds: 60,
      pickSeconds: 90,
      prepareSeconds: 120,
      startSeconds: null,
      categoryMods: standardRefereeCategoryMods(),
    },
  };
}

/** Placement is an explicit Admin choice: the published text only specifies 2 bans/team. */
export function s11RefereeSteps(
  wins: number,
  placement: "split" | "opening",
): RefereePolicy["steps"] {
  const step = (
    kind: "ban" | "pick" | "tb",
    actor: RefereePolicy["steps"][number]["actor"],
  ): RefereePolicy["steps"][number] => ({
    kind,
    actor,
    categories: kind === "tb" ? ["TB"] : [],
    entryIds: [],
    avoidRepeatCategory: false,
    tiedAt: kind === "tb" ? wins - 1 : null,
  });
  const first = [step("ban", "firstBan"), step("ban", "secondBan")];
  const second = [step("ban", "firstBan"), step("ban", "secondBan")];
  const picks = Array.from({ length: 2 * (wins - 1) }, (_, i) =>
    step("pick", i % 2 ? "secondPick" : "firstPick"),
  );
  return placement === "opening"
    ? [...first, ...second, ...picks, step("tb", "neutral")]
    : [
        ...first,
        ...picks.slice(0, 2),
        ...second,
        ...picks.slice(2),
        step("tb", "neutral"),
      ];
}

/** Room Mod mapping used by the simplified editor; NF is applied separately. */
export function standardRefereeCategoryMods(): RefereeCommandPolicy["categoryMods"] {
  return {
    NM: { mods: [], freemod: false },
    HD: { mods: ["HD"], freemod: false },
    HR: { mods: ["HR"], freemod: false },
    DT: { mods: ["DT"], freemod: false },
    FM: { mods: [], freemod: true },
    TB: { mods: [], freemod: true },
  };
}
