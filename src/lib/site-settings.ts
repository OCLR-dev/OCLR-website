import { db } from "@/db";
import { siteSettingEvents, siteSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { updateSiteAppearanceWrite } from "./admin-operations-write-contracts";
import type { User } from "./auth/sessions";
import { assertCapability, assertReadCapability } from "./auth/staff";
import { remoteMode } from "./data-source";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http-error";
import { readSiteAppearance } from "./preferences";
import type { ExplicitReadData } from "./explicit-read-contracts";
type SiteSettings = ExplicitReadData<"siteSettingsForAdmin">;

export async function readSiteSettings(): Promise<SiteSettings> {
  const [settings] = await db()
    .select({
      id: siteSettings.id,
      defaultAppearance: siteSettings.defaultAppearance,
      revision: siteSettings.revision,
      updatedAt: siteSettings.updatedAt,
    })
    .from(siteSettings)
    .where(eq(siteSettings.id, 1));
  return (
    settings ?? {
      id: 1,
      defaultAppearance: "default" as const,
      revision: 0,
      updatedAt: null,
    }
  );
}

// Request-local deduplication only: the next request sees a saved default without
// redeployment. A cosmetic preference must not take down public pages on DB failure.
export const defaultSiteAppearance = cache(async () => {
  if (!process.env.DATABASE_URL) return "default" as const;
  try {
    return readSiteAppearance((await readSiteSettings()).defaultAppearance);
  } catch {
    console.error(
      "Site appearance is temporarily unavailable; using the original design.",
    );
    return "default" as const;
  }
});

async function databaseSiteSettingsForAdmin(actor: User) {
  // No edition argument deliberately requires a global Admin grant.
  await assertReadCapability(actor, "configure_tournament");
  return readSiteSettings();
}
export async function siteSettingsForAdmin(actor: User): Promise<SiteSettings> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<SiteSettings>("siteSettingsForAdmin");
  }
  return databaseSiteSettingsForAdmin(actor);
}

export async function updateSiteSettings(actor: User, input: unknown) {
  await assertCapability(actor, "configure_tournament");
  const parsed = updateSiteAppearanceWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Select a valid website appearance.");
  return db().transaction(async (tx) => {
    await tx.insert(siteSettings).values({ id: 1 }).onConflictDoNothing();
    const [before] = await tx
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.id, 1))
      .for("update");
    await assertCapability(actor, "configure_tournament", undefined, tx);
    if (before.revision !== parsed.data.expectedRevision)
      throw new HttpError(
        409,
        "Website settings changed. Refresh before saving.",
      );
    if (before.defaultAppearance === parsed.data.defaultAppearance)
      return before;
    const [after] = await tx
      .update(siteSettings)
      .set({
        defaultAppearance: parsed.data.defaultAppearance,
        revision: before.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(siteSettings.id, 1))
      .returning();
    await tx.insert(siteSettingEvents).values({
      actorId: actor.osuId,
      before: before.defaultAppearance,
      after: after.defaultAppearance,
      revision: after.revision,
    });
    return after;
  });
}
