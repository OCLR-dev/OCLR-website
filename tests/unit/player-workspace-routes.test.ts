import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  GET as practiceGet,
  POST as practicePost,
} from "../../src/app/api/tournaments/[edition]/player/practice/route";
import {
  GET as timetableGet,
  POST as timetablePost,
} from "../../src/app/api/tournaments/[edition]/player/availability/route";
import { requireUser } from "../../src/lib/auth/user";
import {
  assertDirectPlayerWorkspace,
  playerPracticeCommand,
  playerPracticeWorkspace,
  playerTimetableCommand,
  playerTimetableWorkspace,
} from "../../src/lib/player-workspace";
import { HttpError } from "../../src/lib/http";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/auth/user", () => ({ requireUser: vi.fn() }));
vi.mock("../../src/lib/player-workspace", () => ({
  assertDirectPlayerWorkspace: vi.fn(),
  playerPracticeCommand: vi.fn(),
  playerPracticeWorkspace: vi.fn(),
  playerTimetableCommand: vi.fn(),
  playerTimetableWorkspace: vi.fn(),
}));
const actor = { osuId: 671001, username: "Synthetic Player" };
const params = { params: Promise.resolve({ edition: "test-cup" }) };
describe("personal workspace API transport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("APP_URL", "https://example.test");
    vi.mocked(requireUser).mockResolvedValue(actor);
    vi.mocked(playerPracticeCommand).mockResolvedValue({
      saved: true,
      version: 2,
    });
    vi.mocked(playerTimetableCommand).mockResolvedValue({
      saved: true,
      version: 3,
    });
    vi.mocked(playerPracticeWorkspace).mockResolvedValue({
      actorId: actor.osuId,
      team: null,
      participants: [actor],
      readOnly: false,
      pools: [],
      pool: null,
    });
    vi.mocked(playerTimetableWorkspace).mockResolvedValue({
      actorId: actor.osuId,
      owner: actor,
      players: [actor],
      teamAvailability: [],
      timeZone: "Asia/Taipei",
      canEdit: true,
      intervals: [],
      version: 0,
      updatedAt: null,
    });
  });
  afterEach(() => vi.unstubAllEnvs());
  const request = (
    body: unknown,
    origin = "https://example.test",
    headers = {},
  ) =>
    new Request(
      "https://example.test/api/tournaments/test-cup/player/practice",
      {
        method: "POST",
        headers: { origin, "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      },
    );
  it("requires a direct browser channel before identity or data access", async () => {
    vi.mocked(assertDirectPlayerWorkspace).mockImplementation(() => {
      throw new HttpError(
        403,
        "Player workspace requires a direct browser session.",
      );
    });
    for (const handler of [
      practiceGet,
      practicePost,
      timetableGet,
      timetablePost,
    ]) {
      const result = await handler(request({}), params);
      expect(result.status).toBe(403);
      expect(result.headers.get("Cache-Control")).toContain("no-store");
    }
    expect(requireUser).not.toHaveBeenCalled();
    expect(playerPracticeWorkspace).not.toHaveBeenCalled();
    expect(playerTimetableCommand).not.toHaveBeenCalled();
  });
  it("requires sign-in and same-origin POST, rejecting bearer transport", async () => {
    for (const handler of [practicePost, timetablePost]) {
      expect(
        (await handler(request({}, "https://other.test"), params)).status,
      ).toBe(403);
      expect(
        (
          await handler(
            request({}, undefined, {
              Authorization: "Bearer synthetic-test-only",
            }),
            params,
          )
        ).status,
      ).toBe(403);
    }
    vi.mocked(requireUser).mockRejectedValue(
      new HttpError(401, "Sign in with osu! to continue."),
    );
    expect(
      (await practiceGet(new Request("https://example.test/"), params)).status,
    ).toBe(401);
    expect(playerPracticeCommand).not.toHaveBeenCalled();
  });
  it("returns the saved version for safe retries with private cache controls", async () => {
    const body = { action: "save_practice" };
    const response = await practicePost(request(body), params);
    expect(await response.json()).toEqual({ saved: true, version: 2 });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(playerPracticeCommand).toHaveBeenCalledExactlyOnceWith(
      actor,
      "test-cup",
      body,
    );
    expect(
      await (
        await timetablePost(request({ action: "save_availability" }), params)
      ).json(),
    ).toEqual({ saved: true, version: 3 });
  });
  it("selects read context explicitly and never caches personal records publicly", async () => {
    await practiceGet(
      new Request("https://example.test/?pool=test-pool"),
      params,
    );
    expect(playerPracticeWorkspace).toHaveBeenCalledWith(
      actor,
      "test-cup",
      "test-pool",
    );
    const response = await timetableGet(
      new Request("https://example.test/?player=671002"),
      params,
    );
    expect(playerTimetableWorkspace).toHaveBeenCalledWith(
      actor,
      "test-cup",
      671002,
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("limits JSON body size before dispatching personal commands", async () => {
    expect(
      (await timetablePost(request({ comment: "x".repeat(40000) }), params))
        .status,
    ).toBe(413);
    expect(playerTimetableCommand).not.toHaveBeenCalled();
  });
});
