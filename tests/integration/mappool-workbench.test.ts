import { randomUUID } from "node:crypto";
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
  mappoolCandidates,
  mappoolCandidateComments,
  mappoolEvents,
  mappools,
  editionState,
} from "../../src/db/schema";
import {
  selectionWorkspace,
  previewCandidates,
  selectionCommand,
  candidateComments,
} from "../../src/lib/mappool-workbench";
import { mappoolCommand } from "../../src/lib/mappools";
import { fetchBeatmaps } from "../../src/lib/osu-beatmaps";
import { HttpError } from "../../src/lib/http";
import { withReadChannel } from "../../src/lib/read-channel";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { statisticsArchive } from "../fixtures/archive-statistics";
import { assertTestDatabase } from "../database";
vi.mock("../../src/lib/osu-beatmaps", () => ({ fetchBeatmaps: vi.fn() }));
const url = process.env.TEST_DATABASE_URL;
const slug = edition.slug;
const admin = { osuId: 57201, username: "Synthetic Admin" },
  pooler = { osuId: 57202, username: "Synthetic Pooler" },
  tester = { osuId: 57203, username: "Synthetic Tester" },
  developer = { osuId: 57204, username: "Synthetic Developer" };
const metadata = {
  setId: 1,
  artist: "Synthetic Artist",
  title: "Synthetic Song",
  mapper: "Synthetic Mapper",
  difficulty: "Synthetic Difficulty",
  stars: 4.5,
  bpm: 180,
  duration: 123,
  mode: "osu" as const,
  status: "ranked",
  ar: 9,
  od: 8,
  cs: 4,
  hp: 6,
};
const snapshot = (beatmapId: number) => ({
  beatmapId,
  metadata,
  fingerprint: "a".repeat(64),
  fetchedAt: new Date().toISOString(),
});
const add = (ids = [75]) => ({
  action: "add",
  rows: ids.map((beatmapId) => ({ beatmapId, fingerprint: "a".repeat(64) })),
});
describe.skipIf(!url)("private selection collaboration", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
  });
  beforeEach(async () => {
    vi.mocked(fetchBeatmaps)
      .mockReset()
      .mockImplementation(
        async (ids) => new Map(ids.map((id) => [id, snapshot(id)])),
      );
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([edition, { ...edition, slug: "other-test-cup" }]);
    await db().insert(users).values([admin, pooler, tester, developer]);
    await db()
      .insert(staffRoles)
      .values([
        {
          userId: pooler.osuId,
          role: "mappooler",
          editionSlug: slug,
          grantedBy: admin.osuId,
        },
        {
          userId: tester.osuId,
          role: "tester",
          editionSlug: slug,
          grantedBy: admin.osuId,
        },
        { userId: developer.osuId, role: "developer", grantedBy: admin.osuId },
      ]);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("previews row failures and existing duplicates, then lets Tester add valid candidates without touching official pools", async () => {
    await selectionCommand(pooler, slug, add());
    vi.mocked(fetchBeatmaps).mockResolvedValueOnce(
      new Map<number, ReturnType<typeof snapshot> | HttpError>([
        [99, new HttpError(404, "Beatmap not found.")],
        [100, snapshot(100)],
      ]),
    );
    const preview = await previewCandidates(tester, slug, {
      text: "75\n99\nbad\n100\n100",
    });
    expect(preview.rows.map((r) => r.status)).toEqual([
      "duplicate",
      "failed",
      "invalid",
      "ready",
      "duplicate",
    ]);
    expect(preview.rows[1].error).toBe("Beatmap not found.");
    expect(await selectionCommand(tester, slug, add([100]))).toEqual({
      added: 1,
      skipped: 0,
    });
    const saved = await selectionWorkspace(tester, slug);
    expect(
      saved.candidates.map((c) => c.beatmapId).sort((a, b) => a - b),
    ).toEqual([75, 100]);
    expect(saved.candidates.find((c) => c.beatmapId === 100)?.authorId).toBe(
      tester.osuId,
    );
    expect(await db().select().from(mappools)).toEqual([]);
    await expect(mappoolCommand(tester, slug, {})).rejects.toMatchObject({
      status: 403,
    });
  });
  it("serializes overlapping adds, retries without provider work and never overwrites saved metadata or audit", async () => {
    const result = await Promise.all([
      selectionCommand(pooler, slug, add([75, 76])),
      selectionCommand(tester, slug, add([76, 77])),
    ]);
    expect(result.reduce((sum, r) => sum + r.added, 0)).toBe(3);
    expect((await selectionWorkspace(pooler, slug)).candidates).toHaveLength(3);
    vi.mocked(fetchBeatmaps).mockClear();
    expect(await selectionCommand(tester, slug, add([75, 76, 77]))).toEqual({
      added: 0,
      skipped: 3,
    });
    expect(fetchBeatmaps).not.toHaveBeenCalled();
    expect(await db().select().from(mappoolEvents)).toHaveLength(3);
  });
  it("separates Mod candidates, deduplicates within a category and preserves comments when reclassifying", async () => {
    await selectionCommand(pooler, slug, add());
    await selectionCommand(tester, slug, { ...add(), category: "HD" });
    expect(
      (await previewCandidates(tester, slug, { text: "75", category: "HD" }))
        .rows[0].status,
    ).toBe("duplicate");
    expect(
      (await previewCandidates(tester, slug, { text: "75", category: "HR" }))
        .rows[0].status,
    ).toBe("ready");
    expect(
      await selectionCommand(pooler, slug, { ...add(), category: "HD" }),
    ).toEqual({ added: 0, skipped: 1 });
    const candidate = (await selectionWorkspace(tester, slug)).candidates.find(
      (c) => c.category === "unassigned",
    )!;
    await selectionCommand(tester, slug, {
      action: "comment",
      candidateId: candidate.id,
      requestId: randomUUID(),
      body: "Keep this discussion",
    });
    const change = {
      action: "classify",
      candidateId: candidate.id,
      expectedCategory: "unassigned",
      category: "HR",
    };
    await selectionCommand(pooler, slug, change);
    expect(await selectionCommand(pooler, slug, change)).toEqual({
      added: 0,
      skipped: 1,
    });
    await expect(
      selectionCommand(pooler, slug, { ...change, category: "DT" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      selectionCommand(pooler, slug, {
        ...change,
        expectedCategory: "HR",
        category: "HD",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      selectionCommand(pooler, "other-test-cup", {
        ...change,
        expectedCategory: "HR",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect((await candidateComments(tester, slug, candidate.id))[0].body).toBe(
      "Keep this discussion",
    );
    expect((await selectionWorkspace(tester, slug)).candidates).toHaveLength(2);
    expect(
      (await db().select().from(mappoolEvents)).filter(
        (e) => e.action === "candidate_classify",
      ),
    ).toHaveLength(1);
    await expect(
      selectionCommand(tester, slug, { ...add(), category: "XX" }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rejects a batch whose previously known candidate moves during provider lookup without partial writes", async () => {
    await selectionCommand(pooler, slug, add());
    const candidate = (await selectionWorkspace(pooler, slug)).candidates[0];
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(fetchBeatmaps).mockImplementationOnce(async (ids) => {
      entered();
      await gate;
      return new Map(ids.map((id) => [id, snapshot(id)]));
    });
    const batch = selectionCommand(pooler, slug, add([75, 76]));
    const rejected = expect(batch).rejects.toMatchObject({ status: 409 });
    await started;
    await selectionCommand(tester, slug, {
      action: "classify",
      candidateId: candidate.id,
      expectedCategory: "unassigned",
      category: "HD",
    });
    release();
    await rejected;
    expect(
      (await selectionWorkspace(pooler, slug)).candidates.map((c) => [
        c.beatmapId,
        c.category,
      ]),
    ).toEqual([[75, "HD"]]);
  });
  it("keeps two authors' comments and safely replays a lost response without duplicating or replacing text", async () => {
    await selectionCommand(pooler, slug, add());
    const id = (await selectionWorkspace(tester, slug)).candidates[0].id;
    const c = {
      action: "comment",
      candidateId: id,
      requestId: randomUUID(),
      body: "Synthetic feedback <script>not executable</script>",
    };
    await Promise.all([
      selectionCommand(pooler, slug, c),
      selectionCommand(tester, slug, {
        ...c,
        requestId: randomUUID(),
        body: "Second opinion",
      }),
    ]);
    expect(await selectionCommand(pooler, slug, c)).toEqual({
      added: 0,
      skipped: 1,
    });
    const comments = await candidateComments(tester, slug, id);
    expect(comments).toHaveLength(2);
    expect(new Set(comments.map((r) => r.authorId))).toEqual(
      new Set([pooler.osuId, tester.osuId]),
    );
    await expect(
      selectionCommand(pooler, slug, { ...c, body: "Changed retry" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await selectionWorkspace(tester, slug)).candidates[0].commentCount,
    ).toBe(2);
  });
  it("rejects cross-edition resources, revoked roles, read channels and Developer writes before provider use", async () => {
    await selectionCommand(pooler, slug, add());
    const id = (await selectionWorkspace(tester, slug)).candidates[0].id;
    vi.mocked(fetchBeatmaps).mockClear();
    await expect(
      previewCandidates(tester, "other-test-cup", { text: "99" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      candidateComments(admin, "other-test-cup", id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      selectionCommand(admin, "other-test-cup", {
        action: "comment",
        candidateId: id,
        requestId: randomUUID(),
        body: "forged",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      selectionCommand(developer, slug, add()),
    ).rejects.toMatchObject({ status: 403 });
    expect((await selectionWorkspace(developer, slug)).candidates).toHaveLength(
      1,
    );
    await expect(
      withReadChannel(() => selectionCommand(admin, slug, add())),
    ).rejects.toMatchObject({ status: 403 });
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, tester.osuId));
    await expect(candidateComments(tester, slug, id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(selectionCommand(tester, slug, add())).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchBeatmaps).not.toHaveBeenCalled();
  });
  it("lets only the author edit/delete current versions and never resurrects deleted comment requests", async () => {
    await selectionCommand(pooler, slug, add([75, 76]));
    const [candidate, other] = (await selectionWorkspace(tester, slug))
      .candidates;
    const post = {
      action: "comment",
      candidateId: candidate.id,
      requestId: randomUUID(),
      body: "Original feedback",
    };
    await selectionCommand(tester, slug, post);
    const [original] = await candidateComments(tester, slug, candidate.id);
    // Existing comments predate immutable retry hashes; the first edit backfills
    // audit metadata while preserving the original creation-request identity.
    await db()
      .update(mappoolEvents)
      .set({ after: { candidateId: candidate.id, commentId: original.id } })
      .where(eq(mappoolEvents.action, "candidate_comment"));
    const edit = {
      action: "comment_edit",
      candidateId: candidate.id,
      commentId: original.id,
      version: original.version,
      body: "Revised feedback",
    };
    for (const actor of [pooler, admin]) {
      await expect(selectionCommand(actor, slug, edit)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        selectionCommand(actor, slug, {
          action: "comment_delete",
          candidateId: candidate.id,
          commentId: original.id,
          version: original.version,
        }),
      ).rejects.toMatchObject({ status: 404 });
    }
    await expect(
      selectionCommand(tester, slug, { ...edit, candidateId: other.id }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      selectionCommand(admin, "other-test-cup", edit),
    ).rejects.toMatchObject({ status: 404 });
    for (const body of [" ", "x".repeat(2001)])
      await expect(
        selectionCommand(tester, slug, { ...edit, body }),
      ).rejects.toMatchObject({ status: 400 });
    await selectionCommand(tester, slug, edit);
    const [saved] = await candidateComments(tester, slug, candidate.id);
    expect(saved.body).toBe("Revised feedback");
    expect(saved.authorId).toBe(original.authorId);
    expect(saved.createdAt).toEqual(original.createdAt);
    expect(saved.version).not.toBe(original.version);
    await expect(selectionCommand(tester, slug, edit)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      selectionCommand(tester, slug, {
        action: "comment_delete",
        candidateId: candidate.id,
        commentId: saved.id,
        version: original.version,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await selectionCommand(tester, slug, post)).toEqual({
      added: 0,
      skipped: 1,
    });
    expect((await candidateComments(tester, slug, candidate.id))[0].body).toBe(
      "Revised feedback",
    );
    await expect(
      selectionCommand(tester, slug, { ...post, body: "Revised feedback" }),
    ).rejects.toMatchObject({ status: 409 });
    await selectionCommand(tester, slug, {
      action: "comment_delete",
      candidateId: candidate.id,
      commentId: saved.id,
      version: saved.version,
    });
    expect(await candidateComments(tester, slug, candidate.id)).toEqual([]);
    expect(
      (await selectionWorkspace(tester, slug)).candidates.find(
        (c) => c.id === candidate.id,
      )?.commentCount,
    ).toBe(0);
    await expect(selectionCommand(tester, slug, post)).rejects.toMatchObject({
      status: 409,
    });
    expect(await candidateComments(tester, slug, candidate.id)).toEqual([]);
    const events = await db().select().from(mappoolEvents);
    expect(
      events.filter((e) => e.action === "candidate_comment_edit"),
    ).toHaveLength(1);
    expect(
      events.filter((e) => e.action === "candidate_comment_delete"),
    ).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("Revised feedback");
  });
  it("serializes competing edits and rechecks live grants and read-only channels", async () => {
    await selectionCommand(pooler, slug, add());
    const { id } = (await selectionWorkspace(tester, slug)).candidates[0];
    await selectionCommand(tester, slug, {
      action: "comment",
      candidateId: id,
      requestId: randomUUID(),
      body: "Original",
    });
    const [comment] = await candidateComments(tester, slug, id);
    const edit = {
      action: "comment_edit",
      candidateId: id,
      commentId: comment.id,
      version: comment.version,
      body: "First",
    };
    const results = await Promise.allSettled([
      selectionCommand(tester, slug, edit),
      selectionCommand(tester, slug, { ...edit, body: "Second" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    const [latest] = await candidateComments(tester, slug, id);
    expect(["First", "Second"]).toContain(latest.body);
    await expect(
      withReadChannel(() =>
        selectionCommand(tester, slug, { ...edit, version: latest.version }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, tester.osuId));
    await expect(
      selectionCommand(tester, slug, { ...edit, version: latest.version }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      selectionCommand(tester, slug, {
        action: "comment_delete",
        candidateId: id,
        commentId: latest.id,
        version: latest.version,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rolls back comment edits and deletes when their audit insert fails", async () => {
    await selectionCommand(pooler, slug, add());
    const { id } = (await selectionWorkspace(tester, slug)).candidates[0];
    await selectionCommand(tester, slug, {
      action: "comment",
      candidateId: id,
      requestId: randomUUID(),
      body: "Retained feedback",
    });
    const [comment] = await candidateComments(tester, slug, id);
    await db().execute(
      sql`CREATE FUNCTION oclr_test_comment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$`,
    );
    try {
      await db().execute(
        sql`CREATE TRIGGER oclr_test_comment_audit BEFORE INSERT ON mappool_events FOR EACH ROW EXECUTE FUNCTION oclr_test_comment_audit()`,
      );
      for (const action of ["comment_edit", "comment_delete"]) {
        await expect(
          selectionCommand(tester, slug, {
            action,
            candidateId: id,
            commentId: comment.id,
            version: comment.version,
            ...(action === "comment_edit" ? { body: "Discarded" } : {}),
          }),
        ).rejects.toThrow();
        expect(await candidateComments(tester, slug, id)).toEqual([comment]);
      }
    } finally {
      await db().execute(
        sql`DROP TRIGGER IF EXISTS oclr_test_comment_audit ON mappool_events`,
      );
      await db().execute(
        sql`DROP FUNCTION IF EXISTS oclr_test_comment_audit()`,
      );
    }
  });
  it("rolls back whole batches on stale metadata, lookup or audit failure", async () => {
    await expect(
      selectionCommand(pooler, slug, {
        action: "add",
        rows: [{ beatmapId: 75, fingerprint: "b".repeat(64) }],
      }),
    ).rejects.toMatchObject({ status: 409 });
    vi.mocked(fetchBeatmaps).mockResolvedValueOnce(
      new Map<number, ReturnType<typeof snapshot> | HttpError>([
        [75, snapshot(75)],
        [76, new HttpError(429, "Wait")],
      ]),
    );
    await expect(
      selectionCommand(pooler, slug, add([75, 76])),
    ).rejects.toMatchObject({ status: 429 });
    await db().execute(
      sql`CREATE FUNCTION oclr_test_candidate_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$`,
    );
    try {
      await db().execute(
        sql`CREATE TRIGGER oclr_test_candidate_audit BEFORE INSERT ON mappool_events FOR EACH ROW EXECUTE FUNCTION oclr_test_candidate_audit()`,
      );
      await expect(
        selectionCommand(pooler, slug, add([75, 76])),
      ).rejects.toThrow();
      expect(await db().select().from(mappoolCandidates)).toHaveLength(0);
      expect(await db().select().from(mappoolEvents)).toHaveLength(0);
    } finally {
      await db().execute(
        sql`DROP TRIGGER IF EXISTS oclr_test_candidate_audit ON mappool_events`,
      );
      await db().execute(
        sql`DROP FUNCTION IF EXISTS oclr_test_candidate_audit()`,
      );
    }
  });
  it("keeps archived workspaces read-only and enforces bounded candidate/comment capacity", async () => {
    await seedEditions([
      {
        ...edition,
        slug: "archive-test-cup",
        status: "completed",
        registration: null,
        archive: { ...statisticsArchive, editionSlug: "archive-test-cup" },
      },
    ]);
    expect((await selectionWorkspace(admin, "archive-test-cup")).archived).toBe(
      true,
    );
    await expect(
      previewCandidates(admin, "archive-test-cup", { text: "75" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      selectionCommand(admin, "archive-test-cup", add()),
    ).rejects.toMatchObject({ status: 409 });
    await db()
      .insert(mappoolCandidates)
      .values(
        Array.from({ length: 500 }, (_, i) => ({
          editionSlug: slug,
          beatmapId: i + 1000,
          metadata,
          metadataFetchedAt: new Date(),
          authorId: pooler.osuId,
          authorName: pooler.username,
        })),
      );
    await expect(selectionCommand(tester, slug, add())).rejects.toMatchObject({
      status: 409,
    });
    const [candidate] = await db().select().from(mappoolCandidates).limit(1);
    await db()
      .insert(mappoolCandidateComments)
      .values(
        Array.from({ length: 200 }, () => ({
          candidateId: candidate.id,
          editionSlug: slug,
          requestId: randomUUID(),
          body: "Synthetic existing comment",
          authorId: pooler.osuId,
          authorName: pooler.username,
        })),
      );
    await expect(
      selectionCommand(tester, slug, {
        action: "comment",
        candidateId: candidate.id,
        requestId: randomUUID(),
        body: "Over capacity",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await candidateComments(tester, slug, candidate.id)).toHaveLength(
      200,
    );
    expect(
      await db().select().from(editionState).where(eq(editionState.slug, slug)),
    ).toHaveLength(1);
  });
  it("validates comment bodies and candidate IDs without creating records", async () => {
    await selectionCommand(pooler, slug, add());
    const id = (await selectionWorkspace(tester, slug)).candidates[0].id;
    for (const body of [" ", "x".repeat(2001)])
      await expect(
        selectionCommand(tester, slug, {
          action: "comment",
          candidateId: id,
          requestId: randomUUID(),
          body,
        }),
      ).rejects.toMatchObject({ status: 400 });
    await expect(
      candidateComments(tester, slug, "invalid"),
    ).rejects.toMatchObject({ status: 400 });
    expect(await db().select().from(mappoolCandidateComments)).toHaveLength(0);
  });
});
