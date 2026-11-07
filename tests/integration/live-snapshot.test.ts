import { AsyncLocalStorage } from "node:async_hooks";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db";
import { draftSessions, editionState } from "../../src/db/schema";
import { liveSnapshot } from "../../src/lib/live-snapshot";
import { assertTestDatabase } from "../database";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("committed live snapshots", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("refreshes private readers in their own request context only after commit, then clears a revoked reader", async () => {
    const slug = "test-live-snapshot";
    const context = new AsyncLocalStorage<string>();
    let revoked = false;
    await db().insert(editionState).values({ slug });
    await db().insert(draftSessions).values({ editionSlug: slug });
    async function subscribe(identity: string) {
      const read = vi.fn(async () => {
        const subject = context.getStore();
        if (revoked && subject === "first")
          return new Response(null, { status: 403 });
        const [session] = await db()
          .select({ version: draftSessions.version })
          .from(draftSessions)
          .where(eq(draftSessions.editionSlug, slug));
        return Response.json({ subject, version: session.version });
      });
      const request = new Request("http://localhost/draft?live=1", {
        headers: { Accept: "application/x-ndjson" },
      });
      const response = await context.run(identity, () =>
        liveSnapshot(request, `draft-private:${slug}`, read),
      );
      const reader = response
        .body!.pipeThrough(new TextDecoderStream())
        .getReader();
      async function next() {
        const chunk = await reader.read();
        return chunk.done ? null : JSON.parse(chunk.value);
      }
      return { reader, next, read };
    }
    const first = await subscribe("first");
    const second = await subscribe("second");
    try {
      expect(await first.next()).toEqual({
        snapshot: { subject: "first", version: 0 },
      });
      expect(await second.next()).toEqual({
        snapshot: { subject: "second", version: 0 },
      });
      const change = (
        tx: Pick<ReturnType<typeof db>, "update">,
        version: number,
      ) =>
        tx
          .update(draftSessions)
          .set({ version })
          .where(eq(draftSessions.editionSlug, slug));
      await expect(
        db().transaction(async (tx) => {
          await change(tx, 1);
          throw new Error("rollback");
        }),
      ).rejects.toThrow("rollback");
      await change(db(), 2);
      expect(await first.next()).toEqual({
        snapshot: { subject: "first", version: 2 },
      });
      expect(await second.next()).toEqual({
        snapshot: { subject: "second", version: 2 },
      });
      expect(first.read).toHaveBeenCalledTimes(2);
      expect(second.read).toHaveBeenCalledTimes(2);
      revoked = true;
      await change(db(), 3);
      expect(await first.next()).toEqual({ status: 403 });
      expect(await first.next()).toBeNull();
      expect(await second.next()).toEqual({
        snapshot: { subject: "second", version: 3 },
      });
    } finally {
      await Promise.all([first.reader.cancel(), second.reader.cancel()]);
      await db().execute(
        sql`DELETE FROM draft_sessions WHERE edition_slug = ${slug}`,
      );
      await db().delete(editionState).where(eq(editionState.slug, slug));
    }
  });
});
