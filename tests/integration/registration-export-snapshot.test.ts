import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Client } from "pg";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  users,
  registrations,
  editionState,
  editionRevisions,
} from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";
import { exportApplications } from "../../src/lib/staff";
import { submitRegistration } from "../../src/lib/registrations";
const target = process.env.TEST_DATABASE_URL;
const admin = { osuId: 452001, username: "Synthetic Export Admin" };
const player = { osuId: 452002, username: "Synthetic Reapplicant" };
const config = (label: string, value: string) => ({
  ...edition,
  rules: null,
  eligibility: null,
  registration: {
    ...edition.registration!,
    questions: [
      {
        id: "choice",
        type: "single_choice" as const,
        label,
        required: true,
        options: [
          { id: value, label: value === "old" ? "Old answer" : "New answer" },
          { id: "other", label: "Other answer" },
        ],
      },
    ],
  },
});
describe.skipIf(!target)(
  "consistent registration export snapshots (#452)",
  () => {
    beforeAll(() => {
      assertTestDatabase(target);
      vi.stubEnv("DATABASE_URL", target!);
      vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
      vi.stubEnv("PRIVACY_CONTACT_OSU_ID", String(admin.osuId));
    });
    beforeEach(async () => {
      await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
      await db().insert(users).values([admin, player]);
      await seedEditions([config("Old question", "old")]);
      const { slug, ...configuration } = config("New question", "new");
      await db()
        .insert(editionRevisions)
        .values({ editionSlug: slug, version: 1, configuration });
      await db()
        .update(editionState)
        .set({ configurationVersion: 1, configuration })
        .where(eq(editionState.slug, slug));
      await db()
        .insert(registrations)
        .values({
          userId: player.osuId,
          editionSlug: slug,
          configurationVersion: 0,
          status: "withdrawn",
          answers: { choice: "old" },
          rulesVersion: null,
          createdAt: new Date("2026-10-20T00:00:00Z"),
        });
    });
    afterEach(() => vi.restoreAllMocks());
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    it.each(["list", "answers"])(
      "keeps a whole old attempt when reapplication commits after %s reading",
      async (point) => {
        const [old] = await db().select().from(registrations);
        // Intercept only the SQL completion boundary. Queries and the concurrent
        // normal resubmission execute against real separate PostgreSQL connections.
        const prototype = Client.prototype as unknown as {
          query: (...args: unknown[]) => Promise<unknown>;
        };
        const query = prototype.query;
        let committed = false;
        let reached!: () => void, resume!: () => void;
        const paused = new Promise<void>((resolve) => {
          reached = resolve;
        });
        const resumed = new Promise<void>((resolve) => {
          resume = resolve;
        });
        const gate = vi.spyOn(prototype, "query").mockImplementation(function (
          this: unknown,
          ...args: unknown[]
        ) {
          const first = args[0];
          const text = String(
            typeof first === "object" && first && "text" in first
              ? first.text
              : first,
          );
          const result = query.apply(this, args);
          const match =
            point === "list"
              ? text.includes('inner join "users"') &&
                text.includes('"registrations"."created_at"')
              : text.includes('from "registrations"') &&
                text.includes('"configuration_version"') &&
                text.includes('"answers"') &&
                !text.includes("join");
          if (committed || !match) return result;
          committed = true;
          return result.then(async (rows) => {
            reached();
            await resumed;
            return rows;
          });
        });
        const exporting = exportApplications(admin, {
          edition: edition.slug,
          status: "",
        });
        await paused;
        // Start the writer from the test context, outside the export's async-local
        // read snapshot, just as a separate incoming request would run.
        try {
          await submitRegistration(player, edition.slug, {
            configurationVersion: 1,
            answers: { choice: "new" },
            reapply: {
              attempt: old.attempt,
              expectedUpdatedAt: old.updatedAt.toISOString(),
            },
          });
        } finally {
          resume();
        }
        const [exported] = await exporting;
        gate.mockRestore();
        expect(committed).toBe(true);
        expect(exported).toMatchObject({
          status: "withdrawn",
          createdAt: new Date("2026-10-20T00:00:00Z"),
          applicationAnswers: "Old question [choice]: Old answer [old]",
        });
        const [next] = await exportApplications(admin, {
          edition: edition.slug,
          status: "",
        });
        expect(next).toMatchObject({
          status: "pending",
          applicationAnswers: "New question [choice]: New answer [new]",
        });
        expect(next.createdAt.getTime()).toBeGreaterThan(
          exported.createdAt.getTime(),
        );
      },
    );
  },
);
