import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import {
  dueRatingDay,
  runDailyRatingRefresh,
} from "../../scripts/rating-scheduler";

it("catches up after noon Taipei time and waits for noon after midnight UTC", () => {
  expect(dueRatingDay(new Date("2026-11-17T03:59:59Z"))).toBeNull();
  expect(dueRatingDay(new Date("2026-11-17T04:00:00Z"))).toBe("2026-11-17");
  expect(dueRatingDay(new Date("2026-11-17T23:55:00Z"))).toBe("2026-11-17");
  expect(dueRatingDay(new Date("2026-11-18T00:00:00Z"))).toBeNull();
});

it("runs the other providers after a failure and avoids repeating that day's work after a restart", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "oclr-ratings-test-"));
  try {
    const env = { SIP_API_TOKEN: "test-token", OTR_API_KEY: "test-key" };
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error())
      .mockResolvedValue(true);
    await runDailyRatingRefresh({ day: "2026-11-17", stateDir, env, run });
    expect(run.mock.calls.map(([provider]) => provider.name)).toEqual([
      "sip",
      "otr",
      "etx",
    ]);

    const afterRestart = vi.fn().mockResolvedValue(true);
    await runDailyRatingRefresh({
      day: "2026-11-17",
      stateDir,
      env,
      run: afterRestart,
    });
    expect(afterRestart).not.toHaveBeenCalled();
    await runDailyRatingRefresh({
      day: "2026-11-18",
      stateDir,
      env: {},
      run: afterRestart,
    });
    expect(afterRestart).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "etx" }),
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
