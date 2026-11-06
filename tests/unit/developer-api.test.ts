import { afterEach, describe, expect, it, vi } from "vitest";
import {
  developerPorts,
  DeveloperApiLimiter,
} from "../../src/lib/developer-api";
import {
  isDeveloperOrigin,
  developerOriginPort,
  developerOriginAllowed,
  developerTokenPorts,
  validDeveloperToken,
} from "../../src/lib/developer-api-model";
import { randomToken } from "../../src/lib/auth/tokens";
import { isPublicPage } from "../../src/lib/public-navigation";

afterEach(() => vi.unstubAllEnvs());
describe("Developer API transport and abuse boundaries", () => {
  it("validates canonical loopback origins before matching effective ports", () => {
    for (const origin of [
      "http://localhost:3000",
      "http://127.0.0.1:5173",
      "https://localhost:4000",
      "http://[::1]:3000",
    ])
      expect(isDeveloperOrigin(origin)).toBe(true);
    for (const origin of [
      "null",
      "*",
      "http://localhost:3000/",
      "http://user@localhost:3000",
      "http://localhost.example:3000",
      "http://127.0.0.2:3000",
      "http://localhost:3000?x=1",
      "http://localhost:3000/#x",
      "https://example.com",
      "file://localhost",
      "http://LOCALHOST:3000",
    ])
      expect(isDeveloperOrigin(origin), origin).toBe(false);
    expect(developerOriginPort("http://localhost")).toBe(80);
    expect(developerOriginPort("https://127.0.0.1")).toBe(443);
    expect(developerOriginPort("http://localhost:0")).toBeNull();
    for (const value of [
      "http://localhost:3000",
      "https://127.0.0.1:3000",
      "http://[::1]:3000",
    ])
      expect(developerOriginAllowed(value, [3000, 5173])).toBe(true);
    expect(developerOriginAllowed("http://localhost:3001", [3000, 5173])).toBe(
      false,
    );
    expect(developerOriginAllowed("http://example.com:3000", null)).toBe(false);
    expect(developerOriginAllowed("http://localhost:5173", null)).toBe(true);
    expect(developerOriginAllowed("http://localhost:5173", [])).toBe(false);
    expect(
      developerTokenPorts({ origin: "https://localhost", ports: null }),
    ).toEqual([443]);
    expect(
      developerTokenPorts({
        origin: "http://localhost:3000",
        ports: [4000, 5173],
      }),
    ).toEqual([4000, 5173]);
  });
  it("supports port configuration and legacy origins, with explicit empty disabling access", () => {
    vi.stubEnv("OCLR_DEVELOPER_PORTS", undefined);
    vi.stubEnv("OCLR_DEVELOPER_ORIGINS", undefined);
    expect(developerPorts()).toBeNull();
    vi.stubEnv(
      "OCLR_DEVELOPER_ORIGINS",
      "http://localhost:3000,http://127.0.0.1:3000,https://localhost",
    );
    expect(developerPorts()).toEqual([3000, 443]);
    vi.stubEnv("OCLR_DEVELOPER_PORTS", "3000, 5173,3000");
    expect(developerPorts()).toEqual([3000, 5173]);
    vi.stubEnv("OCLR_DEVELOPER_PORTS", "");
    expect(developerPorts()).toEqual([]);
    for (const invalid of [
      "0",
      "65536",
      "3000,",
      "1.2",
      "1e3",
      "*",
      "-1",
      Array.from({ length: 21 }, (_, i) => i + 1).join(","),
    ]) {
      vi.stubEnv("OCLR_DEVELOPER_PORTS", invalid);
      expect(developerPorts).toThrow();
    }
    vi.stubEnv("OCLR_DEVELOPER_PORTS", undefined);
    vi.stubEnv("OCLR_DEVELOPER_ORIGINS", "");
    expect(developerPorts()).toEqual([]);
    vi.stubEnv("OCLR_DEVELOPER_ORIGINS", "https://untrusted.example");
    expect(developerPorts).toThrow();
  });

  it("keeps the token family distinct from browser sessions and treats its page as private", () => {
    const session = randomToken();
    expect(validDeveloperToken(session)).toBe(false);
    expect(validDeveloperToken(`oclr_dev_${session}`)).toBe(true);
    expect(validDeveloperToken(`oclr_dev_${session}\n`)).toBe(false);
    expect(isPublicPage("/developer")).toBe(false);
  });
  it("bounds fixed windows, rejects overflow and recovers after expiry", () => {
    const limit = new DeveloperApiLimiter();
    limit.take("one", 2, 100);
    limit.take("one", 2, 100);
    expect(() => limit.take("one", 2, 100)).toThrow();
    limit.take("one", 2, 60_100);
    for (let index = 0; index < 4095; index++)
      limit.take(`other-${index}`, 1, 60_100);
    expect(() => limit.take("overflow", 1, 60_100)).toThrow();
    expect(() => limit.take("recovered", 1, 120_100)).not.toThrow();
  });
});
