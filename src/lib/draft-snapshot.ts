import type { db } from "@/db";
import { draftSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildDraftSnapshots } from "./draft-board";
import { readDraftData } from "./draft-data";

type Transaction = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];

/** The caller owns the transaction and holds the edition row lock.
 * Refresh both snapshots and their versions alongside the originating change. */
export async function refreshDraftSnapshot(tx: Transaction, slug: string) {
  const data = await readDraftData(tx, slug);
  if (!data.session?.captainSnapshot) return;
  await tx
    .update(draftSessions)
    .set({ version: data.session.version + 1 })
    .where(eq(draftSessions.id, data.session.id));
  const current = await readDraftData(tx, slug);
  await tx
    .update(draftSessions)
    .set(buildDraftSnapshots(current))
    .where(eq(draftSessions.id, current.session!.id));
  return {
    fromVersion: data.session.version,
    toVersion: current.session!.version,
    publicVersion: current.session!.publicVersion + 1,
  };
}
