import { db } from "../../src/db";
import { mappoolEntries, users } from "../../src/db/schema";
import { refereeCommand } from "../../src/lib/referee";
import { refereeWorkspace } from "../../src/lib/referee-workspace";
import type { RefereePolicy } from "../../src/lib/referee-model";
import { randomUUID } from "node:crypto";
import { seedResultReview } from "./results";
import { assertTestDatabase } from "../database";

export const refereeTestAdmin = {
  osuId: 891001,
  username: "Synthetic Referee Admin",
};
export const refereeTestUser = {
  osuId: 891002,
  username: "Synthetic Assigned Referee",
};
export const syntheticRefereePolicy: RefereePolicy = {
  steps: [
    { kind: "ban", actor: "firstBan" },
    { kind: "pick", actor: "firstPick" },
    { kind: "ban", actor: "secondBan" },
    { kind: "pick", actor: "secondPick" },
    { kind: "tb", actor: "neutral" },
  ].map((step) => ({
    ...step,
    categories: step.kind === "tb" ? ["TB"] : [],
    entryIds: [],
    avoidRepeatCategory: false,
    tiedAt: step.kind === "tb" ? 1 : null,
  })) as RefereePolicy["steps"],
  commands: {
    roomSize: 8,
    noFail: true,
    categoryMods: {
      NM: { mods: [], freemod: false },
      TB: { mods: [], freemod: true },
    },
    banSeconds: 45,
    pickSeconds: 60,
    prepareSeconds: 90,
    startSeconds: 5,
  },
};
/** Only isolated automated-test databases. This helper never touches the local preview database. */
export async function seedRefereeFixture(
  configure = true,
  openExhibition = false,
) {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  if (
    new URL(process.env.TEST_DATABASE_URL!).pathname === "/oclr_frontend_test"
  )
    throw new Error(
      "Referee fixtures must not use the frontend preview database.",
    );
  await db()
    .insert(users)
    .values([refereeTestAdmin, refereeTestUser])
    .onConflictDoNothing();
  const seeded = await seedResultReview(
    refereeTestAdmin.osuId,
    refereeTestUser.osuId,
    891100,
    openExhibition ? "exhibition" : "knockout",
    true,
    openExhibition,
  );
  await db()
    .insert(mappoolEntries)
    .values(
      [4, 5, 6].map((position) => ({
        poolId: seeded.poolId!,
        category: position === 6 ? ("TB" as const) : ("NM" as const),
        position,
        beatmapId: 10000 + position,
        metadata: {
          setId: 42,
          title: `Synthetic Map ${position}`,
          artist: "Synthetic Artist",
          difficulty: "Synthetic Difficulty",
          mapper: "Synthetic Mapper",
          stars: 4,
          bpm: 180,
          duration: 90,
        },
      })),
    );
  let workspace = await refereeWorkspace(
    refereeTestAdmin,
    "test-cup",
    seeded.fixtureId,
  );
  if (configure)
    workspace = (
      await refereeCommand(refereeTestAdmin, "test-cup", seeded.fixtureId, {
        action: "configure_policy",
        policy: syntheticRefereePolicy,
        expectedPolicyRevision: 0,
        expectedRevision: 0,
        dependencyFingerprint: workspace.dependencyFingerprint,
        requestKey: randomUUID(),
      })
    ).workspace;
  return { ...seeded, workspace };
}
