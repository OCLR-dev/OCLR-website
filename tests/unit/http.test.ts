import { afterEach, expect, it, vi } from "vitest";
import { appUrl, readJson, requireSameOrigin } from "../../src/lib/http";
import { equalTokens, randomToken } from "../../src/lib/auth/tokens";
afterEach(() => vi.unstubAllEnvs());
it("rejects untrusted origins, missing origins and non-loopback HTTP", () => {
  vi.stubEnv("APP_URL", "https://oclr.example.test");
  expect(() =>
    requireSameOrigin(
      new Request("https://oclr.example.test", { method: "POST" }),
    ),
  ).toThrow();
  expect(() =>
    requireSameOrigin(
      new Request("https://oclr.example.test", {
        method: "POST",
        headers: { origin: "https://attacker.test" },
      }),
    ),
  ).toThrow();
  vi.stubEnv("APP_URL", "http://oclr.example.test");
  expect(() => appUrl()).toThrow();
});
it("accepts a private IPv4 origin only while NODE_ENV is development", () => {
  vi.stubEnv("NODE_ENV", "development");
  for (const origin of [
    "http://192.168.100.31:3000",
    "http://10.0.0.4:3000",
    "http://172.16.5.4:3000",
    "http://172.31.255.254:3000",
  ]) {
    vi.stubEnv("APP_URL", origin);
    expect(appUrl()).toBe(origin);
  }
  for (const origin of [
    "http://172.32.5.4:3000",
    "http://192.168.0.256:3000",
    "http://oclr.example.test",
    "http://192.168.100.31:3000/base",
    "https://user:private-value@192.168.100.31:3000",
  ]) {
    vi.stubEnv("APP_URL", origin);
    expect(() => appUrl()).toThrow();
  }
});
it("keeps private origins HTTPS-only outside development", () => {
  vi.stubEnv("APP_URL", "http://192.168.100.31:3000");
  for (const environment of ["production", "test"]) {
    vi.stubEnv("NODE_ENV", environment);
    expect(() => appUrl()).toThrow("The site origin is invalid.");
  }
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", "https://192.168.100.31:3000");
  expect(appUrl()).toBe("https://192.168.100.31:3000");
});
it("keeps exact origin and session-only writes during LAN preview", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("APP_URL", "http://192.168.1.2:3000");
  const request = (origin: string, authorization?: string) =>
    new Request("http://192.168.1.2:3000/api/settings", {
      method: "POST",
      headers: { origin, ...(authorization ? { authorization } : {}) },
    });
  expect(() =>
    requireSameOrigin(request("http://192.168.1.2:3000")),
  ).not.toThrow();
  for (const origin of [
    "http://192.168.1.3:3000",
    "http://192.168.1.2:3001",
    "https://attacker.test",
  ])
    expect(() => requireSameOrigin(request(origin))).toThrow();
  expect(() =>
    requireSameOrigin(request("http://192.168.1.2:3000", "Bearer synthetic")),
  ).toThrow();
});
it("bounds body size even when length is absent and validates JSON", async () => {
  await expect(
    readJson(
      new Request("https://example.test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "x".repeat(32769),
      }),
    ),
  ).rejects.toThrow("too large");
  await expect(
    readJson(
      new Request("https://example.test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{bad",
      }),
    ),
  ).rejects.toThrow("invalid JSON");
});
it("requires full entropy tokens before constant time state matching", () => {
  const token = randomToken();
  expect(equalTokens(token, token)).toBe(true);
  expect(equalTokens(token, randomToken())).toBe(false);
  expect(equalTokens("", "")).toBe(false);
});
