import { beforeEach, expect, it, vi } from "vitest";
import { HttpError } from "../../src/lib/http";
import { statisticsArchive } from "../fixtures/archive-statistics";
const mocks = vi.hoisted(() => ({ capability: vi.fn(), transaction: vi.fn() }));
vi.mock("../../src/lib/auth/staff", () => ({
  assertCapability: mocks.capability,
  assertReadCapability: vi.fn(),
  hasCapability: vi.fn(),
}));
vi.mock("../../src/lib/tournaments", () => ({
  readTournament: async () => ({ edition: { archive: statisticsArchive } }),
}));
vi.mock("../../src/db", () => ({
  db: () => ({ transaction: mocks.transaction }),
}));
import { statisticsCommand } from "../../src/lib/archive-statistics";
const actor = { osuId: 123, username: "Synthetic reviewer" };
const review = {
  action: "review",
  mpId: 999177,
  expectedVersion: 1,
  poolId: "final",
  included: [1, 2],
  adjudication: { kind: "technical" },
};
beforeEach(() => {
  vi.clearAllMocks();
});
it("requires approval authority for structured exceptions before entering a transaction", async () => {
  mocks.capability.mockImplementation(async (_actor, capability) => {
    if (capability === "approve_results") throw new HttpError(403, "Forbidden");
  });
  await expect(statisticsCommand(actor, "s7", review)).rejects.toMatchObject({
    status: 403,
  });
  expect(mocks.capability.mock.calls.map((c) => c[1])).toEqual([
    "record_results",
    "approve_results",
  ]);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("rechecks structured exception authority inside the edition lock", async () => {
  const tx = {
    select: () => ({
      from: () => ({ where: () => ({ for: async () => [] }) }),
    }),
  };
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  mocks.capability.mockImplementation(
    async (_actor, capability, _slug, lockedTx) => {
      if (capability === "approve_results" && lockedTx)
        throw new HttpError(403, "Revoked");
    },
  );
  await expect(statisticsCommand(actor, "s7", review)).rejects.toMatchObject({
    status: 403,
  });
  expect(mocks.capability.mock.calls.map((c) => c[1])).toEqual([
    "record_results",
    "approve_results",
    "record_results",
    "approve_results",
  ]);
  expect(mocks.capability.mock.calls[3][3]).toBe(tx);
});
it.each([
  { reviewedBy: 999 },
  { reviewedAt: "2026-10-31T00:00:00Z" },
  { excludedGames: [{ gameId: 3, reason: "invented" }] },
  { adjudication: { kind: "forfeit" } },
  { evidenceUrl: "https://user:password@example.com" },
])(
  "rejects forged provenance or invalid metadata before authorization: %j",
  async (extra) => {
    await expect(
      statisticsCommand(actor, "s7", { ...review, ...extra }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.capability).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  },
);
