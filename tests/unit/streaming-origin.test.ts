import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  streamingOrigins,
  createStreamingToken,
} from "../../src/lib/streaming-api";
import {
  streamingOriginAllowed,
  sameStreamingOrigin,
} from "../../src/lib/streaming-origin-model";
import {
  streamingReturnPath,
  streamingOAuthReturn,
} from "../../src/lib/streaming-connect-model";
import { readDataResponse } from "../../src/lib/developer-api-http";
import { createStreamingAccessWrite } from "../../src/lib/streaming-write-contract";

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://oclr.example.test");
  vi.stubEnv("OCLR_STREAMING_ORIGINS", undefined);
  // The Streaming policy must never fall through to the separate Developer policy.
  vi.stubEnv("OCLR_DEVELOPER_PORTS", "3000");
});
afterEach(() => vi.unstubAllEnvs());
const connection = (origin: string) =>
  `/streaming/s11/connect?${new URLSearchParams({ origin, state: "x".repeat(43) })}`;
const response = (origin: string | null, method = "OPTIONS") =>
  readDataResponse(
    new Request(
      "https://oclr.example.test/api/v1/streaming/tournaments/s11/next",
      {
        method,
        headers:
          origin === null
            ? {}
            : {
                Origin: origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization",
              },
      },
    ),
    "identity:read",
    async () => ({ data: { synthetic: true } }),
    {
      origins: streamingOrigins,
      authenticate: async () => ({ subject: "synthetic" }),
    },
  );

describe("Streaming custom-port policy", () => {
  it.each([
    "http://127.0.0.1:3001",
    "http://localhost:3011",
    "https://127.0.0.1:65535",
    "http://[::1]:43123",
    "http://localhost",
  ])(
    "accepts canonical %s throughout connect, issuance validation and CORS",
    async (origin) => {
      expect(streamingOrigins()).toBeNull();
      expect(
        createStreamingAccessWrite.request.safeParse({
          editionSlug: "s11",
          origin,
        }).success,
      ).toBe(true);
      expect(streamingReturnPath(connection(origin), streamingOrigins())).toBe(
        connection(origin),
      );
      for (const method of ["OPTIONS", "GET"]) {
        const result = await response(origin, method);
        expect(result.status).toBe(method === "OPTIONS" ? 204 : 200);
        expect(result.headers.get("Access-Control-Allow-Origin")).toBe(origin);
        expect(result.headers.has("Access-Control-Allow-Credentials")).toBe(
          false,
        );
      }
    },
  );
  it.each([
    "null",
    "*",
    "http://localhost:0",
    "http://localhost:65536",
    "http://localhost:1.5",
    "http://localhost:3011/",
    "http://localhost:3011/control",
    "http://user@localhost:3011",
    "http://localhost:3011?x=1",
    "http://localhost:3011#x",
    "http://localhost.evil.example:3011",
    "http://127.0.0.1.evil.example:3011",
    "http://192.168.1.2:3011",
    "https://evil.example",
    "file://localhost",
  ])("rejects %s even without a configured list", async (origin) => {
    expect(streamingOriginAllowed(origin, null)).toBe(false);
    expect(
      createStreamingAccessWrite.request.safeParse({
        editionSlug: "s11",
        origin,
      }).success,
    ).toBe(false);
    expect(streamingReturnPath(connection(origin), null)).toBeNull();
    const result = await response(origin);
    expect(result.status).toBe(403);
    expect(result.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
  it("preserves administrator scheme/port restrictions and rechecks OAuth return against current policy", async () => {
    const origin = "http://localhost:3011";
    const path = connection(origin);
    const context = Buffer.from(
      JSON.stringify({ stateHash: "synthetic", returnTo: path }),
    ).toString("base64url");
    expect(streamingOAuthReturn(context, "synthetic", streamingOrigins())).toBe(
      path,
    );
    vi.stubEnv(
      "OCLR_STREAMING_ORIGINS",
      " http://localhost:3001,http://localhost:3001 ",
    );
    expect(streamingOrigins()).toEqual(["http://localhost:3001"]);
    expect(
      streamingOAuthReturn(context, "synthetic", streamingOrigins()),
    ).toBeNull();
    expect((await response(origin)).status).toBe(403);
    expect((await response("http://127.0.0.1:3001")).status).toBe(204);
    expect((await response("http://localhost:3001")).status).toBe(204);
    // Denial happens before any database access or credential issuance.
    await expect(
      createStreamingToken({} as never, { editionSlug: "s11", origin }),
    ).rejects.toMatchObject({ status: 403, code: "ORIGIN_NOT_ALLOWED" });
    expect((await response(null, "GET")).status).toBe(200);
  });
  it.each(["http://localhost:3011", "http://127.0.0.1:3011"])(
    "treats localhost and IPv4 loopback as aliases of %s without rewriting browser targets",
    async (configured) => {
      vi.stubEnv("OCLR_STREAMING_ORIGINS", configured);
      for (const origin of ["http://localhost:3011", "http://127.0.0.1:3011"]) {
        expect(sameStreamingOrigin(origin, configured)).toBe(true);
        expect(
          streamingReturnPath(connection(origin), streamingOrigins()),
        ).toBe(connection(origin));
        const result = await response(origin);
        expect(result.status).toBe(204);
        expect(result.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      }
      for (const origin of [
        "https://localhost:3011",
        "http://localhost:3012",
        "http://[::1]:3011",
        "http://localhost.evil.example:3011",
      ]) {
        expect(sameStreamingOrigin(origin, configured)).toBe(false);
        expect((await response(origin)).status).toBe(403);
      }
    },
  );
  it.each([
    "",
    " ",
    "*",
    "http://localhost:0",
    "https://evil.example",
    Array.from({ length: 21 }, (_, i) => `http://localhost:${3001 + i}`).join(
      ",",
    ),
  ])("fails closed on invalid explicit configuration %s", async (value) => {
    vi.stubEnv("OCLR_STREAMING_ORIGINS", value);
    expect(streamingOrigins).toThrow();
    const result = await response("http://localhost:3011");
    expect(result.status).toBe(503);
    expect(result.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});
