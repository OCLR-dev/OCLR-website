import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { english } from "../../src/i18n/translate";
import { edition } from "../fixtures/edition";
import Schedule from "../../src/app/tournaments/[edition]/schedule/page";
import {
  publicCompetition,
  type PublicFixture,
} from "../../src/lib/public-competition";
import { calculateStandings } from "../../src/lib/standings";
import type { StandingsRules } from "../../src/lib/competition-model";
vi.mock("../../src/i18n/server", () => ({
  getAppTranslations: async () => english,
}));
vi.mock("../../src/i18n/shared", () => ({ useAppTranslations: () => english }));
vi.mock("../../src/lib/content", () => ({
  getPublicEdition: async () => edition,
}));
vi.mock("../../src/components/historical-archive", () => ({
  historicalPage: async () => null,
}));
vi.mock("../../src/lib/public-competition", () => ({
  publicCompetition: vi.fn(),
}));
const teams = [
  { id: "red", name: "Red" },
  { id: "blue", name: "Blue" },
  { id: "green", name: "Green" },
];
function fixture(
  home = teams[0],
  away = teams[1],
  score: [number, number] = [2, 1],
): PublicFixture {
  return {
    id: `${home.id}-${away.id}`,
    label: "Synthetic Fixture",
    pool: null,
    publishedAt: "2026-01-01T00:00:00Z",
    roundId: "round",
    roundName: "Round 1",
    roundPosition: 1,
    stageId: "stage",
    stage: "group",
    position: 1,
    home: { team: home, label: home.name, sourceId: null, outcome: null },
    away: { team: away, label: away.name, sourceId: null, outcome: null },
    confirmed: true,
    scheduledAt: "2026-12-01T12:00:00Z",
    timeZone: "UTC",
    status: "scheduled",
    result: {
      revision: 1,
      homeWins: score[0],
      awayWins: score[1],
      tiedMaps: 0,
      winnerTeamId:
        score[0] === score[1] ? null : score[0] > score[1] ? home.id : away.id,
      draw: score[0] === score[1],
      games: [],
      mpId: 123,
      mpUrl: "https://osu.ppy.sh/community/matches/123",
      publicNote: "",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    updatedAt: "2026-01-01T00:00:00Z",
  };
}
const policy: StandingsRules = {
  version: "test",
  winPoints: 3,
  lossPoints: 0,
  drawPoints: 1,
  tiebreakers: ["points", "map_difference"],
};
function competition(fixtures: PublicFixture[], rules: StandingsRules | null) {
  return {
    fixtures,
    groups: [
      {
        key: "A",
        name: "Group A",
        version: "test",
        ...calculateStandings(teams, fixtures, new Map([["round", rules]])),
      },
    ],
    databaseAuthority: true,
  };
}
async function render() {
  const element = await Schedule({
    params: Promise.resolve({ edition: edition.slug }),
    searchParams: Promise.resolve({}),
  });
  return new Response(await renderToReadableStream(element)).text();
}
describe("published schedule semantics", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => vi.unstubAllGlobals());
  it("labels a cancelled confirmed fixture in both the chart and match table", async () => {
    const match = { ...fixture(), status: "cancelled" as const, result: null };
    vi.mocked(publicCompetition).mockResolvedValue(
      competition([match], policy),
    );
    const html = await render();
    expect(html.match(/Cancelled/g)).toHaveLength(2);
    expect(html).toContain('data-status="cancelled"');
    expect(html).toContain(`/tournaments/${edition.slug}/matches/${match.id}`);
  });
  it("retains pending ranks instead of inferring ranks from wins", async () => {
    vi.mocked(publicCompetition).mockResolvedValue(
      competition([fixture()], null),
    );
    const html = await render();
    expect(html).toContain("Ranking pending:");
    expect(html).not.toMatch(/<td>\d+<\/td><th scope="row">/);
  });
  it("preserves published points, map-difference ordering, and edition-scoped team links", async () => {
    vi.mocked(publicCompetition).mockResolvedValue(
      competition(
        [
          fixture(teams[0], teams[2], [2, 1]),
          fixture(teams[1], teams[2], [5, 0]),
        ],
        policy,
      ),
    );
    const html = await render();
    const standings =
      html.match(/<table><caption>Group A<\/caption>.*?<\/table>/s)?.[0] ?? "";
    expect(standings).toMatch(/>Blue<\/a>.*>Red<\/a>/s);
    expect(standings).toContain(`/tournaments/${edition.slug}/teams/blue`);
    expect(html).not.toContain("Ranking pending:");
  });
  it("keeps equal authoritative ranks tied", async () => {
    vi.mocked(publicCompetition).mockResolvedValue(
      competition([fixture(teams[0], teams[1], [1, 1])], policy),
    );
    const html = await render();
    expect(html.match(/<td>1<\/td><th scope="row">/g)).toHaveLength(2);
  });
  it("does not invent rankings when groups have not been published", async () => {
    vi.mocked(publicCompetition).mockResolvedValue({
      fixtures: [fixture()],
      groups: [],
      databaseAuthority: true,
    });
    expect(await render()).toContain(
      "Groups and ranking rules await publication. No ranking is assumed.",
    );
  });
});
