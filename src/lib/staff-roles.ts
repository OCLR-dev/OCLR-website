import { db } from "@/db";
import { editionState, staffRoleEvents, staffRoles, users } from "@/db/schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { User } from "./auth/sessions";
import {
  assertCapability,
  capabilityScope,
  readCapabilityScope,
  roles,
} from "./auth/staff";
import { getEdition } from "./content";
import { remoteMode } from "./data-source";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http";
const confirmation = {
  confirmed: z.literal(true),
};
const command = z.discriminatedUnion("action", [
  z
    .object({
      ...confirmation,
      action: z.literal("visibility"),
      grantId: z.uuid(),
      published: z.boolean(),
      expectedPublished: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...confirmation,
      action: z.literal("grant"),
      userId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      role: z.enum(roles),
      editionSlug: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(80)
        .nullable(),
    })
    .strict(),
  z
    .object({ ...confirmation, action: z.literal("revoke"), grantId: z.uuid() })
    .strict(),
]);
async function databaseListStaffRoles(actor: User) {
  const scopes = await readCapabilityScope(actor, "manage_staff");
  const where = scopes ? inArray(staffRoles.editionSlug, scopes) : undefined;
  const grants = await db()
    .select({ grant: staffRoles, username: users.username })
    .from(staffRoles)
    .innerJoin(users, eq(users.osuId, staffRoles.userId))
    .where(where)
    .orderBy(desc(staffRoles.grantedAt));
  const writeScopes = await capabilityScope(actor, "manage_staff").catch(
    (error: unknown) => {
      if (error instanceof HttpError && error.status === 403)
        return [] as string[];
      throw error;
    },
  );
  return { grants, scopes, writeScopes };
}
export async function listStaffRoles(
  actor: User,
): Promise<Awaited<ReturnType<typeof databaseListStaffRoles>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<Awaited<ReturnType<typeof databaseListStaffRoles>>>(
      "listStaffRoles",
      {},
    );
  }
  return databaseListStaffRoles(actor);
}

export async function changeStaffRole(actor: User, input: unknown) {
  await capabilityScope(actor, "manage_staff");
  const parsed = command.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Confirm a valid role change.");
  const c = parsed.data;
  if (c.action === "grant" && c.role === "developer" && c.editionSlug !== null)
    throw new HttpError(400, "Developer must be granted globally.");
  return db().transaction(async (tx) => {
    // Serialize grants/revocations so duplicate requests cannot create competing active grants.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
    if (c.action === "grant") {
      await assertCapability(
        actor,
        "manage_staff",
        c.editionSlug ?? undefined,
        tx,
      );
      if (c.editionSlug && !(await getEdition(c.editionSlug)))
        throw new HttpError(404, "Edition not found.");
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.osuId, c.userId));
      if (!user)
        throw new HttpError(
          400,
          "The verified osu! user must sign in before receiving a role.",
        );
      if (c.editionSlug)
        await tx
          .insert(editionState)
          .values({ slug: c.editionSlug })
          .onConflictDoNothing();
      const [existing] = await tx
        .select()
        .from(staffRoles)
        .where(
          and(
            eq(staffRoles.userId, c.userId),
            eq(staffRoles.role, c.role),
            c.editionSlug
              ? eq(staffRoles.editionSlug, c.editionSlug)
              : isNull(staffRoles.editionSlug),
            isNull(staffRoles.revokedAt),
          ),
        );
      if (existing)
        throw new HttpError(
          409,
          "This active role already exists. Refresh the role list.",
        );
      const [grant] = await tx
        .insert(staffRoles)
        .values({
          userId: c.userId,
          role: c.role,
          editionSlug: c.editionSlug,
          grantedBy: actor.osuId,
        })
        .returning();
      await tx.insert(staffRoleEvents).values({
        grantId: grant.id,
        actorId: actor.osuId,
        targetId: grant.userId,
        role: grant.role,
        editionSlug: grant.editionSlug,
        action: "grant",
        before: null,
        after: grant,
      });
      return grant;
    }
    const [grant] = await tx
      .select()
      .from(staffRoles)
      .where(eq(staffRoles.id, c.grantId))
      .for("update");
    if (!grant) throw new HttpError(404, "Role grant not found.");
    await assertCapability(
      actor,
      "manage_staff",
      grant.editionSlug ?? undefined,
      tx,
    );
    if (grant.revokedAt)
      throw new HttpError(
        409,
        "This role was already revoked. Refresh the role list.",
      );
    if (c.action === "visibility") {
      if (grant.aboutPublished !== c.expectedPublished)
        throw new HttpError(
          409,
          "Public visibility changed. Refresh before saving.",
        );
      if (grant.aboutPublished === c.published) return grant;
      const [updated] = await tx
        .update(staffRoles)
        .set({ aboutPublished: c.published })
        .where(eq(staffRoles.id, grant.id))
        .returning();
      await tx.insert(staffRoleEvents).values({
        grantId: grant.id,
        actorId: actor.osuId,
        targetId: grant.userId,
        role: grant.role,
        editionSlug: grant.editionSlug,
        action: c.published ? "publish_profile" : "hide_profile",
        before: grant,
        after: updated,
      });
      return updated;
    }
    const [updated] = await tx
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.id, grant.id))
      .returning();
    await tx.insert(staffRoleEvents).values({
      grantId: grant.id,
      actorId: actor.osuId,
      targetId: grant.userId,
      role: grant.role,
      editionSlug: grant.editionSlug,
      action: "revoke",
      before: grant,
      after: updated,
    });
    return updated;
  });
}

const roleSetCommand = z
  .object({
    action: z.literal("set_roles"),
    confirmed: z.literal(true),
    userId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    editionSlug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(80)
      .nullable(),
    roles: z
      .array(z.enum(roles))
      .max(roles.length)
      .refine((items) => new Set(items).size === items.length),
    expectedGrantIds: z
      .array(z.uuid())
      .max(roles.length)
      .refine((items) => new Set(items).size === items.length),
  })
  .strict();

/** Replace one user's roles in one scope, never their visibility or other scopes. */
export async function changeStaffRoleSet(actor: User, input: unknown) {
  await capabilityScope(actor, "manage_staff");
  const parsed = roleSetCommand.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Confirm a valid role change.");
  const c = parsed.data;
  if (c.roles.includes("developer") && c.editionSlug !== null)
    throw new HttpError(400, "Developer must be granted globally.");
  return db().transaction(async (tx) => {
    // Share the lock with legacy single-role grants, revocations and visibility edits.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(17301)`);
    await assertCapability(
      actor,
      "manage_staff",
      c.editionSlug ?? undefined,
      tx,
    );
    if (c.editionSlug && !(await getEdition(c.editionSlug)))
      throw new HttpError(404, "Edition not found.");
    const [user] = await tx
      .select({ id: users.osuId })
      .from(users)
      .where(eq(users.osuId, c.userId));
    if (!user)
      throw new HttpError(
        400,
        "The verified osu! user must sign in before receiving a role.",
      );
    const current = await tx
      .select()
      .from(staffRoles)
      .where(
        and(
          eq(staffRoles.userId, c.userId),
          c.editionSlug
            ? eq(staffRoles.editionSlug, c.editionSlug)
            : isNull(staffRoles.editionSlug),
          isNull(staffRoles.revokedAt),
        ),
      )
      .for("update");
    if (
      JSON.stringify(current.map((g) => g.id).sort()) !==
      JSON.stringify([...c.expectedGrantIds].sort())
    )
      throw new HttpError(
        409,
        "Role assignments changed. Refresh before saving.",
      );
    if (c.editionSlug)
      await tx
        .insert(editionState)
        .values({ slug: c.editionSlug })
        .onConflictDoNothing();
    const retained = current.filter((g) => c.roles.includes(g.role));
    for (const grant of current.filter((g) => !c.roles.includes(g.role))) {
      const [updated] = await tx
        .update(staffRoles)
        .set({ revokedAt: new Date() })
        .where(eq(staffRoles.id, grant.id))
        .returning();
      await tx.insert(staffRoleEvents).values({
        grantId: grant.id,
        actorId: actor.osuId,
        targetId: grant.userId,
        role: grant.role,
        editionSlug: grant.editionSlug,
        action: "revoke",
        before: grant,
        after: updated,
      });
    }
    for (const role of c.roles.filter(
      (role) => !current.some((g) => g.role === role),
    )) {
      const [grant] = await tx
        .insert(staffRoles)
        .values({
          userId: c.userId,
          role,
          editionSlug: c.editionSlug,
          grantedBy: actor.osuId,
        })
        .returning();
      await tx.insert(staffRoleEvents).values({
        grantId: grant.id,
        actorId: actor.osuId,
        targetId: grant.userId,
        role: grant.role,
        editionSlug: grant.editionSlug,
        action: "grant",
        before: null,
        after: grant,
      });
      retained.push(grant);
    }
    return { grants: retained };
  });
}
