import { applicationQuestions } from "./application-questions";
import { readdir, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { statisticsArchive, statisticsSource } from "./archive-statistics";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics";
import { randomUUID, createHash } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../../src/db";
import {
  staffRoles,
  registrations,
  userProfileCache,
  teams,
  mappoolReplays,
  mappoolEntries,
  historicalStatistics,
  playerMessages,
  contributorDirectory,
} from "../../src/db/schema";
import { seedPublicPolish, landscapeFixture } from "./public-polish";
import { prepareDraft } from "./draft";
import { seedEditions } from "./editions";
import { edition } from "./edition";
import { profileResponse } from "./osu-profile";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { storeTeamImage } from "../../src/lib/team-media";
import { storeReplay } from "../../src/lib/replay-storage";
import { parseReplay } from "../../src/lib/replay-parser";
import { syntheticReplay } from "./replay";
import { assertTestDatabase } from "../database";
/** Synthetic backend only; the remote frontend never imports this fixture or receives its database URL. */
export async function seedRemoteSite(base = 2711000) {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await db().execute(
    sql`TRUNCATE users,edition_state,user_profile_cache,site_settings,contributor_directory CASCADE`,
  );
  await db()
    .insert(contributorDirectory)
    .values({
      id: 1,
      entries: [
        {
          id: randomUUID(),
          name: "Synthetic published contributor",
          osuId: base + 9000,
          published: true,
        },
        {
          id: randomUUID(),
          name: "Synthetic private contributor",
          osuId: base + 9001,
          published: false,
        },
      ],
    });
  const admin = base - 100,
    referee = base - 99;
  const site = await seedPublicPolish(admin, referee, base);
  process.env.ADMIN_OSU_IDS = `${admin},${base - 1}`;
  const draft = await prepareDraft("remote-draft", base - 1);
  await seedEditions(
    [
      {
        ...edition,
        slug: "remote-registration",
        name: "Synthetic readonly registration",
        automaticEligibility: {
          minPp: 0,
          maxPp: 10,
          minRank: null,
          maxRank: null,
        },
        registration: {
          ...edition.registration!,
          questions: applicationQuestions,
        },
      },
      {
        ...edition,
        slug: "s9",
        season: "S9",
        name: "Synthetic historical S9",
        status: "completed",
        registration: null,
        archive: { ...statisticsArchive, editionSlug: "s9" },
      },
    ],
    false,
  );
  const archive = { ...statisticsArchive, editionSlug: "s9" };
  const snapshot = {
    archiveKey: statisticsArchiveKey(archive),
    source: statisticsSource(),
    poolId: archive.pools[0].id,
    included: [1, 2],
  };
  await db().insert(historicalStatistics).values({
    editionSlug: "s9",
    fixtureId: archive.matches[0].id,
    mpId: 999177,
    version: 2,
    draft: snapshot,
    published: snapshot,
    publishedAt: new Date(),
  });
  await db().insert(playerMessages).values({
    editionSlug: "test-cup",
    playerId: base,
    authorId: referee,
    requestId: randomUUID(),
    body: "Synthetic public saved message",
  });
  await db()
    .insert(staffRoles)
    .values({ userId: base, role: "developer", grantedBy: admin });
  const profile = normalizeOsuProfile(
    {
      ...profileResponse,
      id: base,
      username: "Synthetic remote subject",
      statistics: { ...profileResponse.statistics, pp: 0, global_rank: null },
    },
    base,
    "osu",
  );
  await db()
    .insert(userProfileCache)
    .values({
      osuId: base,
      mode: "osu",
      profile,
      attemptedAt: new Date(),
      retryAt: new Date(Date.now() + 3600000),
    });
  const key = await storeTeamImage(
    await sharp(Buffer.from(landscapeFixture)).png().toBuffer(),
  );
  await db()
    .update(teams)
    .set({ avatarKey: key })
    .where(eq(teams.id, site.home.teamId));
  const [entry] = await db()
    .select()
    .from(mappoolEntries)
    .where(eq(mappoolEntries.poolId, site.poolId!));
  const bytes = syntheticReplay(),
    replayId = randomUUID(),
    entryId = entry.id;
  await storeReplay(replayId, bytes);
  await db()
    .insert(mappoolReplays)
    .values({
      id: replayId,
      entryId,
      filename: "Synthetic readable replay.osr",
      description: "Synthetic stored read-only fixture",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
      summary: await parseReplay(bytes),
      uploaderId: base,
      uploaderName: "Synthetic remote subject",
    });
  const [registration] = await db()
    .select()
    .from(registrations)
    .where(eq(registrations.userId, base));
  return {
    ...site,
    draft,
    owner: base,
    admin,
    referee,
    registrationId: registration.id,
    replayId,
    entryId,
    replayBytes: bytes,
  };
}
export async function remoteBusinessState(includeCredentialState = false) {
  const tables = await db().execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname='public' AND (${includeCredentialState} OR tablename NOT IN ('developer_api_tokens','developer_api_events','sessions')) ORDER BY tablename`,
  );
  const rows: unknown[] = [];
  for (const { tablename } of tables.rows)
    rows.push([
      tablename,
      (
        await db().execute(
          sql.raw(
            `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) data FROM "${tablename}" t`,
          ),
        )
      ).rows[0].data,
    ]);
  return rows;
}

export async function remoteFileState(root = process.env.OCLR_MEDIA_DIR!) {
  const result: { path: string; sha256: string }[] = [];
  async function walk(directory: string, prefix = "") {
    for (const name of (await readdir(directory)).sort()) {
      const file = join(directory, name),
        relative = prefix + name,
        stat = await lstat(file);
      if (stat.isDirectory()) await walk(file, relative + "/");
      else if (stat.isFile())
        result.push({
          path: relative,
          sha256: createHash("sha256")
            .update(await readFile(file))
            .digest("hex"),
        });
      else throw new Error("Unexpected synthetic media entry");
    }
  }
  await walk(root);
  return result;
}
