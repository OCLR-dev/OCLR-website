import { describe, expect, it } from "vitest";
import {
  exchangeArchivePlayers,
  publicHistoricalArchive,
} from "../../src/lib/historical-archive";
import {
  archiveExchange,
  exchangeArchive,
} from "../fixtures/archive-player-exchange";

describe("confirmed historical player exchange", () => {
  it("changes only the two saved teams and appends private original-source evidence", () => {
    const before = exchangeArchive();
    const original = structuredClone(before);
    const after = exchangeArchivePlayers(before, archiveExchange);
    expect(before).toEqual(original);
    expect(after.players).toEqual(
      before.players.map((p) => ({
        ...p,
        teamId:
          p.osuId === 91991 ? "beta" : p.osuId === 91992 ? "alpha" : p.teamId,
      })),
    );
    expect({
      ...after,
      players: before.players,
      sourceFacts: before.sourceFacts,
    }).toEqual(before);
    expect(after.sourceFacts!.slice(0, -1)).toEqual(before.sourceFacts);
    expect(after.sourceFacts!.at(-1)).toMatchObject({
      source: archiveExchange.confirmationSource,
      text: expect.stringContaining("alpha → beta"),
    });
    expect(after.sourceFacts!.at(-1)!.text).toContain("Roster!J3; Roster!J7");
    expect(after.sourceFacts!.at(-1)!.text).toContain("exchange date unknown");
    expect(publicHistoricalArchive(after).sourceFacts).toBeUndefined();
    expect(publicHistoricalArchive(after).players).toEqual(after.players);
  });
  it("requires the original saved teams even when a caller has a fresh revision", () => {
    const after = exchangeArchivePlayers(exchangeArchive(), archiveExchange);
    expect(() => exchangeArchivePlayers(after, archiveExchange)).toThrow();
  });
  it.each([
    { secondOsuId: 91991 },
    { secondOsuId: 99999 },
    { secondOsuId: 91003, secondTeamId: "alpha" },
    { firstTeamId: "beta" },
    { secondTeamId: "missing" },
    { firstOsuId: 91001 },
    { secondOsuId: 91004 },
    { confirmationSource: " " },
    { firstOsuId: 0 },
    { tier: 1 },
  ])(
    "rejects invalid identities, teams, roles or unapproved fields: %j",
    (change) => {
      expect(() =>
        exchangeArchivePlayers(exchangeArchive(), {
          ...archiveExchange,
          ...change,
        }),
      ).toThrow();
    },
  );
  it("does not rewrite chronological draft picks or infer an unknown Tier", () => {
    const a = exchangeArchive();
    a.players.at(-1)!.tier = null;
    expect(
      exchangeArchivePlayers(a, archiveExchange).players.at(-1)!.tier,
    ).toBeNull();
    delete a.draftMode;
    expect(() => exchangeArchivePlayers(a, archiveExchange)).toThrow();
  });
});
