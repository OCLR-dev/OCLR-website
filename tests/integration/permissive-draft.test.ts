import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { sql, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, closeDb } from "../../src/db";
import {
  registrations,
  editionState,
  captains,
  teams,
  draftPicks,
  memberships,
  editionEvents,
} from "../../src/db/schema";
import { draftCommand, pickPlayer } from "../../src/lib/draft";
import { staffDraft, publicDraft, captainDraft } from "../../src/lib/draft-reads";
import { prepareDraft } from "../fixtures/draft";
import { assertTestDatabase } from "../database";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("save/start without artificial readiness gates", () => {
  let f: Awaited<ReturnType<typeof prepareDraft>>;
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", "998001");
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    f = await prepareDraft("permissive-test", 998001, 2, false);
    await db()
      .update(editionState)
      .set({ lockedAt: null })
      .where(eq(editionState.slug, "permissive-test"));
    await db().update(captains).set({ published: false });
    await db().update(teams).set({ identityPublished: false, capacity: null });
    await db()
      .update(registrations)
      .set({ draftUnavailableReason: "Synthetic unavailable" })
      .where(sql`user_id >= ${f.players[1].osuId}`);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  async function action(action: string, extra = {}) {
    const d = await staffDraft(f.staff, "permissive-test");
    return draftCommand(f.staff, "permissive-test", {
      expectedVersion: d.session!.version,
      confirmed: true,
      command: { action, ...extra },
    });
  }
  it("saves unlocked with two turns and one player, starts privately, accepts exactly one concurrent pick, then safely pauses/recovers", async () => {
    const data = await staffDraft(f.staff, "permissive-test");
    await action("configure", {
      turnSequence: f.sequence,
      expectedSetupVersion: data.edition!.setupVersion,
    });
    const started = await action("start");
    expect(started.session?.state).toBe("live");
    expect(started.availablePool).toHaveLength(1);
    expect(started.edition?.lockedAt).not.toBeNull();
    expect(await publicDraft("permissive-test")).toBeNull();
    expect(
      (await captainDraft(f.a, "permissive-test"))?.eligiblePool,
    ).toHaveLength(1);
    const input = {
      sessionId: started.session!.id,
      turnIndex: 0,
      candidateId: f.players[0].osuId,
      expectedVersion: started.session!.version,
      idempotencyKey: randomUUID(),
    };
    const results = await Promise.allSettled([
      pickPlayer(f.a, "permissive-test", input),
      pickPlayer(f.staff, "permissive-test", {
        ...input,
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const after = await staffDraft(f.staff, "permissive-test");
    expect(after.session).toMatchObject({ state: "live", turnIndex: 1 });
    expect(after.availablePool).toHaveLength(0);
    expect(await publicDraft("permissive-test")).toBeNull();
    expect(await db().select().from(draftPicks)).toHaveLength(1);
    await expect(
      pickPlayer(f.staff, "permissive-test", {
        ...input,
        turnIndex: 1,
        expectedVersion: after.session!.version,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await action("pause");
    await action("resume");
    await action("pause");
    await action("abort");
    expect((await db().select().from(draftPicks))[0].voidedAt).not.toBeNull();
    expect(
      (await db().select().from(memberships)).filter(
        (m) => m.origin === "draft" && !m.leftAt,
      ),
    ).toHaveLength(0);
    await action("recover");
    expect((await staffDraft(f.staff, "permissive-test")).session?.state).toBe(
      "setup",
    );
    expect(
      (await db().select().from(editionEvents)).some(
        (e) => e.kind === "draft_start",
      ),
    ).toBe(true);
  });
  it("starts with zero candidates but never fabricates a selection", async () => {
    await db()
      .update(registrations)
      .set({ draftUnavailableReason: "Synthetic unavailable" })
      .where(eq(registrations.userId, f.players[0].osuId));
    const data = await action("start");
    expect(data.session?.state).toBe("live");
    expect(data.availablePool).toHaveLength(0);
    await action("pause");
    expect(await db().select().from(draftPicks)).toHaveLength(0);
  });
});
