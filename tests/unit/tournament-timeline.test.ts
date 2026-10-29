import { describe, expect, it } from "vitest";
import { editionSchema } from "../../src/lib/editions";
import { tournamentTimeline } from "../../src/lib/tournament-timeline";
import { tournamentStages } from "../../src/lib/tournament-stages";
import { edition } from "../fixtures/edition";
const tr = (s: string) => s;
const start = "2026-10-29T00:00:00Z",
  end = "2026-10-30T00:00:00Z";
const phase = {
  label: "Authored group",
  kind: "group" as const,
  at: start,
  endAt: end,
};
describe("competition timeline", () => {
  it("validates instants, ordering and fixed phase kinds while retaining old milestones", () => {
    const schema = editionSchema.shape.schedule;
    expect(schema.parse([...edition.schedule, phase])).toEqual([
      ...edition.schedule,
      phase,
    ]);
    for (const row of [
      { ...phase, at: "2026-02-30T00:00:00Z" },
      { ...phase, endAt: "2026-10-28T00:00:00Z" },
      { ...phase, kind: "guessed" },
    ])
      expect(schema.safeParse([row]).success).toBe(false);
    for (const row of [
      { ...phase, at: null },
      { ...phase, endAt: null },
      { ...phase, at: null, endAt: null },
    ])
      expect(schema.safeParse([row]).success).toBe(true);
  });
  it("shares literal names, dates, time zones and undated events without duplicating rows", () => {
    const model = tournamentTimeline(
      {
        ...edition,
        schedule: [
          phase,
          phase,
          { label: "Unknown final", kind: "knockout", at: null },
          ...edition.schedule,
        ],
      },
      tr,
      "en",
    );
    expect(model.schedule).toHaveLength(5);
    expect(model.stages).toHaveLength(4);
    expect(model.stages.find((s) => s.label === phase.label)?.detail).toBe(
      model.schedule.find((s) => s.event === phase.label)?.date,
    );
    expect(model.schedule.find((s) => s.event === phase.label)?.date).toContain(
      "UTC+8",
    );
    expect(
      model.schedule.find((s) => s.event === "Unknown final")?.date,
    ).toContain("TBA");
    expect(
      tournamentTimeline(
        { ...edition, registration: null, schedule: [] },
        tr,
        "en",
      ).stages,
    ).toEqual([]);
  });
  it("uses half-open intervals, gaps, overlaps and partial uncertainty without business transitions", () => {
    const model = tournamentTimeline(
      { ...edition, registration: null, schedule: [phase] },
      tr,
      "en",
    );
    const state = (now: string) =>
      tournamentStages(model.stages, null, Date.parse(now))[0].state;
    expect(state("2026-10-28")).toBe("upcoming");
    expect(state(start)).toBe("current");
    expect(state(end)).toBe("past");
    const overlap = tournamentTimeline(
      {
        ...edition,
        registration: null,
        schedule: [phase, { ...phase, label: "Other" }],
      },
      tr,
      "en",
    );
    expect(
      tournamentStages(overlap.stages, null, Date.parse(start)).map(
        (s) => s.state,
      ),
    ).toEqual(["current", "current"]);
    const gap = tournamentTimeline(
      {
        ...edition,
        registration: null,
        schedule: [
          { ...phase, endAt: "2026-10-29T01:00:00Z" },
          {
            ...phase,
            label: "Later",
            at: "2026-10-30T01:00:00Z",
            endAt: "2026-10-31T00:00:00Z",
          },
        ],
      },
      tr,
      "en",
    );
    expect(
      tournamentStages(
        gap.stages,
        null,
        Date.parse("2026-10-29T12:00:00Z"),
      ).map((s) => s.state),
    ).toEqual(["past", "upcoming"]);
    const completed = tournamentTimeline(
      {
        ...edition,
        status: "completed",
        registration: null,
        schedule: [phase],
      },
      tr,
      "en",
    );
    expect(
      tournamentStages(completed.stages, null, Date.parse(start))[0].state,
    ).toBe("planned");
    for (const row of [
      { ...phase, at: null },
      { ...phase, endAt: null },
      { ...phase, at: null, endAt: null },
    ]) {
      const m = tournamentTimeline(
        { ...edition, registration: null, schedule: [row] },
        tr,
        "en",
      );
      expect(tournamentStages(m.stages, null, Date.parse(start))[0].state).toBe(
        "planned",
      );
    }
    expect(
      tournamentStages(
        model.stages,
        { label: "Draft", href: "/draft", action: "View" },
        Date.parse(start),
      ).find((s) => s.label === phase.label)?.state,
    ).toBe("planned");
  });
});
