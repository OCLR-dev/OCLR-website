import { describe, expect, it } from "vitest";
import {
  focusedTournamentStage,
  tournamentStageView,
  tournamentStages,
  type PlannedStage,
} from "../../src/lib/tournament-stages";
const phase = (id: string, at?: string): PlannedStage => ({
  id,
  label: id,
  at,
  href: "#schedule",
  action: "View schedule",
});
const now = Date.parse("2026-11-28T12:00:00Z");
describe("public tournament stage chronology", () => {
  it("keeps past and future dates without declaring scheduled events completed", () => {
    const result = tournamentStages(
      [
        phase("final", "2027-01-10"),
        phase("registration", "2026-11-23"),
        phase("draft", "2026-11-28"),
      ],
      { ...phase("draft"), phaseId: "draft" },
      now,
    );
    expect(result.map(({ id, state }) => [id, state])).toEqual([
      ["registration", "past"],
      ["draft", "current"],
      ["final", "upcoming"],
    ]);
  });
  it("retains undated plans without treating them as completed", () => {
    const result = tournamentStages(
      [phase("unknown"), phase("invalid", "invalid")],
      phase("current"),
      now,
    );
    expect(result.map((s) => s.state)).toEqual([
      "current",
      "planned",
      "planned",
    ]);
  });
  it("matches the registration ID independently of a translated label and keeps its live action", () => {
    const result = tournamentStages(
      [phase("registration", "2026-11-23")],
      {
        label: "报名阶段",
        href: "/register",
        action: "个人报名",
        phaseId: "registration",
      },
      now,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "registration",
      label: "报名阶段",
      href: "/register",
      state: "current",
    });
  });
  it("inserts a published active stage between earlier and upcoming plans", () => {
    const result = tournamentStages(
      [phase("past", "2026-11-01"), phase("future", "2026-12-01")],
      phase("live"),
      now,
    );
    expect(result.map((s) => s.label)).toEqual(["past", "live", "future"]);
  });
  it("focuses the next dated milestone during a gap and the last dated item after the schedule ends", () => {
    const stages = [
      phase("previous", "2026-11-23"),
      phase("next", "2026-11-29"),
      phase("undated"),
    ];
    const next = Date.parse("2026-11-29");
    const focusedAt = (time: number) => {
      const resolved = tournamentStages(stages, null, time);
      return resolved[focusedTournamentStage(resolved)];
    };
    expect(focusedAt(now)).toMatchObject({ id: "next", state: "upcoming" });
    expect(focusedAt(next)).toMatchObject({ id: "next", state: "past" });
  });
  it("uses the nearest configured boundary, including the end of an active interval", () => {
    const opens = "2026-11-20";
    const closes = "2026-11-29";
    const draft = "2026-12-01";
    const stages = [
      { ...phase("registration", opens), interval: true, endAt: closes },
      phase("draft", draft),
      phase("undated"),
    ];
    const nextChange = (time: number) =>
      tournamentStageView(stages, null, time).nextStageChangeAt;
    expect(nextChange(now)).toBe(Date.parse(closes));
    expect(nextChange(Date.parse(closes))).toBe(Date.parse(draft));
    expect(nextChange(Date.parse(draft))).toBeUndefined();
  });
});
