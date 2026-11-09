import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  awardSettings,
  editionEvents,
  editionState,
  weeklyAwardReleases,
} from "@/db/schema";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { calculateAwardWorkspace } from "./award-calculation";
import { awardConfigurationSchema } from "./award-model";
import { awardWorkspace, type AwardWorkspace } from "./award-reads";
import { HttpError } from "./http-error";
import { changeAwardsWrite } from "./results-publication-write-contracts";

export async function awardCommand(
  actor: User,
  slug: string,
  input: unknown,
): Promise<AwardWorkspace> {
  const parsed = changeAwardsWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Invalid award configuration or command.");
  const c = parsed.data;
  await assertCapability(
    actor,
    c.action === "configure" ? "configure_tournament" : "publish_results",
    slug,
  );
  await db().transaction(async (tx) => {
    await tx
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await assertCapability(
      actor,
      c.action === "configure" ? "configure_tournament" : "publish_results",
      slug,
      tx,
    );
    const current = await calculateAwardWorkspace(slug, tx);
    if (current.version !== c.expectedVersion)
      throw new HttpError(
        409,
        "Award configuration changed. Refresh before saving.",
      );
    let before: unknown, after: unknown;
    if (c.action === "configure") {
      const config = awardConfigurationSchema.safeParse({
        weeks: c.weeks,
        policy: c.policy ?? current.policy,
      });
      if (!config.success)
        throw new HttpError(
          400,
          "Configure consecutive, non-overlapping weeks.",
        );
      before = {
        weeks: current.weeks,
        policy: current.policy,
        version: current.version,
      };
      after = { ...config.data, version: current.version + 1 };
      await tx
        .insert(awardSettings)
        .values({
          editionSlug: slug,
          ...config.data,
          version: current.version + 1,
        })
        .onConflictDoUpdate({
          target: awardSettings.editionSlug,
          set: {
            ...config.data,
            version: current.version + 1,
            updatedAt: new Date(),
          },
        });
    } else {
      const active = current.releases.find((r) => r.week === c.week);
      if (c.action === "unpublish") {
        if (!active || active.id !== c.releaseId)
          throw new HttpError(
            409,
            "Award publication changed. Refresh before saving.",
          );
        await tx
          .update(weeklyAwardReleases)
          .set({ active: false })
          .where(eq(weeklyAwardReleases.id, active.id));
        before = { id: active.id, revision: active.revision };
        after = { active: false };
      } else {
        const report = current.reports.find((r) => r.number === c.week);
        if (!report || report.fingerprint !== c.fingerprint)
          throw new HttpError(
            409,
            "Award source data changed. Review the refreshed calculation.",
          );
        if (
          report.issues.includes(
            "Release draft Tier sources before publishing awards.",
          )
        )
          throw new HttpError(
            409,
            "Release draft Tier sources before publishing awards.",
          );
        const winners = new Set([
          ...report.mvp,
          ...report.mip,
          ...report.rookie,
        ]);
        if (
          report.issues.length ||
          [...winners].some(
            (id) => !report.identities.some((p) => p.userId === id && p.public),
          )
        )
          throw new HttpError(
            409,
            "Resolve unverified games and unpublished winner identities before publishing awards.",
          );
        if (active?.fingerprint === report.fingerprint) return;
        if (active)
          await tx
            .update(weeklyAwardReleases)
            .set({ active: false })
            .where(eq(weeklyAwardReleases.id, active.id));
        const [latest] = await tx
          .select({ revision: weeklyAwardReleases.revision })
          .from(weeklyAwardReleases)
          .where(
            and(
              eq(weeklyAwardReleases.editionSlug, slug),
              eq(weeklyAwardReleases.week, c.week),
            ),
          )
          .orderBy(desc(weeklyAwardReleases.revision))
          .limit(1);
        const [release] = await tx
          .insert(weeklyAwardReleases)
          .values({
            editionSlug: slug,
            week: c.week,
            revision: (latest?.revision ?? 0) + 1,
            fingerprint: report.fingerprint,
            report,
            publishedBy: actor.osuId,
          })
          .returning();
        before = active ? { id: active.id, revision: active.revision } : null;
        after = {
          id: release.id,
          revision: release.revision,
          fingerprint: release.fingerprint,
        };
      }
    }
    await tx.insert(editionEvents).values({
      editionSlug: slug,
      actorId: actor.osuId,
      kind: `awards_${c.action}`,
      detail: { entity: { type: "weekly_awards", id: slug }, before, after },
    });
  });
  return awardWorkspace(actor, slug);
}
