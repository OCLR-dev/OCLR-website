import { db } from "../../src/db";
import {
  captains,
  memberships,
  playerNames,
  registrations,
  teamCoaches,
  teams,
  userProfileCache,
  users,
} from "../../src/db/schema";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { assertTestDatabase } from "../database";
import { seedEditions } from "./editions";
import { edition } from "./edition";
import { historicalArchive } from "./historical-archive";
import { profileResponse } from "./osu-profile";

/** Dedicated synthetic edition and identities; no real provider traffic/data. */
export async function seedDirectoryFilters(mobile: boolean) {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const base = mobile ? 942600 : 942500;
  const slug = `directory-filters-${mobile ? "mobile" : "desktop"}-${Date.now()}-test`;
  const history = `${slug}-history`;
  const empty = `${slug}-empty`;
  await seedEditions([
    { ...edition, slug },
    {
      ...edition,
      slug: history,
      status: "completed",
      registration: null,
      archive: {
        ...historicalArchive,
        editionSlug: history,
        players: [
          ...historicalArchive.players,
          {
            ...historicalArchive.players[2],
            osuId: 91006,
            role: "free_agent",
            username: "Recorded Free Agent",
            teamId: null,
            tier: null,
            source: "Players!F1",
          },
        ],
      },
    },
    { ...edition, slug: empty },
  ]);
  const names = [
    "Alpha Captain",
    "Bravo Player",
    "Bravo Player",
    "Delta Zero",
    "Echo Missing",
  ];
  const ids = Array.from({ length: 31 }, (_, i) => base + i);
  await db()
    .insert(users)
    .values(
      ids.map((osuId, i) => ({
        osuId,
        username: names[i] ?? `Synthetic Player ${String(i).padStart(2, "0")}`,
      })),
    )
    .onConflictDoNothing();
  await db()
    .insert(registrations)
    .values(
      ids.map((userId, i) => ({
        userId,
        editionSlug: slug,
        rulesVersion: "test-v1",
        status: i === 30 ? ("pending" as const) : ("accepted" as const),
        answers: { private: "PRIVATE_FILTER_ANSWER" },
        statusReason: "PRIVATE_FILTER_NOTE",
      })),
    )
    .onConflictDoNothing();
  await db()
    .insert(captains)
    .values([
      { editionSlug: slug, userId: base, position: 1, published: true },
      { editionSlug: slug, userId: base + 4, position: 2, published: false },
    ])
    .onConflictDoNothing();
  const [team] = await db()
    .insert(teams)
    .values({
      editionSlug: slug,
      captainId: base,
      name: `Synthetic Published Team ${"LongName".repeat(12)}`,
      identityPublished: true,
      rosterPublished: true,
      finalizedAt: new Date(),
    })
    .returning();
  await db()
    .insert(teams)
    .values({
      editionSlug: slug,
      captainId: base + 4,
      name: "PRIVATE_UNPUBLISHED_TEAM",
      identityPublished: false,
    });
  await db()
    .insert(memberships)
    .values(
      ids.slice(0, 3).map((userId) => ({
        editionSlug: slug,
        teamId: team.id,
        userId,
        origin: userId === base ? "captain" : "draft",
      })),
    );
  await db()
    .insert(teamCoaches)
    .values({ editionSlug: slug, teamId: team.id, userId: base + 1 });
  await db()
    .insert(playerNames)
    .values([
      {
        osuId: base + 1,
        username: "Known Public Alias",
        source: "osu_previous",
        published: true,
      },
      {
        osuId: base + 1,
        username: "PRIVATE_ACCOUNT_ALIAS",
        source: "account",
        published: false,
      },
      {
        osuId: 91003,
        username: "Historical Alias",
        source: "osu_previous",
        published: true,
      },
    ])
    .onConflictDoNothing();
  for (const [i, osuId] of ids.entries()) {
    const profile = normalizeOsuProfile(
      { ...profileResponse, id: osuId },
      osuId,
      "osu",
    );
    profile.statistics.globalRank = i === 0 ? 100 : i < 3 ? 2 : null;
    profile.statistics.pp = i === 0 ? 20 : i < 3 ? 2000 : i === 3 ? 0 : null;
    await db()
      .insert(userProfileCache)
      .values({
        osuId,
        mode: "osu",
        profile,
        attemptedAt: new Date(),
        retryAt: new Date(Date.now() + 3600000),
      })
      .onConflictDoNothing();
  }
  return { slug, history, empty, base, teamId: team.id };
}
