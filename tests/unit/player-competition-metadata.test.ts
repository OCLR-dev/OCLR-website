import { expect, it, vi } from "vitest";
import { historicalArchive } from "../fixtures/historical-archive";
import { edition } from "../fixtures/edition";
import type { PublishedPlayer } from "../../src/lib/players";
vi.mock("../../src/lib/content", () => ({ getPublicEdition: vi.fn() }));
vi.mock("../../src/lib/public-competition", () => ({
  publicCompetition: vi.fn(),
}));
import { getPublicEdition } from "../../src/lib/content";
import { playerCompetitionRecord } from "../../src/lib/player-competition";

const person = (
  role: "player" | "coach",
  team: "alpha" | "beta",
  start: number,
  end = start,
): PublishedPlayer => ({
  osuId: 91003,
  username: "Synthetic same-season participant",
  editionSlug: "history-test",
  editionName: "Synthetic history",
  team: { id: team, name: `Synthetic ${team}` },
  role,
  captain: false,
  participation: "historical",
  placing: start === end ? start : null,
  placingRange: { start, end, official: false, tied: false },
});
function saved() {
  vi.mocked(getPublicEdition).mockResolvedValue({
    ...edition,
    slug: "history-test",
    archive: structuredClone(historicalArchive),
  });
}

it("prefers the playing-roster placement when a player also coached another team", async () => {
  saved();
  const record = await playerCompetitionRecord([
    person("coach", "alpha", 1),
    person("player", "beta", 2),
  ]);
  expect(record.editions[0].placingRange).toMatchObject({ start: 2, end: 2 });
  expect(record.editions[0].team?.id).toBe("beta");
  expect(record.championships).toBe(0);
  expect(record.runnerUps).toBe(1);
});

it("does not turn an unranked elimination band or coach-only placement into a podium award", async () => {
  saved();
  const band = await playerCompetitionRecord([person("player", "alpha", 3, 4)]);
  expect(band.editions[0].finish).toEqual({ label: "3–4", derived: true });
  expect(band.championships).toBe(0);
  expect(band.thirdPlaces).toBe(0);
  const coach = await playerCompetitionRecord([person("coach", "alpha", 1)]);
  expect(coach.championships).toBe(0);
  expect(coach.matches).toBe(0);
});
