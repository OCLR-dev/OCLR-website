import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  historicalBracketAdvancements,
  historicalBracketMatches,
  historicalBrackets,
} from "@/db/schema";

export type HistoricalBracketPlan = {
  bracket: typeof historicalBrackets.$inferSelect;
  matches: (typeof historicalBracketMatches.$inferSelect)[];
  advancements: (typeof historicalBracketAdvancements.$inferSelect)[];
};

export function supportsArchiveProgression(slug: string) {
  return /^s(?:[1-9]|10)$/.test(slug);
}

export async function readArchiveProgression(
  slug: string,
): Promise<HistoricalBracketPlan | null> {
  if (!supportsArchiveProgression(slug)) return null;
  const rows = await db()
    .select({
      bracket: historicalBrackets,
      match: historicalBracketMatches,
      advancement: historicalBracketAdvancements,
    })
    .from(historicalBrackets)
    .innerJoin(
      historicalBracketMatches,
      eq(historicalBracketMatches.editionSlug, historicalBrackets.editionSlug),
    )
    .leftJoin(
      historicalBracketAdvancements,
      and(
        eq(
          historicalBracketAdvancements.editionSlug,
          historicalBracketMatches.editionSlug,
        ),
        eq(
          historicalBracketAdvancements.targetFixtureId,
          historicalBracketMatches.fixtureId,
        ),
      ),
    )
    .where(eq(historicalBrackets.editionSlug, slug))
    .orderBy(
      historicalBracketMatches.position,
      historicalBracketAdvancements.targetSlot,
    );
  if (!rows.length) return null;
  return {
    bracket: rows[0].bracket,
    matches: [
      ...new Map(rows.map(({ match }) => [match.fixtureId, match])).values(),
    ],
    advancements: rows.flatMap(({ advancement }) =>
      advancement ? [advancement] : [],
    ),
  };
}
