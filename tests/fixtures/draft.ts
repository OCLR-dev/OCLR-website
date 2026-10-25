import { seedEditions } from "./editions";
import { edition } from "./edition";
import { assertTestDatabase } from "../database";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import {
  captains,
  editionState,
  registrations,
  teams,
  users,
} from "../../src/db/schema";
import { captainSetup, updateCaptains } from "../../src/lib/captains";
import { updateTeams } from "../../src/lib/teams";
import { draftCommand, staffDraft } from "../../src/lib/draft";
// Fixture provisioner for isolated databases only; never imported by application code.
export async function prepareDraft(
  slug: string,
  base: number,
  turns = 2,
  start = true,
  configure = true,
) {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  const staff = { osuId: base, username: `Synthetic Operator ${base}` };
  const a = { osuId: base + 1, username: `Synthetic Captain A ${base}` };
  const b = { osuId: base + 2, username: `Synthetic Captain B ${base}` };
  const players = Array.from({ length: Math.max(8, turns) }, (_, i) => ({
    osuId: base + 10 + i,
    username: `Synthetic Player ${base + 10 + i}`,
  }));
  await db()
    .insert(users)
    .values([staff, a, b, ...players])
    .onConflictDoNothing();
  await seedEditions([{ ...edition, slug }], false);
  await db().insert(editionState).values({ slug }).onConflictDoNothing();
  await db()
    .insert(registrations)
    .values(
      [a, b, ...players].map((p) => ({
        editionSlug: slug,
        userId: p.osuId,
        status: "accepted" as const,
        rulesVersion: "test-v1",
        answers: {},
      })),
    )
    .onConflictDoNothing();
  await updateCaptains(staff, slug, {
    command: { action: "appoint", userId: a.osuId },
    expectedVersion: 0,

    confirmed: true,
  });
  await updateCaptains(staff, slug, {
    command: { action: "appoint", userId: b.osuId },
    expectedVersion: 1,

    confirmed: true,
  });
  await updateTeams(staff, slug, {
    command: {
      action: "configure",
      teams: [
        {
          captainId: a.osuId,
          name: `Synthetic Team A ${base}`,
          capacity: null,
        },
        {
          captainId: b.osuId,
          name: `Synthetic Team B ${base}`,
          capacity: null,
        },
      ],
    },
    expectedVersion: 2,

    confirmed: true,
  });
  await updateCaptains(staff, slug, {
    command: { action: "publish", published: true, poolPublished: false },
    expectedVersion: 3,

    confirmed: true,
  });
  const teamRows = await db()
    .select()
    .from(teams)
    .where(eq(teams.editionSlug, slug));
  let version = 4;
  for (const t of teamRows) {
    await updateTeams(staff, slug, {
      command: {
        action: "publish",
        teamId: t.id,
        identityPublished: true,
        rosterPublished: false,
      },
      expectedVersion: version++,

      confirmed: true,
    });
  }
  await updateCaptains(staff, slug, {
    command: { action: "lock" },
    expectedVersion: version,
    confirmed: true,
  });
  const ordered = (await captainSetup(staff, slug)).captains;
  const sequence = Array.from(
    { length: turns },
    (_, i) => ordered[i % ordered.length].teamId!,
  );
  if (configure)
    await draftCommand(staff, slug, {
      command: {
        action: "configure",
        turnSequence: sequence,
        expectedSetupVersion: (await staffDraft(staff, slug)).edition!
          .setupVersion,
      },
      expectedVersion: 0,

      confirmed: true,
    });
  for (const action of start && configure
    ? ["ready", "start", "publish"]
    : []) {
    const session = (await staffDraft(staff, slug)).session!;
    await draftCommand(staff, slug, {
      command: { action },
      expectedVersion: session.version,
      confirmed: true,
    });
  }
  const appointed = await db()
    .select()
    .from(captains)
    .where(eq(captains.editionSlug, slug));
  return { staff, a, b, players, teamRows, appointed, sequence };
}
