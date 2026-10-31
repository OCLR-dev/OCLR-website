import React from "react";
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { english } from "../../src/i18n/translate";
import {
  summarizePlayerCompetition,
  type CompetitionEditionRecord,
} from "../../src/lib/player-competition-model";
vi.mock("../../src/i18n/shared", () => ({ useAppTranslations: () => english }));
import { PlayerCompetition } from "../../src/components/player-competition";
it("shows a structured placement range without turning it into a precise finish", () => {
  const record: CompetitionEditionRecord = {
    editionSlug: "s5",
    editionName: "Synthetic S5",
    season: "5",
    team: { id: "alpha", name: "Synthetic Alpha" },
    coachedTeams: [],
    role: "player",
    sourceRole: null,
    tier: null,
    captain: false,
    placing: null,
    placingRange: { start: 9, end: 12, official: false, tied: false },
    groupRank: null,
    finish: { label: "1", derived: true },
    champion: false,
    runnerUp: false,
    thirdPlace: false,
    matches: [],
    unavailable: false,
  };
  const summary = summarizePlayerCompetition([record]);
  const html = renderToStaticMarkup(<PlayerCompetition record={summary} />);
  expect(html).toContain("9–12");
  expect(html).toContain("Final placement");
  expect(html).not.toContain("Derived placement");
  expect(summary.bestPlacing).toBeNull();
  expect(summary.worstPlacing).toBeNull();
  const unknown = renderToStaticMarkup(
    <PlayerCompetition
      record={summarizePlayerCompetition([
        { ...record, placingRange: null, finish: null },
      ])}
    />,
  );
  expect(unknown).not.toContain("9–12");
  expect(unknown).toContain("—");
});

it("round-trips placement ranges through the saved public identity contract", async () => {
  const { oclrParticipationSchema } =
    await import("../../src/lib/read-api-contract");
  const row = {
    osuId: 123,
    username: "Synthetic",
    editionSlug: "s5",
    editionName: "Synthetic S5",
    team: null,
    captain: false,
    participation: "historical",
    placing: null,
    placingRange: { start: 9, end: 12, official: false, tied: false },
  };
  expect(oclrParticipationSchema.parse(row).placingRange).toEqual(
    row.placingRange,
  );
  expect(
    oclrParticipationSchema.safeParse({
      ...row,
      placingRange: { ...row.placingRange, start: 13 },
    }).success,
  ).toBe(false);
});
