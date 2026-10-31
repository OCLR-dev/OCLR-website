import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const fake = vi.hoisted(() => ({
  consumed: null as {
    stateHash: string;
    desktopRequestId: string | null;
  } | null,
}));
vi.mock("@/db", () => ({
  db: () => ({
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => {} }) }),
    delete: () => ({
      where: () => ({
        returning: async () => (fake.consumed ? [fake.consumed] : []),
      }),
    }),
  }),
}));
vi.mock("@/lib/auth/osu", () => ({
  authorizationUrl: (state: string) =>
    `https://osu.ppy.sh/oauth/authorize?state=${state}`,
  exchangeIdentity: async () => ({ id: 123, username: "Synthetic" }),
}));
vi.mock("@/lib/auth/sessions", () => ({
  createSession: async () => ({
    token: "synthetic-session",
    expiresAt: new Date(Date.now() + 60000),
  }),
  revokeSession: async () => {},
}));
vi.mock("@/lib/player-identity", () => ({ observeLoginNames: async () => {} }));
import { GET as start } from "../../src/app/auth/osu/route";
import { GET as callback } from "../../src/app/auth/osu/callback/route";
import { hashToken } from "../../src/lib/auth/tokens";

afterEach(() => {
  vi.unstubAllEnvs();
  fake.consumed = null;
});
describe("streaming OAuth return (mocked identity and DB transport)", () => {
  it("binds the exact local connection to OAuth state, returns after login and clears cookies", async () => {
    vi.stubEnv("APP_URL", "https://oclr.example.test");
    const path = `/streaming/s11/connect?${new URLSearchParams({ origin: "http://localhost:3001", state: "x".repeat(43) })}`;
    const begun = await start(
      new Request(
        `https://oclr.example.test/auth/osu?streaming_return=${encodeURIComponent(path)}`,
      ),
    );
    const state = new URL(begun.headers.get("location")!).searchParams.get(
      "state",
    )!;
    const context = begun.cookies.get("__Host-oclr_oauth_streaming")!.value;
    expect(context).toBeTruthy();
    expect(begun.headers.get("set-cookie")).toContain("HttpOnly");
    fake.consumed = { stateHash: hashToken(state), desktopRequestId: null };
    const result = await callback(
      new NextRequest(
        `https://oclr.example.test/auth/osu/callback?state=${state}&code=synthetic`,
        {
          headers: {
            cookie: `__Host-oclr_oauth=${state}; __Host-oclr_oauth_streaming=${context}`,
          },
        },
      ),
    );
    expect(result.headers.get("location")).toBe(
      `https://oclr.example.test${path}`,
    );
    expect(result.cookies.get("__Host-oclr_oauth_streaming")?.value).toBe("");
    expect(result.cookies.get("__Host-oclr_session")?.value).toBe(
      "synthetic-session",
    );
  });
  it("does not accept an external return target and leaves legacy login intact", async () => {
    vi.stubEnv("APP_URL", "https://oclr.example.test");
    const begun = await start(
      new Request(
        "https://oclr.example.test/auth/osu?streaming_return=https://evil.example",
      ),
    );
    expect(begun.cookies.get("__Host-oclr_oauth_streaming")?.value).toBe("");
    const state = new URL(begun.headers.get("location")!).searchParams.get(
      "state",
    )!;
    fake.consumed = { stateHash: hashToken(state), desktopRequestId: null };
    const result = await callback(
      new NextRequest(
        `https://oclr.example.test/auth/osu/callback?state=${state}&code=synthetic`,
        {
          headers: { cookie: `__Host-oclr_oauth=${state}` },
        },
      ),
    );
    expect(result.headers.get("location")).toBe(
      "https://oclr.example.test/dashboard",
    );
  });
});
