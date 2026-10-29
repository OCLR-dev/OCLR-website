import { afterEach, expect, it, vi } from "vitest";
import {
  hostnameFromHostHeader,
  isDevelopmentNetworkRequest,
  isPrivateNetworkHostname,
} from "../../src/lib/site-origin";

afterEach(() => vi.unstubAllEnvs());

it("bounds private IPv4 hosts without accepting lookalikes or malformed authorities", () => {
  for (const host of [
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.2",
  ])
    expect(isPrivateNetworkHostname(host)).toBe(true);
  for (const host of [
    "172.15.255.255",
    "172.32.0.1",
    "192.169.1.2",
    "192.168.0.256",
    "10.0.0.1.evil.test",
    "010.0.0.1",
  ])
    expect(isPrivateNetworkHostname(host)).toBe(false);
  for (const host of [
    null,
    "",
    "user@192.168.1.2",
    "192.168.1.2/path",
    "192.168.1.2:65536",
    "192.168.1.2,attacker.test",
    "192.168.1.2:",
  ])
    expect(hostnameFromHostHeader(host)).toBeNull();
  expect(hostnameFromHostHeader("192.168.1.2:3000")).toBe("192.168.1.2");
});

it("allows local hosts only in development and keeps canonical redirects elsewhere", () => {
  for (const environment of ["development", "test", "production"]) {
    vi.stubEnv("NODE_ENV", environment);
    for (const host of [
      "192.168.1.2:3000",
      "127.0.0.1:3000",
      "localhost:3000",
      "[::1]:3000",
    ])
      expect(isDevelopmentNetworkRequest(host)).toBe(
        environment === "development",
      );
    expect(isDevelopmentNetworkRequest("attacker.test:3000")).toBe(false);
  }
});
