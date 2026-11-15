import { describe, it, expect } from "vitest";
import {
  compareRefereeAttempts,
  reconciliationOptions,
  unavailableGameLink,
  type ReconciliationSource,
  type ReconciliationLink,
} from "../../src/lib/referee-reconciliation-model";
import type { RefereeProjection } from "../../src/lib/referee-model";
const selection = {
  id: "pick",
  stepIndex: 0,
  kind: "pick" as const,
  teamId: "a",
  entryId: "entry",
  beatmapId: 42,
  category: "NM",
  voided: false,
  attempts: [
    {
      id: "attempt",
      number: 1,
      status: "completed" as const,
      winnerTeamId: "b",
    },
  ],
};
const projection: RefereeProjection = {
  selections: [selection],
  activeSelections: [selection],
  score: { a: 0, b: 1 },
  nextStep: null,
  complete: true,
  issues: [],
  lastSelectionId: "pick",
};
const source: ReconciliationSource = {
  importId: "import",
  fingerprint: "fp",
  matchId: 123,
  complete: true,
  current: true,
  games: [
    {
      id: 7,
      beatmapId: 42,
      winnerTeamId: "b",
      tied: false,
      ended: true,
      problems: [],
    },
  ],
};
const link: ReconciliationLink = {
  attemptId: "attempt",
  importId: "import",
  sourceFingerprint: "fp",
  gameId: 7,
  sessionRevision: 5,
  dependencyFingerprint: "dep",
};
const compare = (
  links: ReconciliationLink[],
  sources = [source],
  revision = 5,
) => compareRefereeAttempts(projection, links, sources, revision, "dep")[0];
describe("explicit referee/MP reconciliation", () => {
  it("projects saved links without leaking database receipt internals", () => {
    const row = {
      ...link,
      requestKey: "private-request-key",
      payloadHash: "private-hash",
      actorId: 999,
      fixtureId: "private-fixture",
      createdAt: new Date(),
    };
    expect(compare([row]).link).toEqual(link);
    expect(JSON.stringify(compare([row]))).not.toContain("private-");
  });
  it("does not auto-match identical map IDs", () =>
    expect(compare([]).status).toBe("unmatched"));
  it("separates picking team from winning team", () => {
    expect(compare([link]).status).toBe("matched");
    expect(compare([link]).pickTeamId).toBe("a");
    expect(compare([link]).sourceWinnerTeamId).toBe("b");
  });
  it("invalidates confirmation after ledger or source changes", () => {
    expect(compare([link], [source], 6).status).toBe("stale");
    expect(compare([link], [{ ...source, current: false }]).status).toBe(
      "stale",
    );
    expect(compare([link], [{ ...source, fingerprint: "new" }]).status).toBe(
      "stale",
    );
  });
  it("restores the exact saved game from a newer import of the same lobby", () => {
    const row = compare([link]);
    const newer = { ...source, importId: "new", fingerprint: "new-fp" };
    const historical = { ...source, current: false };
    expect(
      reconciliationOptions([row], [historical, newer])[0].savedValue,
    ).toBe("new:7");
    expect(
      reconciliationOptions([row], [historical, { ...newer, games: [] }])[0]
        .savedValue,
    ).toBe(unavailableGameLink);
  });

  it("suggests only unique plays with a matching result", () => {
    const row = compare([]);
    expect(reconciliationOptions([row], [source])[0].suggestion).toBe(
      "import:7",
    );
    const replay = { ...row, attemptId: "retry", attemptNumber: 2 };
    expect(
      reconciliationOptions([row, replay], [source]).map((r) => r.suggestion),
    ).toEqual([null, null]);
    expect(
      reconciliationOptions(
        [row],
        [
          {
            ...source,
            games: [...source.games, { ...source.games[0], id: 8 }],
          },
        ],
      )[0].suggestion,
    ).toBeNull();
    expect(
      reconciliationOptions([{ ...row, winnerTeamId: "a" }], [source])[0]
        .suggestion,
    ).toBeNull();
  });
  it("does not invent results for incomplete games", () =>
    expect(
      compare(
        [link],
        [{ ...source, games: [{ ...source.games[0], ended: false }] }],
      ).status,
    ).toBe("incomplete"));
  it("reports map and winner differences", () => {
    expect(
      compare(
        [link],
        [{ ...source, games: [{ ...source.games[0], beatmapId: 43 }] }],
      ).status,
    ).toBe("different_map");
    expect(
      compare(
        [link],
        [{ ...source, games: [{ ...source.games[0], winnerTeamId: "a" }] }],
      ).status,
    ).toBe("different_result");
  });
  it("keeps repeated attempts distinct", () => {
    const p = {
      ...projection,
      activeSelections: [
        {
          ...selection,
          attempts: [
            {
              ...selection.attempts[0],
              status: "aborted" as const,
              winnerTeamId: null,
            },
            { ...selection.attempts[0], id: "retry", number: 2 },
          ],
        },
      ],
    };
    const rows = compareRefereeAttempts(p, [link], [source], 5, "dep");
    expect(rows).toHaveLength(2);
    expect(rows[1].status).toBe("unmatched");
    expect(rows[0].status).toBe("different_result");
  });
});
