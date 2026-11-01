import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { assertTestDatabase } from "../database";
import { db } from "../../src/db";
import {
  users,
  memberships,
  registrations,
  teams,
  matchGames,
  matchImports,
  matchResults,
  mappoolEntries,
  staffRoles,
  fixtures,
} from "../../src/db/schema";
import { fixtureCommand } from "../../src/lib/fixtures";
import { refereeCommand, refereeWorkspace } from "../../src/lib/referee";
import { syntheticScoringRules } from "./match";
import {
  seedRefereeFixture,
  refereeTestAdmin as admin,
  refereeTestUser as referee,
} from "./referee";
import { createSession } from "../../src/lib/auth/sessions";
import type { RefereePolicy } from "../../src/lib/referee-model";
export { admin, referee };
export const successor = { osuId: 891003, username: "Synthetic Successor" };
export const categories = [
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
  "DT",
  "FM",
  "FM",
  "TB",
] as const;
export const acceptancePolicy: RefereePolicy = {
  steps: [
    { kind: "ban", actor: "firstBan" },
    { kind: "ban", actor: "secondBan" },
    ...Array.from({ length: 8 }, (_, i) => ({
      kind: "pick",
      actor: i % 2 ? "secondPick" : "firstPick",
    })),
    { kind: "tb", actor: "neutral" },
  ].map((s) => ({
    ...s,
    categories: s.kind === "tb" ? ["TB"] : [],
    entryIds: [],
    avoidRepeatCategory: false,
    tiedAt: s.kind === "tb" ? 4 : null,
  })) as RefereePolicy["steps"],
  maxReplaysPerMap: 2,
  commands: {
    roomSize: 16,
    noFail: true,
    categoryMods: {
      NM: { mods: [], freemod: false },
      HD: { mods: ["HD"], freemod: false },
      HR: { mods: ["HR"], freemod: false },
      DT: { mods: ["DT"], freemod: false },
      FM: { mods: [], freemod: true },
      TB: { mods: [], freemod: true },
    },
    banSeconds: 60,
    pickSeconds: 90,
    prepareSeconds: 120,
    startSeconds: 5,
  },
};
export async function acceptanceCookie(actor: { osuId: number }) {
  const session = await createSession(actor.osuId);
  return {
    name: "oclr_session",
    value: session.token,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: false,
  };
}
export async function seedAcceptance() {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
  const seed = await seedRefereeFixture(false);
  await db().insert(users).values(successor).onConflictDoNothing();
  await db()
    .insert(staffRoles)
    .values({
      userId: successor.osuId,
      role: "referee",
      editionSlug: "test-cup",
      grantedBy: admin.osuId,
    })
    .onConflictDoNothing();
  for (const [i, team] of [seed.home, seed.away].entries()) {
    const ids = [
      team.captainId,
      team.memberId,
      ...Array.from({ length: 4 }, (_, n) => team.captainId + n + 4),
    ];
    for (const [n, osuId] of ids.entries())
      await db()
        .insert(users)
        .values({ osuId, username: `${i ? "Away" : "Home"} Player ${n + 1}` })
        .onConflictDoUpdate({
          target: users.osuId,
          set: { username: `${i ? "Away" : "Home"} Player ${n + 1}` },
        });
    await db()
      .insert(registrations)
      .values(
        ids.map((userId) => ({
          userId,
          editionSlug: "test-cup",
          status: "accepted" as const,
          rulesVersion: "test-v1",
          answers: {},
        })),
      )
      .onConflictDoNothing();
    await db()
      .insert(memberships)
      .values(
        ids.slice(2).map((userId) => ({
          userId,
          teamId: team.teamId,
          editionSlug: "test-cup",
          origin: "admin",
        })),
      )
      .onConflictDoNothing();
    await db()
      .update(teams)
      .set({ name: i ? "青嵐" : "星河" })
      .where(eq(teams.id, team.teamId));
  }
  await db()
    .delete(matchResults)
    .where(eq(matchResults.fixtureId, seed.fixtureId));
  const imports = await db()
    .select({ id: matchImports.id })
    .from(matchImports)
    .where(eq(matchImports.fixtureId, seed.fixtureId));
  if (imports.length)
    await db()
      .delete(matchGames)
      .where(
        inArray(
          matchGames.importId,
          imports.map((x) => x.id),
        ),
      );
  await db()
    .delete(matchImports)
    .where(eq(matchImports.fixtureId, seed.fixtureId));
  await db()
    .delete(mappoolEntries)
    .where(eq(mappoolEntries.poolId, seed.poolId!));
  const positions = new Map<string, number>();
  await db()
    .insert(mappoolEntries)
    .values(
      categories.map((category, i) => {
        const position = (positions.get(category) ?? 0) + 1;
        positions.set(category, position);
        return {
          poolId: seed.poolId!,
          category,
          position,
          beatmapId: 525000 + i,
          metadata: {
            setId: 42,
            artist: "Synthetic Artist",
            title: `Acceptance ${category}${position}`,
            difficulty: "Synthetic Difficulty",
            mapper: "Synthetic Mapper",
            stars: 4,
            bpm: 180,
            duration: 90,
          },
        };
      }),
    );
  const roundId = seed.context.fixture.roundId;
  await fixtureCommand(admin, "test-cup", {
    action: "round_rules",
    confirmed: true,
    roundId,
    expectedVersion: 1,
    scoringRules: {
      ...syntheticScoringRules,
      playersPerTeam: 3,
      series: { type: "first_to", wins: 5 },
    },
    standingsRules: null,
  });
  let workspace = await refereeWorkspace(admin, "test-cup", seed.fixtureId);
  workspace = (
    await refereeCommand(admin, "test-cup", seed.fixtureId, {
      action: "configure_policy",
      policy: acceptancePolicy,
      expectedPolicyRevision: 0,
      expectedRevision: 0,
      dependencyFingerprint: workspace.dependencyFingerprint,
      requestKey: randomUUID(),
    })
  ).workspace;
  // A dependent winner fixture demonstrates advancement only after Admin publication.
  const [followup] = await db()
    .insert(fixtures)
    .values({
      editionSlug: "test-cup",
      roundId,
      label: "Synthetic winner destination",
      position: 2,
      homeSourceId: seed.fixtureId,
      homeSourceOutcome: "winner",
      publishedAt: new Date(),
      timeZone: "Asia/Taipei",
      status: "scheduled",
    })
    .returning();
  return { ...seed, workspace, followupId: followup.id };
}

export function apiGame(
  w: Awaited<ReturnType<typeof refereeWorkspace>>,
  entryId: string,
  gameId: number,
  winner: string | null,
  tie = false,
) {
  const map = w.maps.find((m) => m.id === entryId)!;
  return {
    id: gameId,
    beatmap_id: map.beatmapId,
    start_time: new Date().toISOString(),
    end_time: new Date(Date.now() + 1).toISOString(),
    mode: "osu",
    mode_int: 0,
    team_type: "team-vs",
    scoring_type: "score",
    mods: [
      "NF",
      ...(["HD", "HR", "DT"].includes(map.category) ? [map.category] : []),
    ],
    beatmap: {
      id: map.beatmapId,
      beatmapset_id: 42,
      version: "Synthetic Difficulty",
      beatmapset: {
        id: 42,
        artist: "Synthetic Artist",
        title: `Acceptance ${map.category}${map.position}`,
      },
    },
    scores: w.teams.flatMap((t, ti) =>
      t.members.slice(0, 3).map((p, pi) => ({
        type: "legacy_match",
        user_id: p.osuId,
        legacy_total_score: tie || t.id === winner ? 200000 : 100000,
        total_score: tie || t.id === winner ? 200000 : 100000,
        accuracy: 0.98,
        max_combo: 100,
        passed: true,
        mods: [],
        match: { team: ti ? "red" : "blue", slot: ti * 3 + pi, pass: true },
      })),
    ),
  };
}
