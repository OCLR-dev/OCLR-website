import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RemotePublicCache,
  cachePublicOperation,
  publicCacheLifetime,
} from "../../src/lib/remote-public-cache";
import { remoteHealthMonitor } from "../../src/lib/remote-health";
import { remoteRetrySeconds } from "../../src/lib/remote-retry";
import { readOperations } from "../../src/lib/read-api-operations";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("bounded public development snapshots", () => {
  it("shares concurrent loads, isolates returned objects and expires without extending the lifetime on hits", async () => {
    const cache = new RemotePublicCache();
    const load = vi.fn(async () => ({ revision: 1 }));
    const [a, b] = await Promise.all([
      cache.read("site", load),
      cache.read("site", load),
    ]);
    a.revision = 7;
    expect(b.revision).toBe(1);
    vi.advanceTimersByTime(publicCacheLifetime - 1);
    expect((await cache.read("site", load)).revision).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await cache.read("site", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("does not let in-flight work repopulate an invalidated cache or leak between sessions", async () => {
    const cache = new RemotePublicCache();
    let finish!: (value: number) => void;
    const pending = cache.read(
      "site",
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    await Promise.resolve();
    cache.clear();
    finish(1);
    await pending;
    expect(await cache.read("site", async () => 2)).toBe(2);
    expect(await new RemotePublicCache().read("site", async () => 3)).toBe(3);
    await expect(
      cache.read("failed", async () => {
        throw Error("unavailable");
      }),
    ).rejects.toThrow();
    expect(await cache.read("failed", async () => 4)).toBe(4);
  });
  it("evicts bounded entries and never retains oversized responses", async () => {
    const cache = new RemotePublicCache();
    for (let i = 0; i < 129; i++) await cache.read(String(i), async () => i);
    expect(await cache.read("0", async () => 999)).toBe(999);
    const large = vi.fn(async () => "x".repeat(4 * 1024 * 1024));
    await cache.read("large", large);
    await cache.read("large", large);
    expect(large).toHaveBeenCalledTimes(2);
  });
  it("excludes identity, private workspaces, live drafts, messages and binary media", () => {
    for (const op of readOperations.filter(
      (op) =>
        !op.public ||
        op.binary ||
        [
          "publicDraft",
          "publicBroadcastDraft",
          "publicPlayerMessages",
        ].includes(op.id),
    ))
      expect(cachePublicOperation(op), op.id).toBe(false);
    for (const id of [
      "getPublicSite",
      "getPublicTournament",
      "publicEnrollment",
    ])
      expect(
        cachePublicOperation(readOperations.find((op) => op.id === id)!),
      ).toBe(true);
  });
});
describe("remote health recovery", () => {
  const healthy = () =>
    Response.json({
      identity: { access: { scopes: ["tournaments:private:read"] } },
    });
  it("coalesces focus/interval checks and recovers once without refreshing on repeated failures", async () => {
    let finish!: (response: Response) => void;
    const read = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const failed = vi.fn(),
      recovered = vi.fn();
    const monitor = remoteHealthMonitor({
      privatePage: false,
      read,
      failed,
      recovered,
    });
    const first = monitor.check();
    await monitor.check();
    expect(read).toHaveBeenCalledTimes(1);
    finish(Response.json({ code: "REMOTE_UNAVAILABLE" }, { status: 503 }));
    await first;
    expect(recovered).not.toHaveBeenCalled();
    await monitor.check();
    expect(read).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15000);
    const second = monitor.check();
    finish(healthy());
    await second;
    expect(recovered).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15000);
    const third = monitor.check();
    finish(healthy());
    await third;
    expect(recovered).toHaveBeenCalledTimes(1);
  });
  it("honors Retry-After, handles server-rendered errors and stops after revoked access", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { code: "RATE_LIMITED" },
          { status: 429, headers: { "Retry-After": "90" } },
        ),
      )
      .mockImplementation(async () => healthy());
    const recovered = vi.fn(),
      failed = vi.fn();
    const monitor = remoteHealthMonitor({
      privatePage: false,
      initialFailure: true,
      read,
      recovered,
      failed,
    });
    await monitor.check();
    vi.advanceTimersByTime(89999);
    await monitor.check();
    expect(read).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await monitor.check();
    expect(recovered).toHaveBeenCalledTimes(1);
    read.mockResolvedValue(
      Response.json({ code: "REMOTE_EXPIRED" }, { status: 401 }),
    );
    vi.advanceTimersByTime(15000);
    await monitor.check();
    expect(failed).toHaveBeenLastCalledWith("REMOTE_EXPIRED");
    vi.advanceTimersByTime(120000);
    await monitor.check();
    expect(read).toHaveBeenCalledTimes(3);
  });
  it("backs off network failures, rejects missing private scope and ignores disposed responses", async () => {
    const read = vi.fn().mockRejectedValue(Error("network"));
    const failed = vi.fn(),
      recovered = vi.fn();
    const monitor = remoteHealthMonitor({
      privatePage: true,
      read,
      failed,
      recovered,
    });
    await monitor.check();
    vi.advanceTimersByTime(15000);
    await monitor.check();
    vi.advanceTimersByTime(15000);
    await monitor.check();
    expect(read).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(15000);
    read.mockResolvedValue(Response.json({ identity: null }));
    await monitor.check();
    expect(failed).toHaveBeenLastCalledWith("REMOTE_FORBIDDEN");
    const disposed = remoteHealthMonitor({
      privatePage: false,
      read: async () => healthy(),
      failed,
      recovered,
      initialFailure: true,
    });
    const pending = disposed.check();
    disposed.dispose();
    await pending;
    expect(recovered).not.toHaveBeenCalled();
  });
  it("parses both Retry-After formats conservatively", () => {
    expect(remoteRetrySeconds("120")).toBe(120);
    expect(remoteRetrySeconds(new Date(Date.now() + 90000).toUTCString())).toBe(
      90,
    );
    expect(remoteRetrySeconds("invalid")).toBe(60);
  });
});
