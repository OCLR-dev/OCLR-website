import { afterEach, describe, expect, it, vi } from "vitest";
const remote = vi.hoisted(() => ({
  assertRemoteSubject: vi.fn(async () => {}),
  frontendResource: vi.fn(async () => ({ synthetic: true })),
}));
vi.mock("../../src/lib/frontend-resource", () => remote);
import { refereeWorkspace } from "../../src/lib/referee-workspace";
import { refereeReconciliation } from "../../src/lib/referee-reconciliation";
import { remoteOperation } from "../../src/lib/remote-transport";
import {
  remoteApiSupported,
  remotePageSupported,
} from "../../src/lib/data-source";
import { NextRequest } from "next/server";
import { proxy } from "../../src/proxy";
const fixture = "00000000-0000-4000-8000-000000000001";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("referee saved reads in remote mode", () => {
  it("delegates both private reads to the fixed backend resources with the actual subject", async () => {
    vi.stubEnv("OCLR_DATA_SOURCE", "remote");
    vi.stubEnv(
      "DATABASE_URL",
      "postgres://unused:unused@127.0.0.1:1/oclr_test_unreachable",
    );
    const actor = { osuId: 123, username: "Synthetic referee" };
    for (const [read, id] of [
      [refereeWorkspace, "refereeWorkspace"],
      [refereeReconciliation, "refereeReconciliation"],
    ] as const) {
      await expect(read(actor, "test-cup", fixture)).resolves.toEqual({
        synthetic: true,
      });
      expect(remote.assertRemoteSubject).toHaveBeenLastCalledWith(123);
      expect(remote.frontendResource).toHaveBeenLastCalledWith(id, {
        slug: "test-cup",
        fixtureId: fixture,
      });
    }
  });
  it("registers only the fixed resources and keeps local business writes denied", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("OCLR_DATA_SOURCE", "remote");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("OCLR_API_BASE_URL", "https://backend.example.test");
    const page = `/admin/tournaments/test-cup/matches/${fixture}/referee`;
    expect(remotePageSupported(page)).toBe(true);
    for (const suffix of ["", "/reconciliation"]) {
      const api = `/api${page}${suffix}`;
      expect(remoteApiSupported(api)).toBe(true);
      const operation = remoteOperation(
        `/staff/tournaments/test-cup/matches/${fixture}/referee${suffix}`,
        new URLSearchParams(),
      );
      expect(operation.public).toBe(false);
      expect(operation.scope).toBe("tournaments:private:read");
      for (const method of ["POST", "PATCH"])
        expect(
          proxy(
            new NextRequest(`http://localhost:3000${api}`, {
              method,
              headers: { host: "localhost:3000" },
            }),
          ).status,
        ).toBe(403);
    }
  });
});
