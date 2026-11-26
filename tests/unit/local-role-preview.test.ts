import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../../src/app/auth/dev-role/route";
import { localRolePreviewKey } from "../../src/lib/auth/local-role-preview-config";

const app = "http://127.0.0.1:3000";
const host = new URL(app).host;
const previewDb = "postgresql://127.0.0.1:55434/oclr_frontend_test";
const key = "P".repeat(43);

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OCLR_ENVIRONMENT", undefined);
  vi.stubEnv("OCLR_DATA_SOURCE", "database");
  vi.stubEnv("APP_URL", app);
  vi.stubEnv("DATABASE_URL", previewDb);
  vi.stubEnv("OCLR_DEVELOPMENT_DATABASE_URL", previewDb);
  vi.stubEnv("OCLR_LOCAL_ROLE_PREVIEW_KEY", key);
});
afterEach(() => vi.unstubAllEnvs());

describe("local role preview request boundary", () => {
  it("requires the exact configured loopback host", () => {
    expect(localRolePreviewKey(host)).toBe(key);
    expect(localRolePreviewKey("localhost:3000")).toBeNull();
    expect(localRolePreviewKey("127.0.0.1:3001")).toBeNull();
    expect(localRolePreviewKey(null)).toBeNull();
  });

  it.each([
    ["NODE_ENV", "production"],
    ["OCLR_ENVIRONMENT", "production"],
    ["OCLR_DATA_SOURCE", "remote"],
    ["OCLR_LOCAL_ROLE_PREVIEW_KEY", "too-short"],
    ["APP_URL", "http://192.168.0.10:3000"],
    ["DATABASE_URL", "postgresql://127.0.0.1:55434/oclr_1603_test"],
    ["OCLR_DEVELOPMENT_DATABASE_URL", ""],
  ])("disables the feature with %s=%s", async (variable, value) => {
    vi.stubEnv(variable, value);
    expect(localRolePreviewKey(host)).toBeNull();
    const response = await POST(request(app));
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects cross-origin writes and bearer requests", async () => {
    expect((await POST(request("http://127.0.0.1:4000"))).status).toBe(403);
    expect((await POST(request(app, "Bearer synthetic"))).status).toBe(403);
  });

  it("rejects repeated fields and oversized forms before creating a session", async () => {
    const repeated = new URLSearchParams([
      ["account", "1"],
      ["account", "2"],
    ]);
    expect((await POST(request(app, undefined, repeated))).status).toBe(400);
    expect(
      (await POST(request(app, undefined, { account: "0".repeat(512) })))
        .status,
    ).toBe(413);
  });

  it("requires the access code and rejects arbitrary accounts before querying the database", async () => {
    const unauthenticated = await POST(
      request(app, undefined, { account: "123456" }),
    );
    expect(unauthenticated.headers.get("location")).toBe(
      `${app}/dev/roles?error=access`,
    );
    expect(unauthenticated.headers.get("set-cookie")).toBeNull();
    const unlisted = await POST(
      request(app, undefined, { code: key, account: "123456" }),
    );
    expect(unlisted.headers.get("location")).toBe(
      `${app}/dev/roles?error=account`,
    );
    expect(unlisted.headers.get("set-cookie")).toBeNull();
  });
});

function request(
  origin: string,
  authorization?: string,
  fields: Record<string, string> | URLSearchParams = {},
) {
  const headers = new Headers({ host, origin });
  if (authorization) headers.set("authorization", authorization);
  return new NextRequest(`${app}/auth/dev-role`, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
  });
}
