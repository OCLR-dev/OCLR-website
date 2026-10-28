import { NextRequest } from "next/server";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "../../src/db";
import {
  remoteApiSupported,
  remoteConfiguration,
  remoteMode,
  remotePageSupported,
} from "../../src/lib/data-source";
import { remoteOperation, remoteRead } from "../../src/lib/remote-transport";
import { proxy } from "../../src/proxy";
import { bundledSeasonThemes } from "../fixtures/theme-assets";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OCLR_DATA_SOURCE", "remote");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("OCLR_API_BASE_URL", "https://backend.example");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
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
    expect(remotePageSupported("/tournaments/s9/mappools")).toBe(true);
    expect(remoteApiSupported("/api/teams/id/avatar")).toBe(false);
    expect(remoteApiSupported("/api/admin/tournaments/s11")).toBe(true);
  });
  it("rejects unsafe transport and local writes before any service; allows covered pages without permitting writes", () => {
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
    expect(unsupported.status).toBe(200);
    expect(unsupported.headers.get("location")).toBeNull();
    expect(unsupported.headers.get("cache-control")).toBe("no-store");
  });
  it("allows cross-site top-level page navigation while rejecting cross-site data access and writes", () => {
    const request = (path = "/", overrides = {}, method = "GET") =>
      new NextRequest(`http://localhost:3000${path}`, {
        method,
        headers: {
          host: "localhost:3000",
          "sec-fetch-site": "cross-site",
          "sec-fetch-mode": "navigate",
          "sec-fetch-dest": "document",
          ...overrides,
        },
      });
    for (const path of ["/", "/remote", "/tournaments/s11"])
      expect(proxy(request(path)).status).toBe(200);
    for (const path of [
      "/api/remote/read/me",
      "/api/remote/connection",
      "/auth/osu",
    ])
      expect(proxy(request(path)).status).toBe(403);
    for (const method of ["POST", "PUT", "DELETE"])
      expect(proxy(request("/", {}, method)).status).toBe(403);
    for (const headers of [
      { "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" },
      { "sec-fetch-dest": "iframe" },
      { "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" },
      { host: "evil.example" },
      { authorization: "Bearer synthetic" },
    ])
      expect(proxy(request("/", headers)).status).toBe(403);
  });
  it("preserves safe backend denial codes instead of blaming every 403 on token scopes", async () => {
    for (const code of [
      "ORIGIN_NOT_ALLOWED",
      "INSUFFICIENT_SCOPE",
      "DEVELOPER_REQUIRED",
      "UNKNOWN_BACKEND_CODE",
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json(
            {
              error: {
                code,
                message: "Do not relay arbitrary backend messages",
              },
            },
            { status: 403 },
          ),
        ),
      );
      await expect(
        remoteRead("/me", undefined, "synthetic-test-token"),
      ).rejects.toMatchObject({
        status: 403,
        code: code === "UNKNOWN_BACKEND_CODE" ? "REMOTE_FORBIDDEN" : code,
      });
    }
  });
  it("refuses any local database pool even with a configured URL", () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://synthetic@127.0.0.1:1/never_connect_test",
    );
    expect(() => getPool()).toThrow("Local database access is disabled");
  });
  for (const mode of ["remote", "database"])
    for (const method of ["GET", "HEAD"])
      it(`allows bundled Wiki illustrations via ${method} in ${mode} mode`, () => {
        vi.stubEnv("OCLR_DATA_SOURCE", mode);
        for (const path of [
          "/wiki/liru",
          "/mascot/liru/sheet-main.webp",
          "/mascot/liru/sheet-turnaround.webp",
          "/mascot/liru/sheet-expressions.webp",
          "/archive/s6/key-visual.jpg",
          "/branding/oclr-mark.svg",
          "/fonts/local.woff2",
        ]) {
          const response = proxy(
            new NextRequest(`http://localhost:3000${path}`, {
              method,
              headers: { host: "localhost:3000" },
            }),
          );
          expect(response.status, path).toBe(200);
          expect(response.headers.get("x-middleware-next"), path).toBe("1");
          expect(response.headers.get("location"), path).toBeNull();
        }
      });
  for (const mode of ["remote", "database"])
    for (const method of ["GET", "HEAD"])
      it(`allows every CSS-referenced season image via ${method} in ${mode} mode`, () => {
        vi.stubEnv("OCLR_DATA_SOURCE", mode);
        for (const { appearance, assets } of bundledSeasonThemes) {
          expect(assets.length, appearance).toBeGreaterThan(0);
          for (const path of assets) {
            expect(
              existsSync(new URL(`../../public${path}`, import.meta.url)),
              path,
            ).toBe(true);
            const response = proxy(
              new NextRequest(`http://localhost:3000${path}`, {
                method,
                headers: { host: "localhost:3000" },
              }),
            );
            expect(response.status, path).toBe(200);
            expect(response.headers.get("x-middleware-next"), path).toBe("1");
            expect(response.headers.get("location"), path).toBeNull();
          }
        }
      });
  it.each([
    "/mascot/liru/sheet-main.webp",
    ...bundledSeasonThemes.flatMap((theme) => theme.assets),
  ])("keeps remote security checks on bundled asset %s", (path) => {
    for (const method of ["POST", "PUT", "DELETE"])
      expect(
        proxy(
          new NextRequest(`http://localhost:3000${path}`, {
            method,
            headers: { host: "localhost:3000" },
          }),
        ).status,
      ).toBe(403);
    const rejectedHeaders: Record<string, string>[] = [
      { host: "evil.example" },
      { host: "localhost:3000", "sec-fetch-site": "cross-site" },
      { host: "localhost:3000", authorization: "Bearer synthetic" },
    ];
    for (const headers of rejectedHeaders)
      expect(
        proxy(new NextRequest(`http://localhost:3000${path}`, { headers }))
          .status,
      ).toBe(403);
  });
  it("rejects lookalike asset directories and unsupported routes", () => {
    for (const other of [
      "/mascot-private/image.webp",
      "/private/image.webp",
      "/mascot-admin",
      "/themes-private/image.webp",
      "/themes-admin",
      "/themes",
    ])
      expect(
        proxy(
          new NextRequest(`http://localhost:3000${other}`, {
            headers: { host: "localhost:3000" },
          }),
        ).headers.get("location"),
      ).toBe("http://localhost:3000/remote/unsupported");
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
