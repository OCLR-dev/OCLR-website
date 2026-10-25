import { afterEach, describe, expect, it, vi } from "vitest";
import {
  developerOrigins,
  DeveloperApiLimiter,
} from "../../src/lib/developer-api";
import {
  isDeveloperOrigin,
  validDeveloperToken,
} from "../../src/lib/developer-api-model";
import { randomToken } from "../../src/lib/auth/tokens";
import { isPublicPage } from "../../src/lib/public-navigation";

afterEach(() => vi.unstubAllEnvs());
describe("Developer API transport and abuse boundaries", () => {
  it("accepts exact canonical loopback origins, separating host, scheme and port", () => {
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
    vi.stubEnv("OCLR_DEVELOPER_ORIGINS", undefined);
    expect(developerOrigins()).toEqual([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:4000",
      "http://127.0.0.1:4000",
    ]);
    vi.stubEnv(
      "OCLR_DEVELOPER_ORIGINS",
      "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3000",
    );
    expect(developerOrigins()).toEqual([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
    vi.stubEnv("OCLR_DEVELOPER_ORIGINS", "");
    expect(developerOrigins()).toEqual([]);
    vi.stubEnv("OCLR_DEVELOPER_ORIGINS", "https://untrusted.example");
    expect(developerOrigins).toThrow();
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
