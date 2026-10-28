import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { users, registrations, userProfileCache } from "../../src/db/schema";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { profileResponse } from "./osu-profile";
import { historicalArchive } from "./historical-archive";
import { edition } from "./edition";
import { seedEditions } from "./editions";
import { assertTestDatabase } from "../database";
export const historyUid = 361001;
export function historyEdition(
  slug: string,
  season: string | null,
  username: string,
) {
  return {
    ...edition,
    slug,
    season,
    name: `Synthetic season ${season ?? "unknown"}`,
    status: "completed" as const,
    registration: null,
    archive: {
      ...historicalArchive,
      formatVersion: 2 as const,
      editionSlug: slug,
      players: historicalArchive.players.map((p) =>
        p.osuId === 91003 ? { ...p, osuId: historyUid, username } : p,
      ),
      picks: historicalArchive.picks.map((p) => ({ ...p, osuId: historyUid })),
      rosterReplacements: [
        {
          id: "earlier-team",
          teamId: "beta",
          tier: null,
          people: [
            { osuId: historyUid, username, source: "PRIVATE_SOURCE_APPENDIX" },
            {
              osuId: null,
              username: "Unresolved same name",
              source: "Private!A2",
            },
          ],
          replacedAt: "2021-01-01T00:00:00Z",
          note: "Synthetic earlier roster",
          source: "Private!A1",
        },
      ],
    },
  };
}
/** Explicit isolated synthetic setup; never imported by the application. */
export async function seedPlayerHistory() {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  await db().execute(
    sql`TRUNCATE edition_state,users,user_profile_cache,player_names CASCADE`,
  );
  await seedEditions([
    historyEdition("history-five", "5", "Earlier β name"),
    historyEdition("history-ten", "10", "Later historical name"),
    historyEdition("history-three", "3", "Original historical name"),
    {
      ...historyEdition("private-history", "12", "PRIVATE_HISTORY_NAME"),
      published: false,
    },
    edition,
  ]);
  await db()
    .insert(users)
    .values([
      { osuId: historyUid, username: "Current login name" },
      { osuId: historyUid + 1, username: "Original historical name" },
    ]);
  await db()
    .insert(userProfileCache)
    .values({
      osuId: historyUid,
      mode: "osu",
      attemptedAt: new Date(),
      retryAt: new Date(),
      profile: normalizeOsuProfile(
        { ...profileResponse, id: historyUid, username: "Current login name" },
        historyUid,
        "osu",
      ),
    });
  return { uid: historyUid, registrations, users };
}
