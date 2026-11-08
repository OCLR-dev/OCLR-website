import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  awardSettings,
  captains,
  editionEvents,
  editionRevisions,
  editionState,
  registrations,
  playerNames,
  staffRoles,
  tournamentStages,
  users,
} from "../../src/db/schema";
import { assertEditionConfigurationsReady } from "../../scripts/release-editions-check";
import { deleteUnusedTournamentDraft } from "../../src/lib/delete-tournament-draft";
import {
  createTournament,
  readTournament,
  tournamentCommand,
  tournamentForAdmin,
  tournamentList,
} from "../../src/lib/tournaments";
import { assertOperationalEdition } from "../../src/lib/archive-guard";
import { mappoolCommand } from "../../src/lib/mappools";
import { changeStaffRole } from "../../src/lib/staff-roles";
import { withReadChannel } from "../../src/lib/read-channel";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { editionSchema } from "../../src/lib/editions";
import { historicalArchive } from "../fixtures/historical-archive";
import { POST as deleteRoute } from "../../src/app/api/admin/tournaments/[edition]/delete-draft/route";
import { requireUser } from "../../src/lib/auth/user";
import { deleteTournamentDraftWrite } from "../../src/lib/tournament-write-contracts";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/auth/user", () => ({ requireUser: vi.fn() }));
const origin = "https://oclr.example.test";

const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 327001, username: "Synthetic Global Admin" };
const scoped = { osuId: 327002, username: "Synthetic Scoped Admin" };
const slug = "blank-test-draft";
const command = { expectedRevision: 0, confirmed: true, confirmSlug: slug };
const remove = (input: unknown = command) =>
  deleteUnusedTournamentDraft(admin, slug, input);

describe.skipIf(!url)("unused blank tournament draft deletion", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    vi.stubEnv("OCLR_DATA_SOURCE", "database");
    await db().execute(
      sql`TRUNCATE edition_state, users, player_names CASCADE`,
    );
    await db().insert(users).values([admin, scoped]);
    await createTournament(admin, {
      slug,
      name: "Synthetic unused draft",
      confirmed: true,
    });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("removes the draft from readers and routes but retains immutable history and reserves its slug", async () => {
    const revisions = await db().select().from(editionRevisions);
    const events = await db().select().from(editionEvents);
    const path = deleteTournamentDraftWrite.path.replace("{edition}", slug);
    vi.mocked(requireUser).mockResolvedValue(admin);
    const deleteThroughBrowser = () =>
      deleteRoute(new Request(origin + path, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(command),
      }), { params: Promise.resolve({ edition: slug }) });
    const response = await deleteThroughBrowser();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(deleteTournamentDraftWrite.response.parse(body)).toEqual(body);
    expect(body).toEqual({ deleted: true, slug });
    expect(await readTournament(slug)).toBeUndefined();
    expect((await tournamentList(admin)).rows).toEqual([]);
    await expect(tournamentForAdmin(admin, slug)).rejects.toMatchObject({
      status: 404,
    });
    expect(await db().select().from(editionRevisions)).toEqual(revisions);
    const after = await db().select().from(editionEvents);
    expect(after).toEqual(expect.arrayContaining(events));
    expect(
      after.find((event) => event.kind === "tournament_delete_draft"),
    ).toMatchObject({
      actorId: admin.osuId,
      editionSlug: slug,
      detail: {
        before: { revision: 0 },
        after: { configuration: null, revision: 1 },
      },
    });
    expect((await deleteThroughBrowser()).status).toBe(404);
    await expect(assertOperationalEdition(slug, db())).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      createTournament(admin, { slug, name: "Reuse", confirmed: true }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db().select().from(editionEvents)).toHaveLength(2);
  });

  it("allows release after an audited deletion without restoring or removing its tombstone", async () => {
    await expect(assertEditionConfigurationsReady()).resolves.toBeUndefined();
    await remove();
    const before = await db().select().from(editionState);
    await expect(assertEditionConfigurationsReady()).resolves.toBeUndefined();
    expect(await db().select().from(editionState)).toEqual(before);
    expect(await readTournament(slug)).toBeUndefined();
    await db()
      .insert(editionState)
      .values({ slug: "unconfigured-legacy-test" });
    await expect(assertEditionConfigurationsReady()).rejects.toThrow(
      "Legacy edition anchors",
    );
  });

  it("retains the deletion exemption if the actor account was later removed", async () => {
    await remove();
    await db()
      .update(editionEvents)
      .set({ actorId: null })
      .where(eq(editionEvents.kind, "tournament_delete_draft"));
    await expect(assertEditionConfigurationsReady()).resolves.toBeUndefined();
  });

  it.each([
    "stale-revision",
    "missing-after",
    "missing-configuration",
    "wrong-entity",
    "wrong-event",
  ])(
    "does not treat incomplete deletion evidence as an exemption: %s",
    async (change) => {
      await remove();
      const [event] = await db()
        .select()
        .from(editionEvents)
        .where(eq(editionEvents.kind, "tournament_delete_draft"));
      if (change === "stale-revision") {
        await db()
          .update(editionState)
          .set({ configurationVersion: 2 })
          .where(eq(editionState.slug, slug));
      } else {
        const detail = structuredClone(event.detail) as Record<string, unknown>;
        if (change === "missing-after") delete detail.after;
        if (change === "missing-configuration") detail.after = { revision: 1 };
        if (change === "wrong-entity")
          detail.entity = { type: "tournament", id: "other-test" };
        await db()
          .update(editionEvents)
          .set({
            detail,
            ...(change === "wrong-event" ? { kind: "tournament_general" } : {}),
          })
          .where(eq(editionEvents.id, event.id));
      }
      await expect(assertEditionConfigurationsReady()).rejects.toThrow(
        "Legacy edition anchors",
      );
    },
  );

  it("allows correcting identity on an otherwise empty, unused draft", async () => {
    const current = await readTournament(slug);
    await tournamentCommand(admin, slug, {
      action: "general",
      expectedRevision: 0,
      confirmed: true,
      name: "Renamed accidental draft",
      season: null,
      summary: "",
      timeZone: "Asia/Taipei",
      branding: current!.edition.branding,
      status: "upcoming",
    });
    await expect(remove()).rejects.toMatchObject({ status: 409 });
    await expect(
      remove({ ...command, expectedRevision: 1 }),
    ).resolves.toMatchObject({ deleted: true });
  });

  it.each([
    {},
    { ...command, confirmed: false },
    { ...command, confirmSlug: "another-draft" },
    { ...command, actorId: scoped.osuId },
  ])(
    "requires exact confirmation and rejects extra fields: %j",
    async (input) => {
      await expect(remove(input)).rejects.toMatchObject({ status: 400 });
      expect(await readTournament(slug)).toBeDefined();
      expect(await db().select().from(editionEvents)).toHaveLength(1);
    },
  );

  it("rejects scoped Admin, other roles, remote mode and the read API channel", async () => {
    await db().insert(staffRoles).values({
      userId: scoped.osuId,
      role: "admin",
      editionSlug: slug,
      grantedBy: admin.osuId,
    });
    await expect(
      deleteUnusedTournamentDraft(scoped, slug, command),
    ).rejects.toMatchObject({ status: 403 });
    vi.stubEnv("OCLR_DATA_SOURCE", "remote");
    await expect(remove()).rejects.toMatchObject({ status: 403 });
    vi.stubEnv("OCLR_DATA_SOURCE", "database");
    await expect(withReadChannel(() => remove())).rejects.toMatchObject({
      status: 403,
    });
    expect(await readTournament(slug)).toBeDefined();
  });

  it("protects earlier content after it has been cleared", async () => {
    const current = (await readTournament(slug))!.edition;
    const fields = {
      name: current.name,
      season: null,
      timeZone: "UTC",
      branding: current.branding,
      status: "upcoming",
    };
    await tournamentCommand(admin, slug, {
      ...fields,
      action: "general",
      expectedRevision: 0,
      confirmed: true,
      summary: "Previously used",
    });
    await tournamentCommand(admin, slug, {
      ...fields,
      action: "general",
      expectedRevision: 1,
      confirmed: true,
      summary: "",
    });
    await expect(
      remove({ ...command, expectedRevision: 2 }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it.each([
    { rules: edition.rules },
    { eligibility: "Not empty" },
    {
      automaticEligibility: {
        minPp: null,
        maxPp: 100,
        minRank: null,
        maxRank: null,
      },
    },
    { rankGraceRange: { minRank: 1, maxRank: 10 } },
    { registration: edition.registration },
    { schedule: [{ label: "Recorded milestone", at: null }] },
    { status: "completed" },
    { published: true, summary: "Previously public" },
    {
      branding: {
        logo: "/oclr-s11-square-logo.webp",
        background: null,
        keyVisual: null,
      },
    },
    { defaultAppearance: "cute-pastel" },
    {
      archive: { ...historicalArchive, editionSlug: slug },
      status: "completed",
    },
  ])("protects nonblank configurations: %j", async (fields) => {
    const configuration = {
      ...(await readTournament(slug))!.edition,
      ...fields,
    };
    const { slug: ignored, ...saved } = editionSchema.parse(configuration);
    void ignored;
    await db()
      .update(editionState)
      .set({ configuration: saved })
      .where(eq(editionState.slug, slug));
    await expect(remove()).rejects.toMatchObject({ status: 409 });
    expect(await db().select().from(editionEvents)).toHaveLength(1);
  });

  it.each([
    { lockedAt: new Date() },
    { registrationPausedAt: new Date() },
    { setupVersion: 1 },
    { poolPublished: true },
  ])("protects setup/publication state: %j", async (fields) => {
    await db()
      .update(editionState)
      .set(fields)
      .where(eq(editionState.slug, slug));
    await expect(remove()).rejects.toMatchObject({ status: 409 });
  });

  it.each([
    "registration",
    "captain",
    "stage",
    "award",
    "revoked-role",
    "retained-name-evidence",
    "event",
  ])("protects existing %s data", async (kind) => {
    if (kind === "registration")
      await db()
        .insert(registrations)
        .values({ editionSlug: slug, userId: scoped.osuId, answers: {} });
    if (kind === "captain")
      await db()
        .insert(captains)
        .values({ editionSlug: slug, userId: scoped.osuId, position: 1 });
    if (kind === "stage")
      await db()
        .insert(tournamentStages)
        .values({ editionSlug: slug, kind: "group" });
    if (kind === "award")
      await db().insert(awardSettings).values({ editionSlug: slug });
    if (kind === "revoked-role")
      await db().insert(staffRoles).values({
        editionSlug: slug,
        userId: scoped.osuId,
        role: "admin",
        grantedBy: admin.osuId,
        revokedAt: new Date(),
      });
    if (kind === "retained-name-evidence")
      await db().insert(playerNames).values({
        osuId: scoped.osuId,
        username: "Synthetic retained archive name",
        source: "archive_player",
        editionSlug: slug,
        reference: "Synthetic!A2",
      });
    if (kind === "event")
      await db().insert(editionEvents).values({
        editionSlug: slug,
        actorId: admin.osuId,
        kind: "tournament_publication",
        detail: {},
      });
    await expect(remove()).rejects.toMatchObject({ status: 409 });
    expect(await readTournament(slug)).toBeDefined();
  });

  it("serializes two deletions and a concurrent settings save", async () => {
    const results = await Promise.allSettled([
      remove(),
      remove(),
      tournamentCommand(admin, slug, {
        action: "schedule",
        expectedRevision: 0,
        confirmed: true,
        schedule: [{ label: "Concurrent milestone", at: null }],
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const current = await readTournament(slug);
    expect(current ? current.edition.schedule.length : 0).toBe(current ? 1 : 0);
    expect(await db().select().from(editionEvents)).toHaveLength(2);
  });

  it("serializes role grants with deletion without leaving roles on a removed draft", async () => {
    const results = await Promise.allSettled([
      remove(),
      changeStaffRole(admin, {
        action: "grant",
        userId: scoped.osuId,
        role: "mappooler",
        editionSlug: slug,
        confirmed: true,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await db().select().from(staffRoles)).toHaveLength(
      (await readTournament(slug)) ? 1 : 0,
    );
  });

  it("serializes operational setup against removal and rejects later stale writers", async () => {
    const setup = {
      action: "round_create",
      stage: "group",
      name: "Synthetic round",
      position: 1,
      confirmed: true,
    };
    const results = await Promise.allSettled([
      remove(),
      mappoolCommand(admin, slug, setup),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const current = await readTournament(slug);
    expect(await db().select().from(tournamentStages)).toHaveLength(
      current ? 1 : 0,
    );
    if (!current)
      await expect(mappoolCommand(admin, slug, setup)).rejects.toMatchObject({
        status: 404,
      });
  });

  it("fails closed when configuration history is incomplete", async () => {
    await db()
      .delete(editionRevisions)
      .where(eq(editionRevisions.editionSlug, slug));
    await expect(remove()).rejects.toMatchObject({ status: 409 });
    expect(await readTournament(slug)).toBeDefined();
  });

  it("rolls back removal if audit persistence fails", async () => {
    await db().execute(
      sql`CREATE FUNCTION oclr_test_reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'tournament_delete_draft' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`,
    );
    await db().execute(
      sql`CREATE TRIGGER oclr_test_reject_delete BEFORE INSERT ON edition_events FOR EACH ROW EXECUTE FUNCTION oclr_test_reject_delete()`,
    );
    try {
      await expect(remove()).rejects.toThrow();
      expect((await readTournament(slug))?.revision).toBe(0);
      expect(await db().select().from(editionEvents)).toHaveLength(1);
    } finally {
      await db().execute(
        sql`DROP TRIGGER oclr_test_reject_delete ON edition_events`,
      );
      await db().execute(sql`DROP FUNCTION oclr_test_reject_delete()`);
    }
  });
});
