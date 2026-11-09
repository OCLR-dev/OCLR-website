import type { db } from "@/db";
import { resultAuditEvents } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { User } from "./auth/sessions";
import { HttpError } from "./http-error";

type Reader = Pick<ReturnType<typeof db>, "select">;

export function resultRequestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export async function hasResultCommandReceipt(
  reader: Reader,
  actor: User,
  fixtureId: string,
  requestKey: string,
  hash: string,
) {
  const [event] = await reader
    .select()
    .from(resultAuditEvents)
    .where(
      and(
        eq(resultAuditEvents.fixtureId, fixtureId),
        eq(resultAuditEvents.actorId, actor.osuId),
        eq(resultAuditEvents.requestKey, requestKey),
      ),
    );
  if (event && event.requestHash !== hash)
    throw new HttpError(
      409,
      "This request key was already used for a different operation.",
    );
  return Boolean(event);
}
