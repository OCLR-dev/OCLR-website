import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approvedBeatmapMirror,
  cacheMirrorOptions,
  downloadBeatmapMirror,
} from "../../src/lib/beatmap-cache-mirror";

const { resolve4, request } = vi.hoisted(() => ({
  resolve4: vi.fn(),
  request: vi.fn(),
}));
vi.mock("node:dns/promises", () => ({
  Resolver: class {
    resolve4 = resolve4;
    cancel() {}
  },
}));
vi.mock("node:https", () => ({ request }));

function respond(
  statusCode: number,
  headers: Record<string, string>,
  bytes = Buffer.from("archive"),
) {
  request.mockImplementationOnce((_options, respond) =>
    Object.assign(new EventEmitter(), {
      end() {
        respond(
          Object.assign(Readable.from([bytes]), {
            statusCode,
            headers,
            complete: true,
          }),
        );
      },
    }),
  );
}

describe("beatmap mirror transport", () => {
  const origin = new URL("https://dl.sayobot.cn/beatmaps/download/full/75");
  beforeEach(() => {
    resolve4.mockReset().mockResolvedValue(["93.184.216.34"]);
    request.mockReset();
  });

  it("offers direct mirrors and uses the approved redirect port with TLS and the pinned address", async () => {
    expect(cacheMirrorOptions(0, null)).toEqual([]);
    expect(
      cacheMirrorOptions(75, "https://unapproved.test/private"),
    ).toHaveLength(3);
    respond(302, {
      location: "https://tc1.sayobot.cn:25225/beatmaps/0/75/full",
    });
    respond(200, {});
    await expect(
      downloadBeatmapMirror(origin, new AbortController().signal),
    ).resolves.toEqual(Buffer.from("archive"));
    expect(request.mock.calls[1][0]).toMatchObject({
      hostname: "93.184.216.34",
      port: "25225",
      servername: "tc1.sayobot.cn",
      headers: { Host: "tc1.sayobot.cn:25225" },
      rejectUnauthorized: true,
    });
    expect(
      approvedBeatmapMirror("https://tc1.sayobot.cn:8443/beatmaps"),
    ).toBeNull();
  });

  it("rejects unapproved redirects and nonpublic resolution before connecting", async () => {
    respond(302, { location: "https://unapproved.test/resource" });
    await expect(
      downloadBeatmapMirror(origin, new AbortController().signal, [
        new URL("https://catboy.best/d/75"),
      ]),
    ).rejects.toMatchObject({ status: 422 });
    expect(request).toHaveBeenCalledTimes(1);
    request.mockClear();
    resolve4.mockResolvedValue(["10.10.1.1"]);
    await expect(
      downloadBeatmapMirror(origin, new AbortController().signal),
    ).rejects.toMatchObject({ status: 422 });
    expect(request).not.toHaveBeenCalled();
  });

  it("tries approved mirrors in order when the selected source is rate limited or unavailable", async () => {
    respond(429, { "retry-after": "3600" });
    respond(502, {});
    respond(200, { "content-type": "application/octet-stream" });
    await expect(
      downloadBeatmapMirror(
        new URL("https://beatconnect.io/b/75"),
        new AbortController().signal,
        [origin, new URL("https://catboy.best/d/75")],
      ),
    ).resolves.toEqual(Buffer.from("archive"));
    expect(request.mock.calls.map(([options]) => options.servername)).toEqual([
      "beatconnect.io",
      "dl.sayobot.cn",
      "catboy.best",
    ]);
    expect(
      new Set(request.mock.calls.map(([options]) => options.signal)).size,
    ).toBe(1);
  });

  it("reports a rate limit if the only mirror was rate limited", async () => {
    respond(429, { "retry-after": "3600" });
    await expect(
      downloadBeatmapMirror(origin, new AbortController().signal),
    ).rejects.toMatchObject({ status: 429 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects oversize and partial HTTP bodies", async () => {
    respond(200, { "content-length": String(65 * 1024 ** 2) });
    await expect(
      downloadBeatmapMirror(origin, new AbortController().signal),
    ).rejects.toMatchObject({ status: 413 });
    respond(206, {});
    await expect(
      downloadBeatmapMirror(origin, new AbortController().signal),
    ).rejects.toMatchObject({ status: 502 });
  });
});
