import { describe, it, expect } from "vitest";
import { workspace, id } from "../components/referee-panel-data";
import {
  validateRefereeAction,
  projectReferee,
  type RefereeEvent,
} from "../../src/lib/referee-model";
import {
  planMpResults,
  gameHash,
  type MpReceipt,
} from "../../src/lib/referee-mp-model";
import { mpSource } from "../fixtures/referee-mp";
function prepared() {
  const w = workspace();
  w.teams[0].members = [{ osuId: 1001, username: "Synthetic A" }];
  w.teams[1].members = [{ osuId: 2001, username: "Synthetic B" }];
  w.policy!.commands!.noFail = true;
  for (const entryId of [w.maps[0].id, w.maps[1].id]) {
    const payload = validateRefereeAction(
      { ...w.session!.basis, orders: w.session!, events: w.events },
      { action: "record_selection", entryId },
    );
    w.events.push({
      id: id(1000 + w.events.length),
      ordinal: w.events.length + 1,
      actorId: 1,
      createdAt: "2026-10-31T00:00:00.000Z",
      payload,
    });
  }
  w.projection = projectReferee({
    ...w.session!.basis,
    orders: w.session!,
    events: w.events,
  });
  return w;
}
describe("automatic MP result plan", () => {
  it("scores the uniquely timed current pick using roster identities and effective Mods", () => {
    const w = prepared(),
      s = mpSource(w),
      plan = planMpResults(w, s, [], new Set());
    expect(plan.score).toHaveLength(1);
    expect(plan.score[0].winnerTeamId).toBe(w.teams[0].id);
    expect(plan.issues).toEqual([]);
  });
  it("counts an ended game in an open lobby but rejects genuine source warnings or an active game", () => {
    const w = prepared(),
      source = mpSource(w);
    expect(source.match.endTime).toBeNull();
    expect(source.warnings.length).toBe(1);
    expect(planMpResults(w, source, [], new Set()).score).toHaveLength(1);
    source.currentGameId = source.games[0].id;
    expect(planMpResults(w, source, [], new Set()).score).toHaveLength(0);
    source.currentGameId = null;
    source.warnings.push("Conflicting duplicate events were returned by osu!.");
    expect(planMpResults(w, source, [], new Set()).score).toHaveLength(0);
  });
  for (const scenario of [
    "replay",
    "tie",
    "failed",
    "unknown player",
    "mods",
    "incomplete",
    "old game",
    "unfinished",
    "missing end",
    "overlapping rosters",
  ]) {
    it(`does not invent a point for ${scenario}`, () => {
      const w = prepared(),
        s = mpSource(w);
      if (scenario === "replay") s.games.push({ ...s.games[0], id: 880002 });
      if (scenario === "tie") s.games[0].scores[1].total = 900;
      if (scenario === "failed") s.games[0].scores[0].passed = false;
      if (scenario === "unknown player") s.games[0].scores[0].osuId = 9999;
      if (scenario === "mods") s.games[0].scores[0].mods = ["HR"];
      if (scenario === "incomplete") s.complete = false;
      if (scenario === "old game")
        s.games[0].startTime = "2020-01-01T00:00:00.000Z";
      if (scenario === "unfinished") s.games[0].endTime = null;
      if (scenario === "missing end") s.games[0].startTime = null;
      if (scenario === "overlapping rosters")
        w.teams[1].members = w.teams[0].members;
      expect(planMpResults(w, s, [], new Set()).score).toHaveLength(0);
    });
  }
  it("withdraws only its own automatic point after source changes, and never replaces a human decision", () => {
    const w = prepared(),
      s = mpSource(w),
      pick = w.projection.activeSelections[1];
    const receipt: MpReceipt = {
      attemptId: pick.id,
      pickId: pick.id,
      matchId: s.match.id,
      gameId: s.games[0].id,
      gameHash: gameHash(s.games[0]),
      eventId: id(2000),
      review: false,
    };
    const event: RefereeEvent = {
      id: id(2000),
      ordinal: 4,
      actorId: 1,
      createdAt: s.fetchedAt,
      payload: {
        type: "attempt_resolved",
        pickId: pick.id,
        attemptId: pick.id,
        status: "completed",
        winnerTeamId: w.teams[0].id,
      },
    };
    w.events.push(event);
    w.projection = projectReferee({
      ...w.session!.basis,
      orders: w.session!,
      events: w.events,
    });
    s.complete = false;
    expect(planMpResults(w, s, [receipt], new Set()).invalidate).toEqual([]);
    expect(planMpResults(w, s, [receipt], new Set()).issues[0].reason).toBe(
      "incomplete",
    );
    s.complete = true;
    s.games[0].scores[1].total = 1000;
    expect(planMpResults(w, s, [receipt], new Set()).invalidate).toEqual([
      receipt,
    ]);
    s.games[0].endTime = null;
    expect(planMpResults(w, s, [receipt], new Set()).invalidate).toEqual([
      receipt,
    ]);
    w.events.push({ ...event, id: id(2001), ordinal: 5 });
    expect(planMpResults(w, s, [receipt], new Set()).invalidate).toEqual([]);
  });
  it("resumes later automatic games after a replay is resolved manually", () => {
    const w = prepared(),
      first = w.projection.activeSelections[1],
      aborted = id(3000),
      replay = id(3001),
      manual = id(3002),
      next = id(3003);
    const source = mpSource(w);
    const row: MpReceipt = {
      attemptId: first.id,
      pickId: first.id,
      matchId: source.match.id,
      gameId: source.games[0].id,
      gameHash: gameHash(source.games[0]),
      eventId: aborted,
      review: true,
    };
    const add = (eventId: string, payload: RefereeEvent["payload"]) =>
      w.events.push({
        id: eventId,
        ordinal: w.events.length + 1,
        actorId: 1,
        createdAt: "2026-10-31T00:00:00.000Z",
        payload,
      });
    add(aborted, {
      type: "attempt_resolved",
      pickId: first.id,
      attemptId: first.id,
      status: "aborted",
      winnerTeamId: null,
    });
    add(replay, { type: "attempt_replayed", pickId: first.id });
    add(manual, {
      type: "attempt_resolved",
      pickId: first.id,
      attemptId: replay,
      status: "completed",
      winnerTeamId: w.teams[0].id,
    });
    add(next, {
      type: "selection_recorded",
      stepIndex: 2,
      kind: "pick",
      teamId: w.teams[1].id,
      entryId: w.maps[2].id,
      beatmapId: w.maps[2].beatmapId,
      category: w.maps[2].category,
    });
    w.projection = projectReferee({
      ...w.session!.basis,
      orders: w.session!,
      events: w.events,
    });
    const later = mpSource(w, { gameId: 880010 });
    expect(
      planMpResults(w, later, [row], new Set()).score.map((s) => s.pickId),
    ).toEqual([next]);
  });
  it("rejects reused games and explicit replay attempts while keeping unrelated games for review", () => {
    const w = prepared(),
      s = mpSource(w);
    expect(planMpResults(w, s, [], new Set([880001])).issues[0].reason).toBe(
      "already_used",
    );
    w.projection.activeSelections[1].attempts.push({
      id: id(2000),
      number: 2,
      status: "pending",
      winnerTeamId: null,
    });
    expect(planMpResults(w, s, [], new Set()).issues[0].reason).toBe("replay");
    s.games[0].beatmapId = 999999;
    expect(
      planMpResults(w, s, [], new Set()).issues.some(
        (i) => i.reason === "unmatched",
      ),
    ).toBe(true);
  });
});
