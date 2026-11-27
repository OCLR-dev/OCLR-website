import { describe, expect, it } from "vitest";
import {
  acceptBroadcastSnapshot,
  sameBroadcastSnapshot,
  shouldRevealPick,
  newPublishedPicks,
} from "../../src/components/broadcast-draft";
import type { BroadcastBoard, DraftBoard } from "../../src/lib/draft-types";

function snapshot(
  version: number,
  ids: string[] = [],
  sessionId = "test-session",
): DraftBoard {
  const team = {
    id: "test-team",
    name: "Synthetic team",
    captain: { osuId: 1, username: "Synthetic captain" },
  };
  return {
    sessionId,
    version,
    state: "live",
    turnIndex: ids.length,
    turnCount: 4,
    activeTeam: team,
    picks: ids.map((id, turnIndex) => ({
      id,
      turnIndex,
      team,
      player: { osuId: turnIndex + 2, username: "Synthetic player" },
    })),
    rosters: [],
    pool: null,
  };
}
describe("published broadcast reconciliation", () => {
  it("preserves the displayed snapshot across polling and profile timestamp refreshes", () => {
    const initial = snapshot(3, ["a"]);
    const board: BroadcastBoard = {
      ...initial,
      picks: [
        {
          ...initial.picks[0],
          player: {
            ...initial.picks[0].player,
            profile: {
              status: "fresh",
              avatarUrl: null,
              pp: 4000,
              globalRank: 30000,
              fetchedAt: null,
            },
          },
          ratings: {
            etx: 5,
            etxMods: { NM: 5 },
            sip: null,
            sipSkills: {},
            otr: null,
          },
        },
      ],
    };
    const next = structuredClone(board);
    expect(sameBroadcastSnapshot(board, next)).toBe(true);
    next.picks[0].player.profile!.fetchedAt = new Date(0).toISOString();
    expect(sameBroadcastSnapshot(board, next)).toBe(true);
    next.picks[0].player.profile!.globalRank = 29000;
    expect(sameBroadcastSnapshot(board, next)).toBe(false);
    next.picks[0].player.profile!.globalRank = 30000;
    next.picks[0].ratings!.etxMods!.NM = 6;
    expect(sameBroadcastSnapshot(board, next)).toBe(false);
    expect(sameBroadcastSnapshot(board, null)).toBe(false);
  });
  it("rejects stale revisions but accepts privacy retractions, visibility changes and new sessions", () => {
    expect(acceptBroadcastSnapshot(snapshot(3, ["a"]), snapshot(2))).toBe(
      false,
    );
    expect(acceptBroadcastSnapshot(snapshot(3), snapshot(3))).toBe(true);
    expect(acceptBroadcastSnapshot(snapshot(3), null)).toBe(true);
    expect(acceptBroadcastSnapshot(null, snapshot(1))).toBe(true);
    expect(
      acceptBroadcastSnapshot(snapshot(3), snapshot(1, [], "new-session")),
    ).toBe(true);
  });
  it("reveals only a newly published selection in the same session", () => {
    expect(shouldRevealPick(snapshot(1), snapshot(2, ["a"]))).toBe(true);
    expect(shouldRevealPick(snapshot(2, ["a"]), snapshot(3, ["a", "b"]))).toBe(
      true,
    );
    expect(shouldRevealPick(null, snapshot(2, ["a"]))).toBe(false);
    expect(shouldRevealPick(snapshot(2, ["a"]), snapshot(2, ["a"]))).toBe(
      false,
    );
    expect(shouldRevealPick(snapshot(2, ["a"]), snapshot(3, ["a"]))).toBe(
      false,
    );
    expect(shouldRevealPick(snapshot(3, ["a", "b"]), snapshot(4, ["a"]))).toBe(
      false,
    );
    expect(shouldRevealPick(snapshot(3, ["a"]), snapshot(2, ["b"]))).toBe(
      false,
    );
    expect(
      shouldRevealPick(snapshot(3, ["a"]), snapshot(1, ["b"], "new-session")),
    ).toBe(false);
    expect(shouldRevealPick(snapshot(3, ["a"]), null)).toBe(false);
  });
  it("rejects corrections, duplicate IDs, aborted drafts and reordered histories", () => {
    const previous = snapshot(2, ["a"]);
    const appended = snapshot(3, ["a", "b"]);
    const corrected = {
      ...appended,
      picks: [{ ...appended.picks[0], tier: 2 }, appended.picks[1]],
    };
    expect(newPublishedPicks(previous, corrected)).toEqual([]);
    expect(
      newPublishedPicks(snapshot(2, ["a", "b"]), snapshot(3, ["a", "c", "d"])),
    ).toEqual([]);
    expect(newPublishedPicks(snapshot(1), snapshot(2, ["a", "a"]))).toEqual([]);
    expect(
      newPublishedPicks(snapshot(1), {
        ...snapshot(2, ["a"]),
        state: "aborted",
      }),
    ).toEqual([]);
    expect(
      newPublishedPicks(snapshot(2, ["a", "b"]), snapshot(3, ["b", "a", "c"])),
    ).toEqual([]);
    expect(
      newPublishedPicks(snapshot(1, ["a"]), snapshot(2, ["a", "b", "c"])).map(
        (p) => p.id,
      ),
    ).toEqual(["b", "c"]);
  });
});
