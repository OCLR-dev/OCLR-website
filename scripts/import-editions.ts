/** One-time migration command. The web application never imports this module or reads this JSON. */
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { db, closeDb } from "../src/db";
import {
  editionState,
  editionRevisions,
  editionEvents,
} from "../src/db/schema";
import {
  editionsSchema,
  editionSchema,
  normalizeEditionBranding,
} from "../src/lib/editions";
import bootstrap from "../drizzle/legacy-editions.json" with { type: "json" };
export async function importLegacyEditions(
  input: unknown,
  allowBootstrap = false,
) {
  const editions = editionsSchema.parse(
    Array.isArray(input)
      ? input.map((candidate) =>
          candidate && typeof candidate === "object"
            ? normalizeEditionBranding(candidate as Record<string, unknown>)
            : candidate,
        )
      : input,
  );
  let imported = 0;
  await db().transaction(async (tx) => {
    for (const candidate of editions) {
      const value = editionSchema.parse({
        ...candidate,
        published: candidate.slug === "s11" ? false : candidate.published,
        registration: candidate.registration
          ? { ...candidate.registration, enabled: false }
          : null,
      });
      const { slug, ...configuration } = value;
      await tx.insert(editionState).values({ slug }).onConflictDoNothing();
      const [state] = await tx
        .select()
        .from(editionState)
        .where(eq(editionState.slug, slug))
        .for("update");
      if (
        state.configuration &&
        JSON.stringify(
          editionSchema.parse(
            normalizeEditionBranding({ ...state.configuration, slug }),
          ),
        ) === JSON.stringify(value)
      )
        continue;
      if (state.configuration) {
        const original = editionSchema.parse(
          normalizeEditionBranding(bootstrap[0]),
        );
        if (
          !allowBootstrap ||
          slug !== "s11" ||
          state.configurationVersion !== 0 ||
          JSON.stringify(
            editionSchema.parse(
              normalizeEditionBranding({ ...state.configuration, slug }),
            ),
          ) !== JSON.stringify(original)
        )
          throw new Error(
            `Edition ${slug} already has database content; use Admin settings. No content was overwritten.`,
          );
        const [prior] = await tx
          .select()
          .from(editionEvents)
          .where(
            and(
              eq(editionEvents.editionSlug, slug),
              eq(editionEvents.kind, "tournament_legacy_import"),
            ),
          );
        if (prior)
          throw new Error("The bootstrap edition was already imported.");
      }
      const revision = state.configuration ? state.configurationVersion + 1 : 0;
      await tx
        .update(editionState)
        .set({
          configuration,
          configurationVersion: revision,
          configurationUpdatedAt: new Date(),
        })
        .where(eq(editionState.slug, slug));
      await tx
        .insert(editionRevisions)
        .values({ editionSlug: slug, version: revision, configuration });
      await tx.insert(editionEvents).values({
        editionSlug: slug,
        kind: "tournament_legacy_import",
        detail: {
          entity: { type: "tournament", id: slug },
          source: "one_time_migration",
          before: state.configuration
            ? {
                configuration: state.configuration,
                revision: state.configurationVersion,
              }
            : null,
          after: { configuration, revision },
        },
      });
      imported++;
    }
  });
  return { imported, unchanged: editions.length - imported };
}
if (process.argv[1]?.endsWith("/import-editions.ts")) {
  try {
    const filename = process.argv[2];
    if (!filename || filename.startsWith("--"))
      throw new Error(
        "Usage: npm run db:import-editions -- /absolute/path/approved-legacy.json [--replace-bootstrap-s11]",
      );
    console.log(
      await importLegacyEditions(
        JSON.parse(readFileSync(filename, "utf8")),
        process.argv.includes("--replace-bootstrap-s11"),
      ),
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Legacy import failed",
    );
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
