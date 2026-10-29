import { assertTestDatabase } from "../database";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { editionRevisions, editionState } from "../../src/db/schema";
import { editionSchema, type Edition } from "../../src/lib/editions";
import { edition } from "./edition";
/** Explicit isolated DB fixtures only; never an application seed or read fallback. */
export async function seedEditions(
  values: unknown[] = [edition],
  replace = true,
) {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  for (const value of values) {
    const { slug, ...configuration } = editionSchema.parse(value);
    await db()
      .insert(editionState)
      .values({ slug, configuration })
      .onConflictDoUpdate({
        target: editionState.slug,
        set: { configuration, configurationVersion: 0 },
        where: replace ? undefined : sql`${editionState.configuration} IS NULL`,
      });
    await db()
      .insert(editionRevisions)
      .values({ editionSlug: slug, version: 0, configuration })
      .onConflictDoUpdate({
        target: [editionRevisions.editionSlug, editionRevisions.version],
        set: { configuration },
        where: replace ? undefined : sql`false`,
      });
  }
}
export type { Edition };

/** Presentation-only test setup; real appearance changes use Admin commands. */
export async function setEditionAppearance(slug: string, appearance: string) {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  const { eq } = await import("drizzle-orm");
  const { isAppearance } = await import("../../src/lib/preferences");
  if (!isAppearance(appearance)) throw new Error("Unknown fixture appearance");
  const rows = await db()
    .update(editionState)
    .set({
      configuration: sql`jsonb_set(${editionState.configuration}, '{defaultAppearance}', ${JSON.stringify(appearance)}::jsonb)`,
    })
    .where(eq(editionState.slug, slug))
    .returning({ slug: editionState.slug });
  if (rows.length !== 1)
    throw new Error("Missing synthetic appearance edition");
}
