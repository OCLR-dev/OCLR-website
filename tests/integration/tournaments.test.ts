import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { assertTestDatabase } from "../database";
import { db, closeDb } from "../../src/db";
import { createTournament, tournamentCommand } from "../../src/lib/tournaments";
import {
  tournamentForAdmin,
  tournamentList,
  readTournament,
  readTournaments,
  tournamentAppearanceScopes,
} from "../../src/lib/tournament-reads";
import {
  users,
  staffRoles,
  editionState,
  editionRevisions,
  editionEvents,
  registrations,
} from "../../src/db/schema";
import { submitRegistration } from "../../src/lib/registrations";
import {
  publicTournamentListModel,
  privateTournamentListModel,
} from "../../src/lib/public-read-models";
import { collectionPage } from "../../src/lib/read-api";
import { getPublicEdition } from "../../src/lib/content";
import { draftCommand, pickPlayer } from "../../src/lib/draft";
import { publicDraft, staffDraft } from "../../src/lib/draft-reads";
import { prepareDraft } from "../fixtures/draft";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { seasonAppearances } from "../../src/lib/preferences";
import { requireUser } from "../../src/lib/auth/user";
import { POST as createRoute } from "../../src/app/api/admin/tournaments/route";
import { POST as changeRoute } from "../../src/app/api/admin/tournaments/[edition]/route";
import {
  changeTournamentWrite,
  createTournamentWrite,
} from "../../src/lib/tournament-write-contracts";
import { extendedSchemas } from "../../src/lib/extended-read-resources";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/auth/user", () => ({ requireUser: vi.fn() }));
const origin = "https://oclr.example.test";
function post(path: string, input: unknown) {
  return new Request(origin + path, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
async function tournamentResponse(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const body = await response.json();
  expect(extendedSchemas.tournamentForAdmin.parse(body)).toEqual(body);
  return body;
}
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 330001, username: "Synthetic Tournament Admin" };
const mapper = { osuId: 330002, username: "Synthetic Mappooler" };
const referee = { osuId: 330003, username: "Synthetic Referee" };
const player = { osuId: 330004, username: "Synthetic Player" };
const fields = {
  name: "Synthetic Season 12",
  season: "12",
  summary: "Synthetic tournament configuration only.",
  timeZone: "Asia/Taipei",
  branding: { logo: null, background: null, keyVisual: null },
};
const create = () =>
  createTournament(admin, { ...fields, slug: "s12", confirmed: true });
const change = (revision: number, action: string, data: object) =>
  tournamentCommand(admin, "s12", {
    expectedRevision: revision,
    confirmed: true,
    action,
    ...data,
  });
const auditEvents = () =>
  db().select().from(editionEvents).where(eq(editionEvents.editionSlug, "s12"));
describe.skipIf(!url)("authoritative tournament edition storage", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "60001");
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await db().insert(users).values([admin, mapper, referee, player]);
    await seedEditions([
      edition,
      { ...edition, slug: "private-test-cup", published: false },
    ]);

    await db()
      .insert(staffRoles)
      .values([
        {
          userId: mapper.osuId,
          role: "mappooler",
          editionSlug: "test-cup",
          grantedBy: admin.osuId,
        },
        {
          userId: referee.osuId,
          role: "referee",
          editionSlug: "test-cup",
          grantedBy: admin.osuId,
        },
      ]);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("orders authorized lists and API pagination by numeric season before slicing", async () => {
    await seedEditions(
      [10, 11, 7, 8, 9, 12].map((season) => ({
        ...edition,
        slug: `s${season}`,
        season: String(season),
        name: `Synthetic Season ${season}`,
        published: season !== 12,
      })),
    );
    await db()
      .insert(staffRoles)
      .values(
        [7, 10, 11].map((season) => ({
          userId: mapper.osuId,
          role: "mappooler" as const,
          editionSlug: `s${season}`,
          grantedBy: admin.osuId,
        })),
      );
    expect(
      (await tournamentList(admin)).rows
        .filter((row) => row.season)
        .map((row) => row.season),
    ).toEqual(["12", "11", "10", "9", "8", "7"]);
    expect(
      (await tournamentList(mapper)).rows
        .filter((row) => row.season)
        .map((row) => row.season),
    ).toEqual(["11", "10", "7"]);
    expect(
      (await publicTournamentListModel())
        .filter((row) => row.season)
        .map((row) => row.season),
    ).toEqual(["11", "10", "9", "8", "7"]);
    const all = await privateTournamentListModel();
    const first = collectionPage(all, new URLSearchParams({ pageSize: "2" }));
    expect(first.data.map((row) => row.season)).toEqual(["12", "11"]);
    const second = collectionPage(
      all,
      new URLSearchParams({
        page: "2",
        pageSize: "2",
        version: first.meta!.pagination!.collectionVersion,
      }),
    );
    expect(second.data.map((row) => row.season)).toEqual(["10", "9"]);
  });
  it("saves edition-scoped EZ statistics multipliers with revision, permissions and audit", async () => {
    await create();
    const payload = {
      ...fields,
      status: "upcoming",
      ezScoreMultiplier: 1.2345,
    };
    const path = changeTournamentWrite.path.replace("{edition}", "s12");
    const update = (extra: object = {}) =>
      changeRoute(post(path, {
        ...payload,
        action: "general",
        expectedRevision: 0,
        confirmed: true,
        ...extra,
      }), { params: Promise.resolve({ edition: "s12" }) });
    vi.mocked(requireUser).mockResolvedValue(mapper);
    expect((await update()).status).toBe(403);
    vi.mocked(requireUser).mockResolvedValue(admin);
    const saved = await tournamentResponse(await update(), 200);
    expect(saved.revision).toBe(1);
    expect(saved.edition.ezScoreMultiplier).toBe(1.2345);
    expect((await readTournament("s12"))?.edition.ezScoreMultiplier).toBe(
      1.2345,
    );
    expect(
      (await readTournament("test-cup"))?.edition.ezScoreMultiplier,
    ).toBeUndefined();
    const event = (await auditEvents()).find(
      (e) => e.kind === "tournament_general",
    )!;
    expect(JSON.stringify(event.detail)).toContain(
      '"ezScoreMultiplier":1.2345',
    );
    expect((await update({ ezScoreMultiplier: 2 })).status).toBe(409);
    await expect(
      tournamentCommand(mapper, "s12", {
        action: "general",
        ...payload,
        expectedRevision: saved.revision,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
    for (const invalid of [0, -1, 0.00001, 100.0001, 1.00001])
      await expect(
        change(saved.revision, "general", {
          ...payload,
          ezScoreMultiplier: invalid,
        }),
      ).rejects.toMatchObject({ status: 400 });
    const withoutField = await change(saved.revision, "general", {
      ...fields,
      status: "upcoming",
    });
    expect(withoutField.edition.ezScoreMultiplier).toBe(1.2345);
    const cleared = await change(withoutField.revision, "general", {
      ...payload,
      ezScoreMultiplier: null,
    });
    expect(cleared.edition.ezScoreMultiplier).toBeNull();
  });

  it("persists competition intervals with revision, authorization and transactional audit", async () => {
    await create();
    const schedule = [
      {
        label: "Synthetic group",
        kind: "group",
        at: "2026-10-29T00:00:00Z",
        endAt: "2026-10-30T00:00:00Z",
      },
      { label: "Synthetic final", kind: "knockout", at: null, endAt: null },
      { label: "Legacy event", at: null },
    ];
    const before = await readTournament("s12");
    const saved = await change(0, "schedule", { schedule });
    expect((await readTournament("s12"))?.edition.schedule).toEqual(schedule);
    expect(saved.edition.registration).toEqual(before?.edition.registration);
    await expect(change(0, "schedule", { schedule: [] })).rejects.toThrow();
    await expect(
      tournamentCommand(mapper, "s12", {
        action: "schedule",
        expectedRevision: saved.revision,
        confirmed: true,
        schedule: [],
      }),
    ).rejects.toThrow();
    await expect(
      change(saved.revision, "schedule", {
        schedule: [{ ...schedule[0], endAt: "2026-10-28T00:00:00Z" }],
      }),
    ).rejects.toThrow();
    expect((await readTournament("s12"))?.edition.schedule).toEqual(schedule);
    expect(await auditEvents()).toHaveLength(2);
  });
  it("stores optional appearance defaults with scoped authorization, revisions and audit", async () => {
    const created = await create();
    expect(created.edition.defaultAppearance).toBeUndefined();
    const command = {
      action: "general",
      ...fields,
      status: "upcoming",
      defaultAppearance: "swiss-minimal",
      expectedRevision: 0,
      confirmed: true,
    };
    for (const actor of [mapper, referee, player])
      await expect(
        tournamentCommand(actor, "s12", command),
      ).rejects.toMatchObject({ status: 403 });
    await expect(
      tournamentCommand(admin, "s12", {
        ...command,
        defaultAppearance: "arbitrary",
      }),
    ).rejects.toMatchObject({ status: 400 });
    const saved = await tournamentCommand(admin, "s12", command);
    expect(saved.edition.defaultAppearance).toBe("swiss-minimal");
    expect(saved.revision).toBe(1);
    await expect(
      tournamentCommand(admin, "s12", command),
    ).rejects.toMatchObject({ status: 409 });
    const events = await auditEvents();
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      actorId: admin.osuId,
      detail: {
        after: {
          configuration: { defaultAppearance: "swiss-minimal" },
          revision: 1,
        },
      },
    });
    expect((await tournamentAppearanceScopes(null)).map((s) => s.slug)).toEqual(
      ["test-cup"],
    );
    expect(
      (await tournamentAppearanceScopes(mapper)).some((s) => s.slug === "s12"),
    ).toBe(false);
    expect(
      (await tournamentAppearanceScopes(admin)).find((s) => s.slug === "s12"),
    ).toEqual({
      slug: "s12",
      defaultAppearance: "swiss-minimal",
      published: false,
      staff: true,
    });
    await tournamentCommand(admin, "s12", {
      ...command,
      expectedRevision: 1,
      defaultAppearance: null,
    });
    expect((await readTournament("s12"))?.edition.defaultAppearance).toBeNull();
  });
  it.each(seasonAppearances)(
    "allows a scoped Admin to change only their tournament default to %s",
    async (theme) => {
      await create();
      await db().insert(staffRoles).values({
        userId: player.osuId,
        role: "admin",
        editionSlug: "s12",
        grantedBy: admin.osuId,
      });
      const command = {
        ...fields,
        action: "general",
        status: "upcoming",
        expectedRevision: 0,
        confirmed: true,
        defaultAppearance: theme,
      };
      await tournamentCommand(player, "s12", command);
      await expect(
        tournamentCommand(player, "test-cup", command),
      ).rejects.toMatchObject({ status: 403 });
      const scopes = await tournamentAppearanceScopes(player);
      expect(scopes.some((s) => s.slug === "s12" && s.staff)).toBe(true);
      expect(scopes.some((s) => s.slug === "private-test-cup")).toBe(false);
    },
  );
  it("filters unpublished configurations in the database and ignores legacy state without inventing content", async () => {
    await db().execute(
      sql`INSERT INTO edition_state (slug) VALUES ('legacy-unknown')`,
    );
    expect((await readTournaments()).map((r) => r.edition.slug).sort()).toEqual(
      ["private-test-cup", "test-cup"],
    );
    expect((await readTournaments(true)).map((r) => r.edition.slug)).toEqual([
      "test-cup",
    ]);
    expect(
      await readTournament("private-test-cup", db(), true),
    ).toBeUndefined();
    expect(await readTournament("legacy-unknown")).toBeUndefined();
    expect(await readTournament("test-cup")).toMatchObject({
      edition,
      revision: 0,
    });
  });
  it("limits tournament navigation to the assigned role without exposing other editions", async () => {
    const mapperRows = (await tournamentList(mapper)).rows;
    expect(mapperRows.map((row) => row.slug)).toEqual(["test-cup"]);
    expect(mapperRows[0].links.map((link) => link.label)).toEqual([
      "Dashboard",
      "Rounds",
      "Map selection workbench",
      "Mappools",
    ]);
    const refereeRows = (await tournamentList(referee)).rows;
    expect(refereeRows[0].links.map((link) => link.label)).toEqual([
      "Dashboard",
      "Fixtures & results",
    ]);
    await expect(tournamentList(player)).rejects.toMatchObject({ status: 403 });
    expect(
      (await tournamentList(admin)).rows
        .find((row) => row.slug === "test-cup")
        ?.links.map((link) => link.label),
    ).toContain("Registrations");
  });
  it("rejects primary-key slug changes at the database boundary", async () => {
    await expect(
      db().execute(
        sql`UPDATE edition_state SET slug = 'renamed' WHERE slug = 'test-cup'`,
      ),
    ).rejects.toThrow();
    expect((await readTournament("test-cup"))?.edition.name).toBe(edition.name);
  });
  it("creates only an unpublished configuration, audits its actor and rejects duplicate or mutable slugs", async () => {
    vi.mocked(requireUser).mockResolvedValue(admin);
    const createThroughBrowser = () =>
      createRoute(post(createTournamentWrite.path, {
        ...fields,
        slug: "s12",
        confirmed: true,
      }));
    const saved = await tournamentResponse(await createThroughBrowser(), 201);
    expect(saved.edition).toMatchObject({
      slug: "s12",
      published: false,
      rules: null,
      eligibility: null,
      registration: null,
      schedule: [],
    });
    expect((await auditEvents())[0]).toMatchObject({
      actorId: admin.osuId,
      reason: null,
      kind: "tournament_create",
      detail: { before: null, after: { revision: 0 } },
    });
    expect(await getPublicEdition("s12")).toBeUndefined();
    expect((await createThroughBrowser()).status).toBe(409);
    await expect(
      change(0, "general", { ...fields, status: "upcoming", slug: "renamed" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await db().select().from(registrations)).toEqual([]);
  });
  it("quick-creates a private draft from a name and rejects incomplete publication atomically", async () => {
    const minimal = await createTournament(admin, {
      name: "New season",
      confirmed: true,
    });
    expect(minimal.edition).toMatchObject({
      slug: "new-season",
      summary: "",
      season: null,
      timeZone: "UTC",
      published: false,
      registration: null,
      rules: null,
      eligibility: null,
      schedule: [],
      branding: { logo: null, background: null, keyVisual: null },
    });
    await expect(
      createTournament(admin, { name: "New season", confirmed: true }),
    ).rejects.toMatchObject({ status: 409 });
    const events = await db()
      .select()
      .from(editionEvents)
      .where(eq(editionEvents.editionSlug, "new-season"));
    await expect(
      tournamentCommand(admin, "new-season", {
        action: "publication",
        published: true,
        expectedRevision: 0,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect((await readTournament("new-season"))?.revision).toBe(0);
    expect(
      await db()
        .select()
        .from(editionEvents)
        .where(eq(editionEvents.editionSlug, "new-season")),
    ).toEqual(events);
    expect(await getPublicEdition("new-season")).toBeUndefined();
    const unicode = await createTournament(admin, {
      name: "中文",
      confirmed: true,
    });
    expect(unicode.edition.slug).toMatch(/^oclr-[a-f0-9]{8}$/);
    await expect(
      createTournament(admin, {
        name: "Reserved",
        slug: "new",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("enforces Admin scopes, current roles and a single winning configuration revision", async () => {
    await create();
    for (const actor of [mapper, referee, player]) {
      await expect(
        createTournament(actor, {
          ...fields,
          slug: "unowned",
          confirmed: true,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(tournamentForAdmin(actor, "s12")).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        tournamentCommand(actor, "s12", {
          action: "publication",
          published: true,
          expectedRevision: 0,
          confirmed: true,
        }),
      ).rejects.toMatchObject({ status: 403 });
    }
    expect((await tournamentList(mapper)).rows.map((r) => r.slug)).toEqual([
      "test-cup",
    ]);
    const writes = await Promise.allSettled(
      ["First", "Second"].map((name) =>
        change(0, "general", { ...fields, name, status: "upcoming" }),
      ),
    );
    expect(writes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(writes.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    expect(await auditEvents()).toHaveLength(2);
    await db().insert(staffRoles).values({
      userId: player.osuId,
      role: "admin",
      editionSlug: "s12",
      grantedBy: admin.osuId,
    });
    await expect(tournamentForAdmin(player, "s12")).resolves.toMatchObject({
      revision: 1,
    });
    await expect(tournamentForAdmin(player, "test-cup")).rejects.toMatchObject({
      status: 403,
    });
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, player.osuId));
    await expect(tournamentForAdmin(player, "s12")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("separates publication from registration and preserves the application rules/question snapshot", async () => {
    let current = await create();
    current = await change(current.revision, "rules", {
      rules: {
        version: "s12-v1",
        sections: [
          { heading: "Synthetic rules", body: "Approved synthetic policy." },
        ],
      },
      eligibility: "Synthetic eligibility disclosure.",
    });
    const registration = {
      ...edition.registration!,
      enabled: false,
      questions: [
        {
          id: "answer",
          label: "Original question",
          required: true,
          maxLength: 10,
        },
      ],
    };
    current = await change(current.revision, "registration", { registration });
    current = await change(current.revision, "publication", {
      published: true,
    });
    expect(current.edition.registration?.enabled).toBe(false);
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "");
    await expect(
      change(current.revision, "registration", {
        registration: { ...registration, enabled: true },
      }),
    ).rejects.toMatchObject({ status: 409 });
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "60001");
    current = await change(current.revision, "registration", {
      registration: { ...registration, enabled: true },
    });
    const saved = await submitRegistration(player, "s12", {
      rulesAcknowledged: true,
      configurationVersion: current.revision,
      eligibilityAcknowledged: true,
      rulesVersion: "s12-v1",
      answers: { answer: "accepted" },
    });
    expect(saved.configurationVersion).toBe(current.revision);
    const rules = {
      ...current.edition.rules!,
      sections: [
        { heading: "Revised rules", body: "New approved synthetic policy." },
      ],
    };
    await expect(
      change(current.revision, "rules", {
        rules,
        eligibility: current.edition.eligibility,
      }),
    ).rejects.toMatchObject({ status: 409 });
    current = await change(current.revision, "rules", {
      rules: { ...rules, version: "s12-v2" },
      eligibility: current.edition.eligibility,
    });
    current = await change(current.revision, "registration", {
      registration: {
        ...registration,
        questions: [
          { ...registration.questions[0], label: "Revised question" },
        ],
      },
    });
    current = await change(current.revision, "registration", {
      registration: { ...registration, questions: [] },
    });
    current = await change(current.revision, "registration", { registration });
    const [snapshot] = await db()
      .select()
      .from(editionRevisions)
      .where(
        and(
          eq(editionRevisions.editionSlug, "s12"),
          eq(editionRevisions.version, saved.configurationVersion!),
        ),
      );
    expect(snapshot.configuration.rules?.version).toBe("s12-v1");
    expect(snapshot.configuration.registration?.questions[0].label).toBe(
      "Original question",
    );
    expect((await db().select().from(registrations))[0]).toMatchObject({
      rulesVersion: "s12-v1",
      answers: { answer: "accepted" },
    });
    current = await change(current.revision, "publication", {
      published: false,
    });
    expect(await getPublicEdition("s12")).toBeUndefined();
    expect(current.edition.registration?.enabled).toBe(false);
  });
  it("rejects invalid input while allowing versioned settings edits after setup lock", async () => {
    await expect(
      createTournament(admin, {
        ...fields,
        slug: "invalid",
        timeZone: "invalid",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await create();
    await expect(
      change(0, "registration", {
        registration: {
          ...edition.registration!,
          closesAt: "2020-01-01T00:00:00Z",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      change(0, "general", {
        ...fields,
        status: "upcoming",
        actorId: player.osuId,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await db()
      .update(editionState)
      .set({ lockedAt: new Date(), setupVersion: 9 })
      .where(eq(editionState.slug, "s12"));
    const scheduled = await change(0, "schedule", {
      schedule: [{ label: "Synthetic milestone", at: null }],
    });
    expect(scheduled.edition.schedule[0].label).toBe("Synthetic milestone");
    await change(scheduled.revision, "general", {
      ...fields,
      name: "Completed synthetic edition",
      status: "completed",
    });
    expect(await auditEvents()).toHaveLength(3);
    expect(
      (
        await db()
          .select()
          .from(editionState)
          .where(eq(editionState.slug, "s12"))
      )[0].setupVersion,
    ).toBe(9);
  });
  it("rolls back configuration and snapshots if automatic audit persistence fails", async () => {
    await db().execute(
      sql`CREATE FUNCTION oclr_test_reject_edition_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$`,
    );
    await db().execute(
      sql`CREATE TRIGGER oclr_test_reject_edition_event BEFORE INSERT ON edition_events FOR EACH ROW EXECUTE FUNCTION oclr_test_reject_edition_event()`,
    );
    try {
      await expect(create()).rejects.toThrow();
      expect(await readTournament("s12")).toBeUndefined();
      expect(
        await db()
          .select()
          .from(editionRevisions)
          .where(eq(editionRevisions.editionSlug, "s12")),
      ).toEqual([]);
    } finally {
      await db().execute(
        sql`DROP TRIGGER oclr_test_reject_edition_event ON edition_events`,
      );
      await db().execute(sql`DROP FUNCTION oclr_test_reject_edition_event()`);
    }
  });
  it("commits capacity, configuration revision and draft snapshots together", async () => {
    const slug = "s12";
    const fixture = await prepareDraft(slug, admin.osuId);
    const { session } = await staffDraft(admin, slug);
    await pickPlayer(admin, slug, {
      sessionId: session!.id,
      turnIndex: session!.turnIndex,
      candidateId: fixture.players[0].osuId,
      expectedVersion: session!.version,
      idempotencyKey: crypto.randomUUID(),
    });
    const picked = await staffDraft(admin, slug);
    const before = await draftCommand(admin, slug, {
      confirmed: true,
      expectedVersion: picked.session!.version,
      command: {
        action: "unlock",
        expectedSetupVersion: picked.edition!.setupVersion,
      },
    });
    const published = (await publicDraft(slug))!;
    expect(published.picks).toHaveLength(1);
    const saved = (await readTournament(slug))!;
    const { name, season, summary, status, timeZone, branding } = saved.edition;
    const update = () =>
      change(saved.revision, "general", {
        name, season, summary, status, timeZone, branding, rosterCapacity: 4,
      });
    const revisions = () =>
      db()
        .select({ version: editionRevisions.version })
        .from(editionRevisions)
        .where(eq(editionRevisions.editionSlug, slug))
        .orderBy(editionRevisions.version);
    const history = await revisions();
    const audits = (await auditEvents()).length;

    await db().execute(sql`
      CREATE FUNCTION oclr_test_reject_capacity_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.kind = 'tournament_general' THEN
          RAISE EXCEPTION 'Synthetic capacity audit failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER oclr_test_reject_capacity_audit
        BEFORE INSERT ON edition_events FOR EACH ROW
        EXECUTE FUNCTION oclr_test_reject_capacity_audit()
    `);
    try {
      await expect(update()).rejects.toThrow();
      expect(await readTournament(slug)).toEqual(saved);
      expect(await revisions()).toEqual(history);
      expect(await staffDraft(admin, slug)).toEqual(before);
      expect(await publicDraft(slug)).toEqual(published);
      expect(await auditEvents()).toHaveLength(audits);
    } finally {
      await db().execute(sql`
        DROP TRIGGER oclr_test_reject_capacity_audit ON edition_events;
        DROP FUNCTION oclr_test_reject_capacity_audit()
      `);
    }

    const updated = await update();
    expect(updated.revision).toBe(saved.revision + 1);
    expect(updated.edition.rosterCapacity).toBe(4);
    expect(await revisions()).toEqual([...history, { version: updated.revision }]);
    const after = await staffDraft(admin, slug);
    expect(after.edition?.setupVersion).toBe(before.edition!.setupVersion + 1);
    expect(after.teams.map(({ team }) => team.capacity)).toEqual([4, 4]);
    expect(after.session).toMatchObject({
      version: before.session!.version + 1,
      captainSnapshot: {
        capacities: Object.fromEntries(
          after.teams.map(({ team }) => [team.id, 4]),
        ),
      },
    });
    expect(await publicDraft(slug)).toEqual({
      ...published,
      version: published.version + 1,
    });
    expect(await auditEvents()).toHaveLength(audits + 1);
  });
  it("does not manufacture configuration changes or audit events for identical saves", async () => {
    await create();
    const same = await change(0, "general", { ...fields, status: "upcoming" });
    expect(same.revision).toBe(0);
    expect(await auditEvents()).toHaveLength(1);
    expect(
      (
        await change(0, "publication", {
          published: false,
        })
      ).revision,
    ).toBe(0);
  });
  it("serializes application submission against configuration edits and never acknowledges the wrong snapshot", async () => {
    const submitted = {
      rulesAcknowledged: true,
      eligibilityAcknowledged: true,
      rulesVersion: edition.rules!.version,
      configurationVersion: 0,
      answers: {},
    };
    const results = await Promise.allSettled([
      submitRegistration(player, "test-cup", submitted),
      tournamentCommand(admin, "test-cup", {
        expectedRevision: 0,
        confirmed: true,
        action: "general",
        name: "Changed synthetic name",
        season: null,
        summary: edition.summary,
        timeZone: edition.timeZone,
        branding: edition.branding,
        status: edition.status,
      }),
    ]);
    expect(results[1].status).toBe("fulfilled");
    const records = await db().select().from(registrations);
    if (results[0].status === "fulfilled") {
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        configurationVersion: 0,
        rulesVersion: "test-v1",
      });
    } else {
      expect(results[0].reason).toMatchObject({ status: 409 });
      expect(records).toEqual([]);
    }
    await expect(
      submitRegistration(player, "test-cup", submitted),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("allows advance enabling but rejects applications before opening and after closing", async () => {
    const now = Date.now();
    const iso = (hours: number) =>
      new Date(now + hours * 3600000).toISOString();
    const configure = async (revision: number, opens: number, closes: number) =>
      tournamentCommand(admin, "test-cup", {
        action: "registration",
        confirmed: true,
        expectedRevision: revision,
        registration: {
          ...edition.registration,
          enabled: true,
          opensAt: iso(opens),
          closesAt: iso(closes),
          withdrawUntil: null,
        },
      });
    const application = (revision: number) => ({
      configurationVersion: revision,
      rulesVersion: edition.rules!.version,
      rulesAcknowledged: true,
      eligibilityAcknowledged: true,
      answers: {},
    });
    const future = await configure(0, 1, 2);
    expect(future.edition.registration?.enabled).toBe(true);
    await expect(
      submitRegistration(player, "test-cup", application(future.revision)),
    ).rejects.toMatchObject({ status: 409 });
    const current = await configure(future.revision, -1, 1);
    const registered = await submitRegistration(
      player,
      "test-cup",
      application(current.revision),
    );
    expect(registered.status).toBe("pending");
    const expired = await configure(current.revision, -2, -1);
    await expect(
      submitRegistration(mapper, "test-cup", application(expired.revision)),
    ).rejects.toMatchObject({ status: 409 });
    expect((await db().select().from(registrations)).length).toBe(1);
  });
  it("accepts applications without optional rules and never retroactively records consent", async () => {
    let current = await create();
    current = await change(current.revision, "publication", {
      published: true,
    });
    current = await change(current.revision, "registration", {
      registration: { ...edition.registration, enabled: true },
    });
    const noRules = { configurationVersion: current.revision, answers: {} };
    await expect(
      submitRegistration(mapper, "s12", {
        ...noRules,
        rulesAcknowledged: true,
        rulesVersion: "invented",
      }),
    ).rejects.toMatchObject({ status: 400 });
    const old = await submitRegistration(player, "s12", noRules);
    expect(old).toMatchObject({
      rulesVersion: null,
      eligibilityAcknowledged: null,
    });
    current = await change(current.revision, "rules", {
      rules: {
        version: "later-v1",
        sections: [{ heading: "Later rules", body: "Synthetic later rules." }],
      },
      eligibility: "Synthetic later eligibility.",
    });
    expect((await db().select().from(registrations))[0]).toMatchObject({
      rulesVersion: null,
      eligibilityAcknowledged: null,
      configurationVersion: old.configurationVersion,
    });
    await expect(
      submitRegistration(mapper, "s12", {
        configurationVersion: current.revision,
        answers: {},
      }),
    ).rejects.toMatchObject({ status: 400 });
    const newer = await submitRegistration(mapper, "s12", {
      configurationVersion: current.revision,
      answers: {},
      rulesAcknowledged: true,
      rulesVersion: "later-v1",
      eligibilityAcknowledged: true,
    });
    expect(newer).toMatchObject({
      rulesVersion: "later-v1",
      eligibilityAcknowledged: true,
    });
  });
  it("pauses registration on completion, so restoring Upcoming cannot reopen it implicitly", async () => {
    const command = {
      expectedRevision: 0,
      confirmed: true,
      action: "general",
      name: edition.name,
      season: edition.season,
      summary: edition.summary,
      timeZone: edition.timeZone,
      branding: edition.branding,
      status: "completed",
    };
    const complete = await tournamentCommand(admin, "test-cup", command);
    expect(complete.edition.registration?.enabled).toBe(false);
    expect(
      (await tournamentList(admin)).rows.find((row) => row.slug === "test-cup")
        ?.registrationState,
    ).toBe("closed");
    const restored = await tournamentCommand(admin, "test-cup", {
      ...command,
      expectedRevision: complete.revision,
      status: "upcoming",
    });
    expect(restored.edition.registration?.enabled).toBe(false);
  });
});
