import { randomUUID } from "node:crypto";
import { db } from "../../src/db";
import {
  mappoolEntries,
  mappools,
  tournamentRounds,
  users,
  registrations,
} from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { seedResultReview } from "./results";
import { seedEditions } from "./editions";
import { edition } from "./edition";
import { resultCommand } from "../../src/lib/results";
import { matchReview } from "../../src/lib/result-review";
import { assertTestDatabase } from "../database";

export async function seedPublicPolish(
  admin: number,
  referee: number,
  base: number,
) {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  await db()
    .insert(users)
    .values([
      { osuId: admin, username: "Synthetic Admin" },
      { osuId: referee, username: "Synthetic Referee" },
    ])
    .onConflictDoNothing();
  const seed = await seedResultReview(admin, referee, base, "knockout", true);
  await seedEditions([
    {
      ...edition,
      name: "OCLR public UI test",
      schedule: [
        { label: "Published plan", at: "2020-01-01T00:00:00Z" },
        { label: "Future plan", at: "2098-01-01T00:00:00Z" },
      ],
    },
  ]);
  await seedEditions([
    {
      ...edition,
      slug: "polish-empty-test",
      name: "OCLR empty public UI test",
      registration: null,
      rules: null,
      eligibility: null,
      schedule: [],
    },
  ]);
  await db()
    .update(mappools)
    .set({ name: "test" })
    .where(eq(mappools.id, seed.poolId!));
  await db()
    .update(tournamentRounds)
    .set({ name: "1" })
    .where(eq(tournamentRounds.id, seed.context.fixture.roundId));
  await db()
    .delete(mappoolEntries)
    .where(eq(mappoolEntries.poolId, seed.poolId!));
  const categories = [
    "NM",
    "NM",
    "NM",
    "NM",
    "NM",
    "NM",
    "HD",
    "HD",
    "HR",
    "HR",
    "DT",
    "DT",
    "FM",
    "FM",
    "FM",
    "TB",
    "TB",
    "TB",
  ] as const;
  const positions = new Map<string, number>();
  const entries = categories.map((category, i) => {
    const position = (positions.get(category) ?? 0) + 1;
    positions.set(category, position);
    return {
      poolId: seed.poolId!,
      category,
      position,
      beatmapId: i < 3 ? 10001 + i : base + 400 + i,
      metadata: {
        setId: base + 500 + i,
        title:
          i === 1
            ? "星空の下で · 中文标题与很长的 English song title that should wrap without stretching the artwork"
            : `Landscape map ${i + 1}`,
        artist: "Synthetic artist",
        difficulty: "Expert · 长难度名称",
        mapper: "Synthetic mapper",
        stars: 5.25,
        bpm: 180,
        duration: 125,
        ar: 9,
        od: 8,
        cs: 4,
        hp: 6,
        ...(category === "DT"
          ? {
              attributes: {
                configuration: "DT" as const,
                mods: ["DT"],
                ruleset: "osu" as const,
                stars: 7.5,
                maxCombo: 1000,
                values: {},
                fetchedAt: new Date().toISOString(),
              },
            }
          : {}),
      },
    };
  });
  await db().insert(mappoolEntries).values(entries);
  const actor = { osuId: admin, username: "Synthetic Admin" };
  let review = await matchReview(actor, "test-cup", seed.fixtureId);
  for (const extra of [
    {
      action: "submit",
      importId: seed.importId,
      rulesConfirmed: true,
      sourceChangesConfirmed: true,
      publicNote: "",
      decisions: seed.source.games.map((g) => ({
        gameId: g.id,
        included: true,
        complianceConfirmed: true,
        reason: "",
        substitutions: [],
      })),
    },
    { action: "approve", revision: 1 },
    { action: "publish", revision: 1, progressionAcknowledged: true },
  ])
    review = (
      await resultCommand(actor, "test-cup", seed.fixtureId, {
        ...extra,
        expectedVersion: review.context.result!.version,
        expectedFixtureVersion: review.context.fixture.version,
        requestKey: randomUUID(),
        confirmed: true,
      })
    ).review;
  const identities = Array.from({ length: 24 }, (_, i) => ({
    osuId: base + 100 + i,
    username:
      i === 1
        ? `PolishPlayer ${base} Long中文名称_${"LongName".repeat(6)}`
        : `PolishPlayer ${base} ${i}`,
  }));
  await db().insert(users).values(identities).onConflictDoNothing();
  await db()
    .insert(registrations)
    .values(
      identities.map((p) => ({
        userId: p.osuId,
        editionSlug: "test-cup",
        status: "accepted" as const,
        rulesVersion: null,
        answers: { private: "PRIVATE_POLISH_ANSWERS" },
      })),
    )
    .onConflictDoNothing();
  return { ...seed, entries, identities };
}
export const landscapeFixture =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><defs><linearGradient id="sky"><stop stop-color="#293265"/><stop offset="1" stop-color="#dd87ba"/></linearGradient></defs><rect width="800" height="450" fill="url(#sky)"/><circle cx="580" cy="140" r="70" fill="#fff2b4"/><path d="M0 350 170 160 370 370 570 230 800 360V450H0Z" fill="#1b2349"/><path d="M0 405 240 300 470 405 690 285 800 400V450H0Z" fill="#3b4672"/></svg>';
