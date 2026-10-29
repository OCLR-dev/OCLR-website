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
import { draftSessions, registrations, users } from "../../src/db/schema";
import { POST as register } from "../../src/app/api/tournaments/[edition]/registrations/route";
import { POST as configureDraft } from "../../src/app/api/admin/tournaments/[edition]/draft/route";
import { staffDraft } from "../../src/lib/draft";
import { assertTestDatabase } from "../database";
import { seedEditions } from "../fixtures/editions";
import { prepareDraft } from "../fixtures/draft";
import {
  escapedJson,
  maximumApplication,
  maximumDraftInput,
} from "../fixtures/request-body";

// Only identity resolution is mocked; the routes, reader, validation and DB writes are real.
const state = vi.hoisted(() => ({
  actor: { osuId: 443001, username: "Synthetic body-budget admin" },
}));
vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: async () => state.actor,
}));
vi.mock("../../src/lib/auth/staff", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/staff")>()),
  requireStaff: async () => state.actor,
}));
const url = process.env.TEST_DATABASE_URL;
const context = { params: Promise.resolve({ edition: "test-cup" }) };
function request(body: string) {
  return new Request("https://oclr.example.test/api/test", {
    method: "POST",
    headers: {
      origin: "https://oclr.example.test",
      "content-type": "application/json",
    },
    body,
  });
}

describe.skipIf(!url)(
  "large valid JSON reaches authoritative persistence",
  () => {
    beforeAll(() => {
      assertTestDatabase(url);
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("APP_URL", "https://oclr.example.test");
      vi.stubEnv("ADMIN_OSU_IDS", String(state.actor.osuId));
      vi.stubEnv("PRIVACY_CONTACT_OSU_ID", String(state.actor.osuId));
    });
    beforeEach(async () => {
      await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    it.each(["x", "測", "\u0001"])(
      "saves all maximum-length %j answers through POST",
      async (character) => {
        const { configuration, input } = maximumApplication(
          character.repeat(2000),
        );
        await db().insert(users).values(state.actor);
        await seedEditions([configuration]);
        const response = await register(
          request(escapedJson({ ...input, reapply: undefined })),
          context,
        );
        expect(response.status).toBe(201);
        const [saved] = await db()
          .select()
          .from(registrations)
          .where(eq(registrations.userId, state.actor.osuId));
        expect(saved.answers).toEqual(input.answers);
      },
    );
    it("saves 4,096 escaped UUID turns and rejects the 4,097th via business validation", async () => {
      const fixture = await prepareDraft(
        "test-cup",
        state.actor.osuId,
        2,
        false,
        false,
      );
      const snapshot = await staffDraft(state.actor, "test-cup");
      const input = maximumDraftInput(fixture.teamRows.map((t) => t.id));
      input.command.expectedSetupVersion = snapshot.edition!.setupVersion;
      const response = await configureDraft(
        request(escapedJson(input)),
        context,
      );
      expect(response.status).toBe(200);
      const [saved] = await db()
        .select()
        .from(draftSessions)
        .where(eq(draftSessions.editionSlug, "test-cup"));
      expect(saved.turnSequence).toEqual(input.command.turnSequence);
      const invalid = {
        ...input,
        expectedVersion: saved.version,
        command: {
          ...input.command,
          turnSequence: [...input.command.turnSequence, fixture.teamRows[0].id],
        },
      };
      expect(
        (await configureDraft(request(escapedJson(invalid)), context)).status,
      ).toBe(400);
      const [unchanged] = await db()
        .select()
        .from(draftSessions)
        .where(eq(draftSessions.id, saved.id));
      expect(unchanged.turnSequence).toEqual(saved.turnSequence);
      expect(unchanged.version).toBe(saved.version);
    });
  },
);
