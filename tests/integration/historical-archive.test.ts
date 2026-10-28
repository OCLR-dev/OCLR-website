import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  users,
  staffRoles,
  editionEvents,
  registrations,
  teams,
} from "../../src/db/schema";
import { tournamentCommand, readTournament } from "../../src/lib/tournaments";
import { getPublicEdition } from "../../src/lib/content";
import { assertOperationalEdition } from "../../src/lib/archive-guard";
import { mappoolCommand } from "../../src/lib/mappools";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import { historicalSourceDetails } from "../fixtures/historical-source-details";
import { assertTestDatabase } from "../database";
import { readFileSync } from "node:fs";
import {
  archiveCounts,
  publicHistoricalArchive,
} from "../../src/lib/historical-archive";
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 390001, username: "Archive Admin" };
const scoped = { osuId: 390002, username: "Other edition Admin" };
const slug = "history-test";
const command = (revision: number, archive = historicalArchive) => ({
  action: "archive",
  expectedRevision: revision,
  confirmed: true,
  archive,
});
describe.skipIf(!url)("historical archive transactions", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await db().insert(users).values([admin, scoped]);
    await seedEditions([
      {
        ...edition,
        slug,
        status: "completed",
        registration: null,
        published: false,
      },
      { ...edition, slug: "other" },
    ]);
    await db().insert(staffRoles).values({
      userId: scoped.osuId,
      role: "admin",
      editionSlug: "other",
      grantedBy: admin.osuId,
    });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("resolves one published source identity with scoped authority, optimistic revision and audit", async () => {
    const archive = historicalSourceDetails(slug);
    await tournamentCommand(admin, slug, command(0, archive));
    await tournamentCommand(admin, slug, {
      action: "publication",
      expectedRevision: 1,
      confirmed: true,
      published: true,
    });
    const resolve = {
      action: "resolve-archive-identity",
      expectedRevision: 2,
      confirmed: true,
      unresolvedId: "unknown-captain",
      osuId: 91991,
      source: "Synthetic organizer confirmation",
    };
    await expect(
      tournamentCommand(scoped, slug, resolve),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      tournamentCommand(admin, slug, {
        ...resolve,
        osuId: archive.players[0].osuId,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      tournamentCommand(admin, slug, { ...resolve, osuId: 91005 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      tournamentCommand(admin, slug, { ...resolve, unresolvedId: "missing" }),
    ).rejects.toMatchObject({ status: 409 });
    await db().insert(staffRoles).values({
      userId: scoped.osuId,
      role: "admin",
      editionSlug: slug,
      grantedBy: admin.osuId,
    });
    await tournamentCommand(scoped, slug, resolve);
    const saved = (await readTournament(slug))!;
    expect(saved.revision).toBe(3);
    expect(saved.edition.published).toBe(true);
    expect(saved.edition.archive!.players.at(-1)).toEqual({
      ...archive.unresolvedPlayers![0],
      id: undefined,
      osuId: 91991,
    });
    expect(saved.edition.archive!.unresolvedPlayers).toEqual([]);
    for (const key of [
      "matches",
      "standings",
      "teams",
      "pools",
      "picks",
    ] as const)
      expect(saved.edition.archive![key]).toEqual(archive[key]);
    expect(saved.edition.archive!.sourceFacts!.at(-1)?.source).toBe(
      resolve.source,
    );
    expect(
      publicHistoricalArchive(saved.edition.archive!).sourceFacts,
    ).toBeUndefined();
    expect(await db().select().from(users)).toHaveLength(2);
    expect(await db().select().from(registrations)).toHaveLength(0);
    expect(await db().select().from(teams)).toHaveLength(0);
    const events = await db()
      .select()
      .from(editionEvents)
      .where(eq(editionEvents.editionSlug, slug));
    expect(events).toHaveLength(3);
    expect(events.at(-1)?.kind).toBe("tournament_resolve-archive-identity");
    await expect(
      tournamentCommand(scoped, slug, resolve),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      tournamentCommand(scoped, slug, { ...resolve, expectedRevision: 3 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      tournamentCommand(admin, slug, command(3, archive)),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("imports privately, keeps source identities out of accounts, and publishes separately", async () => {
    await tournamentCommand(admin, slug, command(0));
    expect((await readTournament(slug))?.edition.archive).toEqual(
      historicalArchive,
    );
    expect(await getPublicEdition(slug)).toBeUndefined();
    expect(await db().select().from(users)).toHaveLength(2);
    expect(await db().select().from(registrations)).toHaveLength(0);
    expect(await db().select().from(teams)).toHaveLength(0);
    const events = await db()
      .select()
      .from(editionEvents)
      .where(eq(editionEvents.editionSlug, slug));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("tournament_archive");
    await tournamentCommand(admin, slug, {
      action: "publication",
      expectedRevision: 1,
      confirmed: true,
      published: true,
    });
    expect((await getPublicEdition(slug))?.archive).toEqual(historicalArchive);
    await expect(
      tournamentCommand(admin, slug, command(2)),
    ).rejects.toMatchObject({ status: 409 });
    await tournamentCommand(admin, slug, {
      action: "publication",
      expectedRevision: 2,
      confirmed: true,
      published: false,
    });
    expect(await getPublicEdition(slug)).toBeUndefined();
    await tournamentCommand(admin, slug, command(3));
    expect((await readTournament(slug))?.revision).toBe(3); // Identical import is a no-op.
  });
  it("approves saved historical reviews atomically with scope and revision checks while preserving publication and evidence", async () => {
    const archive = {
      ...JSON.parse(
        readFileSync("docs/imports/s6-confirmed-archive.json", "utf8"),
      ),
      editionSlug: slug,
    };
    await tournamentCommand(admin, slug, command(0, archive));
    await tournamentCommand(admin, slug, {
      action: "publication",
      expectedRevision: 1,
      confirmed: true,
      published: true,
    });
    const approval = {
      action: "approve-archive-matches",
      expectedRevision: 2,
      confirmed: true,
      matchIds: archive.matches.map((m: { id: string }) => m.id),
    };
    await expect(
      tournamentCommand(scoped, slug, approval),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      tournamentCommand(admin, slug, {
        ...approval,
        matchIds: [approval.matchIds[0], approval.matchIds[0]],
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      tournamentCommand(admin, slug, { ...approval, expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    const raced = await Promise.allSettled([
      tournamentCommand(admin, slug, approval),
      tournamentCommand(admin, slug, approval),
    ]);
    expect(raced.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const saved = (await readTournament(slug))!;
    expect(saved.revision).toBe(3);
    expect(saved.edition.published).toBe(true);
    expect(archiveCounts(saved.edition.archive!).results).toBe(33);
    expect(
      saved.edition.archive!.matches.flatMap((m) => m.review!.games),
    ).toEqual(
      archive.matches.flatMap(
        (m: { review: { games: unknown[] } }) => m.review.games,
      ),
    );
    expect((await getPublicEdition(slug))?.archive).toEqual(
      publicHistoricalArchive(saved.edition.archive!),
    );
    expect(
      (await db().select().from(editionEvents)).filter(
        (e) => e.kind === "tournament_approve-archive-matches",
      ),
    ).toHaveLength(1);
    await expect(
      tournamentCommand(admin, slug, { ...approval, expectedRevision: 3 }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("persists an approved draw privately and releases it only on publication", async () => {
    const archive = historicalSourceDetails(slug);
    archive.matches = [archive.matches[0]];
    archive.matches[0].review!.workingScore = [5, 5];
    await tournamentCommand(admin, slug, command(0, archive));
    await tournamentCommand(admin, slug, {
      action: "approve-archive-matches",
      expectedRevision: 1,
      confirmed: true,
      matchIds: [archive.matches[0].id],
    });
    const saved = (await readTournament(slug))!;
    expect(saved.edition.published).toBe(false);
    expect(saved.edition.archive!.matches[0]).toMatchObject({
      score: [5, 5],
      review: { status: "approved" },
    });
    expect(await getPublicEdition(slug)).toBeUndefined();
    await tournamentCommand(admin, slug, {
      action: "publication",
      expectedRevision: 2,
      confirmed: true,
      published: true,
    });
    const published = (await getPublicEdition(slug))!.archive!;
    expect(published.matches[0].score).toEqual([5, 5]);
    expect(published.matches[0].review).toBeUndefined();
    expect(published.sourceFacts).toBeUndefined();
  });
  it("enforces edition scope, revision, source matching and complete rollback", async () => {
    await expect(
      tournamentCommand(scoped, slug, command(0)),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      tournamentCommand(
        admin,
        slug,
        command(0, { ...historicalArchive, editionSlug: "other" }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect((await readTournament(slug))?.revision).toBe(0);
    expect(await db().select().from(editionEvents)).toHaveLength(0);
    const outcomes = await Promise.allSettled([
      tournamentCommand(admin, slug, command(0)),
      tournamentCommand(admin, slug, command(0)),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db().select().from(editionEvents)).toHaveLength(1);
  });
  it("prevents changing archive editions back into active competitions", async () => {
    await tournamentCommand(admin, slug, command(0));
    await expect(assertOperationalEdition(slug, db())).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      tournamentCommand(admin, slug, {
        action: "registration",
        expectedRevision: 1,
        confirmed: true,
        registration: edition.registration,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const { name, season, summary, timeZone, branding } = edition;
    await expect(
      tournamentCommand(admin, slug, {
        action: "general",
        expectedRevision: 1,
        confirmed: true,
        name,
        season,
        summary,
        timeZone,
        branding,
        status: "upcoming",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("round-trips source-only identities and pending scores privately without creating accounts", async () => {
    const archive = historicalSourceDetails(slug);
    await tournamentCommand(admin, slug, command(0, archive));
    const saved = await readTournament(slug);
    expect(saved?.edition.published).toBe(false);
    expect(saved?.edition.archive).toEqual(archive);
    expect(await getPublicEdition(slug)).toBeUndefined();
    expect(await db().select().from(users)).toHaveLength(2);
    expect(await db().select().from(registrations)).toHaveLength(0);
    expect(await db().select().from(teams)).toHaveLength(0);
  });
  it("blocks operational pool creation after archive import", async () => {
    await tournamentCommand(admin, slug, command(0));
    await expect(
      mappoolCommand(admin, slug, {
        action: "round_create",
        stage: "group",
        name: "New round",
        position: 1,
        confirmed: true,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Historical archives are edited through the archive importer.",
    });
  });
  it("does not replace an edition that already has operational rounds", async () => {
    await mappoolCommand(admin, slug, {
      action: "round_create",
      stage: "group",
      name: "Existing round",
      position: 1,
      confirmed: true,
    });
    await expect(
      tournamentCommand(admin, slug, command(0)),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "This tournament already has live competition data. Use a separate historical edition.",
    });
    expect((await readTournament(slug))?.edition.archive).toBeUndefined();
    expect((await readTournament(slug))?.revision).toBe(0);
  });
});
