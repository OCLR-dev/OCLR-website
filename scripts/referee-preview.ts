/** Local UI rehearsal data only: fictional identities and beatmaps, never provider data. */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, closeDb } from "../src/db";
import {
  editionState,
  editionRevisions,
  fixtures,
  tournamentRounds,
  teams,
  memberships,
  users,
  registrations,
  mappools,
  mappoolEntries,
} from "../src/db/schema";
import { refereeCommand } from "../src/lib/referee";
import { refereeWorkspace } from "../src/lib/referee-workspace";
import { refereePolicySchema } from "../src/lib/referee-model";

const target = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  target.hostname !== "127.0.0.1" ||
  target.port !== "55436" ||
  target.pathname !== "/oclr_referee_review_test"
)
  throw new Error(
    "Only the dedicated local referee review database is allowed.",
  );
const fixtureId = process.argv[2];
if (!fixtureId) throw new Error("Provide the existing preview fixture ID.");
const actor = { osuId: 891001, username: "Archer" };
const slug = "test-cup";
const roster = [
  {
    name: "星河",
    base: 891100,
    names: ["Hoshino", "Shiro", "Nagi", "Milo", "Rin", "Aki"],
  },
  {
    name: "青岚",
    base: 891110,
    names: ["Aoba", "Hayate", "Sora", "Tsuki", "Yuki", "Fune"],
  },
];
const slots = [
  ["NM", 5],
  ["HD", 2],
  ["HR", 2],
  ["DT", 3],
  ["FM", 2],
  ["TB", 1],
] as const;
const titles = [
  "Cloudline",
  "Blue Hour",
  "星屑",
  "Afterglow",
  "Paper Moon",
  "夜航",
  "Glass Garden",
  "Pulse",
  "星の雨",
  "Daybreak",
  "疾走",
  "Neon Sky",
  "花火",
  "Summer Wind",
  "Last Horizon",
];
const artists = ["Aster", "Mio", "Lumi", "Nagi", "Rei"];
let workspace = await refereeWorkspace(actor, slug, fixtureId);
if (workspace.projection.activeSelections.length)
  throw new Error(
    "Preview has recorded play; preserve it and withdraw through the UI before changing the pool.",
  );
await db().transaction(async (tx) => {
  const [fixture] = await tx
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.id, fixtureId), eq(fixtures.editionSlug, slug)));
  if (!fixture?.mappoolId || !fixture.homeTeamId || !fixture.awayTeamId)
    throw new Error("Preview fixture is incomplete.");
  const [edition] = await tx
    .select()
    .from(editionState)
    .where(eq(editionState.slug, slug));
  if (!edition.configuration) throw new Error("Preview edition missing.");
  const configuration = {
    ...edition.configuration,
    name: "OCLR 练习赛",
    summary: "星河 vs 青岚",
    eligibility: "六人队伍，三人上场。",
    rules: {
      version: "preview-bo9-v1",
      sections: [
        {
          heading: "比赛规则",
          body: "BO9，先到五分获胜。每队六人，每图三人上场。每张图最多重赛两次。",
        },
      ],
    },
    schedule: [{ label: "淘汰赛", at: null }],
  };
  await tx
    .update(editionState)
    .set({
      configuration,
      configurationVersion: edition.configurationVersion + 1,
    })
    .where(eq(editionState.slug, slug));
  await tx.insert(editionRevisions).values({
    editionSlug: slug,
    version: edition.configurationVersion + 1,
    configuration,
  });
  for (const [index, team] of roster.entries()) {
    const teamId = index === 0 ? fixture.homeTeamId : fixture.awayTeamId;
    await tx
      .update(teams)
      .set({ name: team.name, capacity: 6 })
      .where(eq(teams.id, teamId));
    const ids = [
      team.base,
      team.base + 1,
      team.base + 4,
      team.base + 5,
      team.base + 6,
      team.base + 7,
    ];
    for (const [i, userId] of ids.entries()) {
      await tx
        .insert(users)
        .values({ osuId: userId, username: team.names[i] })
        .onConflictDoUpdate({
          target: users.osuId,
          set: { username: team.names[i] },
        });
      const [registration] = await tx
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.editionSlug, slug),
            eq(registrations.userId, userId),
          ),
        );
      if (!registration)
        await tx.insert(registrations).values({
          editionSlug: slug,
          userId,
          status: "accepted",
          rulesVersion: "preview-bo9-v1",
          answers: {},
        });
      const [member] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.editionSlug, slug),
            eq(memberships.userId, userId),
            sql`${memberships.leftAt} IS NULL`,
          ),
        );
      if (member && member.teamId !== teamId)
        throw new Error("Player already belongs to another preview team.");
      if (!member)
        await tx.insert(memberships).values({
          editionSlug: slug,
          teamId,
          userId,
          origin: i === 0 ? "captain" : "draft",
        });
    }
  }
  await tx
    .update(users)
    .set({ username: "Archer" })
    .where(eq(users.osuId, 891001));
  await tx
    .update(users)
    .set({ username: "Rain" })
    .where(eq(users.osuId, 891002));
  const [round] = await tx
    .select()
    .from(tournamentRounds)
    .where(eq(tournamentRounds.id, fixture.roundId));
  if (!round.scoringRules) throw new Error("Round rules missing.");
  await tx
    .update(tournamentRounds)
    .set({
      name: "淘汰赛",
      version: round.version + 1,
      scoringRules: {
        ...round.scoringRules,
        version: "preview-bo9-v1",
        playersPerTeam: 3,
        series: { type: "first_to", wins: 5 },
        allowSubstitutions: true,
      },
    })
    .where(eq(tournamentRounds.id, round.id));
  await tx
    .update(fixtures)
    .set({ label: "星河 vs 青岚", version: fixture.version + 1 })
    .where(eq(fixtures.id, fixtureId));
  await tx
    .update(mappools)
    .set({ name: "淘汰赛图池", version: sql`${mappools.version} + 1` })
    .where(eq(mappools.id, fixture.mappoolId));
  const existing = (
    await tx
      .select()
      .from(mappoolEntries)
      .where(eq(mappoolEntries.poolId, fixture.mappoolId))
  ).sort((a, b) => a.beatmapId - b.beatmapId);
  if (existing.length > 15)
    throw new Error("Unexpected preview pool; no entries removed.");
  let i = 0;
  for (const [category, count] of slots)
    for (let position = 1; position <= count; position++, i++) {
      const value = {
        poolId: fixture.mappoolId,
        category,
        position,
        beatmapId: 990001 + i,
        metadata: {
          setId: 990001 + i,
          title: titles[i],
          artist: artists[i % artists.length],
          difficulty: category === "TB" ? "Finale" : "Expert",
          mapper: "Aoi",
          stars: 4.8 + (i % 5) * 0.2,
          bpm: 160 + (i % 4) * 10,
          duration: 130 + i * 5,
        },
      };
      if (existing[i])
        await tx
          .update(mappoolEntries)
          .set(value)
          .where(eq(mappoolEntries.id, existing[i].id));
      else await tx.insert(mappoolEntries).values(value);
    }
  const counts = await tx
    .select({ teamId: memberships.teamId, count: sql<number>`count(*)::int` })
    .from(memberships)
    .where(
      and(
        inArray(memberships.teamId, [fixture.homeTeamId, fixture.awayTeamId]),
        sql`${memberships.leftAt} IS NULL`,
      ),
    )
    .groupBy(memberships.teamId);
  if (counts.some((c) => c.count !== 6))
    throw new Error("Each preview team must have exactly six active players.");
});
workspace = await refereeWorkspace(actor, slug, fixtureId);
async function send(action: Record<string, unknown>) {
  workspace = (
    await refereeCommand(actor, slug, fixtureId, {
      ...action,
      expectedRevision: workspace.session?.revision ?? 0,
      dependencyFingerprint: workspace.dependencyFingerprint,
      requestKey: randomUUID(),
    })
  ).workspace;
}
await send({ action: "reconfirm_dependencies" });
const step = (
  kind: "ban" | "pick" | "tb",
  actor: "firstBan" | "secondBan" | "firstPick" | "secondPick" | "neutral",
) => ({
  kind,
  actor,
  categories: kind === "tb" ? ["TB"] : [],
  entryIds: [],
  avoidRepeatCategory: false,
  tiedAt: kind === "tb" ? 4 : null,
});
const policy = refereePolicySchema.parse({
  maxReplaysPerMap: 2,
  steps: [
    step("ban", "firstBan"),
    step("ban", "secondBan"),
    ...Array.from({ length: 8 }, (_, i) =>
      step("pick", i % 2 ? "secondPick" : "firstPick"),
    ),
    step("tb", "neutral"),
  ],
  commands: {
    ...workspace.policy!.commands!,
    categoryMods: {
      NM: { mods: [], freemod: false },
      HD: { mods: ["HD"], freemod: false },
      HR: { mods: ["HR"], freemod: false },
      DT: { mods: ["DT"], freemod: false },
      FM: { mods: [], freemod: true },
      TB: { mods: [], freemod: true },
    },
  },
});
await send({
  action: "configure_policy",
  policy,
  expectedPolicyRevision: workspace.policyRevision,
});
await send({
  action: "save_settings",
  settings: {
    ...workspace.session!.settings,
    roomName: "OCLR: 星河 vs 青岚",
    streamerUsername: "Rain",
  },
});
console.log("星河 vs 青岚 · 6人队伍 · 3v3 · BO9 · 15图 · 每图最多2次重赛");
await closeDb();
