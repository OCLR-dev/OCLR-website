import { NextRequest } from "next/server";
import { proxy } from "../../src/proxy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  remoteMode,
  remoteConfiguration,
  remotePageSupported,
  remoteApiSupported,
} from "../../src/lib/data-source";
import { remoteOperation } from "../../src/lib/remote-transport";
import { getPool } from "../../src/db";
import { execFileSync } from "node:child_process";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OCLR_DATA_SOURCE", "remote");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("OCLR_API_BASE_URL", "https://backend.example");
});
afterEach(() => vi.unstubAllEnvs());
describe("explicit remote frontend boundaries", () => {
  it("keeps app and API origins separate and refuses production, unknown modes and unsafe origins", () => {
    expect(remoteMode()).toBe(true);
    expect(remoteConfiguration()).toEqual({
      local: "http://localhost:3000",
      upstream: "https://backend.example",
    });
    for (const bad of [
      "http://backend.example",
      "https://user:pass@backend.example",
      "https://backend.example/path",
      "https://backend.example/?token=bad",
      "http://localhost:3000",
      "file:///tmp/api",
    ]) {
      vi.stubEnv("OCLR_API_BASE_URL", bad);
      expect(() => remoteConfiguration()).toThrow();
    }
    vi.stubEnv("OCLR_API_BASE_URL", "http://127.0.0.1:3100");
    expect(remoteConfiguration().upstream).toBe("http://127.0.0.1:3100");
    vi.stubEnv("APP_URL", "https://public.example");
    expect(() => remoteConfiguration()).toThrow();
    vi.stubEnv("NODE_ENV", "production");
    expect(() => remoteConfiguration()).toThrow();
    vi.stubEnv("OCLR_DATA_SOURCE", "typo");
    expect(() => remoteMode()).toThrow();
    vi.stubEnv("OCLR_DATA_SOURCE", "database");
    expect(remoteMode()).toBe(false);
  });
  it("allows only registered read resources and exact query keys, never arbitrary URLs or encoded paths", () => {
    expect(
      remoteOperation("/staff/tournaments/test-cup", new URLSearchParams()).id,
    ).toBe("getStaffTournament");
    for (const path of [
      "//evil.example",
      "https://evil.example/api/v1/me",
      "/../me",
      "/staff/profiles/NaN",
      "/staff/tournaments/%2e%2e",
      "/staff/tournaments/test-cup?url=bad",
      "/auth/osu",
      "/tournaments/test-cup/players/9007199254740992",
    ])
      expect(() => remoteOperation(path, new URLSearchParams())).toThrow();
    for (const query of [
      "url=https://evil.example",
      "mode=osu&mode=mania",
      "mode=bad",
    ])
      expect(() =>
        remoteOperation("/staff/profiles/123", new URLSearchParams(query)),
      ).toThrow();
    expect(remotePageSupported("/tournaments/s9/players/123")).toBe(true);
    expect(remotePageSupported("/tournaments/s9/mappools")).toBe(false);
    expect(remoteApiSupported("/api/teams/id/avatar")).toBe(false);
    expect(remoteApiSupported("/api/admin/tournaments/s11")).toBe(false);
  });
  it("rejects unsafe transport and local writes before any service; redirects unsupported pages locally", () => {
    const request = (path: string, method = "GET", headers = {}) =>
      new NextRequest(`http://localhost:3000${path}`, {
        method,
        headers: { host: "localhost:3000", ...headers },
      });
    expect(proxy(request("/api/admin/profiles", "POST")).status).toBe(403);
    expect(
      proxy(
        request("/api/remote/connection", "POST", {
          "sec-fetch-site": "cross-site",
        }),
      ).status,
    ).toBe(403);
    expect(
      proxy(request("/api/remote/connection", "POST", { host: "evil.example" }))
        .status,
    ).toBe(403);
    expect(
      proxy(
        request("/api/remote/read/me", "GET", {
          authorization: "Bearer synthetic",
        }),
      ).status,
    ).toBe(403);
    expect(proxy(request("/api/teams/123/avatar")).status).toBe(403);
    expect(
      proxy(request("/tournaments/s11/teams/unavailable.png")).status,
    ).toBe(307);
    const unsupported = proxy(request("/tournaments/s11/mappools"));
    expect(unsupported.status).toBe(307);
    expect(unsupported.headers.get("location")).toBe(
      "http://localhost:3000/remote/unsupported",
    );
    expect(unsupported.headers.get("cache-control")).toBe("no-store");
  });
  it("refuses any local database pool even with a configured URL", () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://synthetic@127.0.0.1:1/never_connect_test",
    );
    expect(() => getPool()).toThrow("Local database access is disabled");
  });
  it("fails closed in every production entry point before dry-run or other work", () => {
    for (const [script, args] of [
      ["scripts/production.sh", ["setup", "--dry-run"]],
      ["scripts/production.sh", ["start", "--dry-run"]],
      ["scripts/update.sh", ["--ref", "a".repeat(40), "--dry-run"]],
    ] as const) {
      expect(() =>
        execFileSync("bash", [script, ...args], {
          env: { ...process.env, OCLR_DATA_SOURCE: "remote" },
          stdio: "pipe",
        }),
      ).toThrow();
    }
  });
});
