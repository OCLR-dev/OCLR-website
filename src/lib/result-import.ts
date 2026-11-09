import { db } from "@/db";
import {
  editionEvents,
  editionState,
  fixtureReferees,
  fixtures,
  matchGames,
  matchImports,
  matchResults,
  resultAuditEvents,
  resultRevisions,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { User } from "./auth/sessions";
import { assertCapability, hasCapability } from "./auth/staff";
import {
  fixtureForReview,
  officialTeams,
  staffFixtures,
} from "./fixture-reads";
import { HttpError } from "./http-error";
import { matchSourceSchema } from "./match-model";
import {
  importMatchResultWrite,
  previewMatchImportWrite,
  type FixtureMatchPreview,
} from "./match-result-write-contracts";
import { checkedStoredMatchSource, compareMatchSources } from "./match-source";
import { fetchMatchSource, parseMatchId } from "./osu-matches";
import {
  hasResultCommandReceipt,
  resultRequestHash,
} from "./result-command-receipts";
import { matchReview, type MatchReview } from "./result-review";

export async function importFixtureMatch(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
): Promise<MatchReview> {
  const parsed = importMatchResultWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Confirm a valid MP link and current versions.");
  const c = parsed.data;
  let before;
  if (c.completion) {
    await assertCapability(actor, "manage_fixtures", slug);
    const workspace = await staffFixtures(actor, slug);
    const fixture = workspace.fixtures.find((f) => f.id === fixtureId);
    if (!fixture) throw new HttpError(404, "Fixture not found.");
    before = { fixture, result: fixture.result };
  } else before = await fixtureForReview(actor, slug, fixtureId);
  const hash = resultRequestHash({ action: "import", ...c });
  if (await hasResultCommandReceipt(db(), actor, fixtureId, c.requestKey, hash))
    return matchReview(actor, slug, fixtureId);
  if (before.fixture.status === "cancelled")
    throw new HttpError(409, "Cancelled fixtures cannot import new results.");
  if (
    before.fixture.version !== c.expectedFixtureVersion ||
    (before.result?.version ?? 0) !== c.expectedVersion
  )
    throw new HttpError(
      409,
      "Fixture or report changed. Refresh before importing.",
    );
  const source = await fetchMatchSource(parseMatchId(c.match));
  if (c.completion && source.fingerprint !== c.completion.sourceFingerprint)
    throw new HttpError(
      409,
      "Match source changed. Retrieve the preview again.",
    );
  await db().transaction(async (tx) => {
    await tx
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await tx
      .select()
      .from(fixtures)
      .where(eq(fixtures.id, fixtureId))
      .for("update");
    if (await hasResultCommandReceipt(tx, actor, fixtureId, c.requestKey, hash))
      return;
    let completed = false;
    if (c.completion) {
      await assertCapability(actor, "manage_fixtures", slug, tx);
      const [fixture] = await tx
        .select()
        .from(fixtures)
        .where(and(eq(fixtures.id, fixtureId), eq(fixtures.editionSlug, slug)));
      const [result] = await tx
        .select()
        .from(matchResults)
        .where(eq(matchResults.fixtureId, fixtureId));
      if (
        !fixture ||
        fixture.version !== c.expectedFixtureVersion ||
        (result?.version ?? 0) !== c.expectedVersion ||
        fixture.status === "cancelled"
      )
        throw new HttpError(
          409,
          "Fixture or report changed. Refresh before importing.",
        );
      const selected = c.completion;
      if (fixture.exhibitionSides)
        throw new HttpError(
          409,
          "Open exhibitions already have red and blue sides. Import the match without completing official teams.",
        );
      if (
        selected.homeTeamId === selected.awayTeamId ||
        (fixture.homeTeamId && fixture.homeTeamId !== selected.homeTeamId) ||
        (fixture.awayTeamId && fixture.awayTeamId !== selected.awayTeamId) ||
        (!fixture.homeTeamId && fixture.homeSourceId) ||
        (!fixture.awayTeamId && fixture.awaySourceId)
      )
        throw new HttpError(
          409,
          "Existing teams and bracket sources are preserved. Amend conflicting fixture settings first.",
        );
      const [protectedRevision] = await tx
        .select({ revision: resultRevisions.revision })
        .from(resultRevisions)
        .where(
          and(
            eq(resultRevisions.fixtureId, fixtureId),
            sql`${resultRevisions.approvedAt} IS NOT NULL`,
          ),
        )
        .limit(1);
      if (protectedRevision)
        throw new HttpError(
          409,
          "Approved fixture history cannot be completed from an MP preview.",
        );
      const eligible = await officialTeams(tx, slug);
      if (
        ![selected.homeTeamId, selected.awayTeamId].every((id) =>
          eligible.some((t) => t.id === id),
        )
      )
        throw new HttpError(
          409,
          "Both teams must have finalized published identities and rosters before reporting.",
        );
      completed = !fixture.homeTeamId || !fixture.awayTeamId;
      if (completed) {
        const [after] = await tx
          .update(fixtures)
          .set({
            homeTeamId: selected.homeTeamId,
            awayTeamId: selected.awayTeamId,
            version: fixture.version + 1,
          })
          .where(eq(fixtures.id, fixtureId))
          .returning();
        await tx.insert(editionEvents).values({
          editionSlug: slug,
          actorId: actor.osuId,
          kind: "fixture_completed_from_mp",
          detail: {
            entity: { type: "fixture", id: fixtureId },
            before: fixture,
            after,
            source: {
              matchId: source.match.id,
              fingerprint: source.fingerprint,
              startTime: source.match.startTime,
              endTime: source.match.endTime,
            },
          },
        });
      }
    }
    const context = await fixtureForReview(actor, slug, fixtureId, tx);
    if (
      context.fixture.status === "cancelled" ||
      context.fixture.version !==
        c.expectedFixtureVersion + (completed ? 1 : 0) ||
      (context.result?.version ?? 0) !== c.expectedVersion
    )
      throw new HttpError(
        409,
        "Fixture or report changed while osu! was responding. Refresh before retrying.",
      );
    const [prior] = context.result?.latestImportId
      ? await tx
          .select()
          .from(matchImports)
          .where(eq(matchImports.id, context.result.latestImportId))
      : [];
    const [existing] = await tx
      .select()
      .from(matchImports)
      .where(
        and(
          eq(matchImports.fixtureId, fixtureId),
          eq(matchImports.externalMatchId, source.match.id),
          eq(matchImports.fingerprint, source.fingerprint),
        ),
      );
    let importId = existing?.id;
    if (existing)
      checkedStoredMatchSource(existing.source, existing.fingerprint);
    else {
      const [created] = await tx
        .insert(matchImports)
        .values({
          fixtureId,
          externalMatchId: source.match.id,
          fingerprint: source.fingerprint,
          source,
          createdBy: actor.osuId,
        })
        .returning();
      importId = created.id;
      if (source.games.length)
        await tx.insert(matchGames).values(
          source.games.map((game) => ({
            importId: created.id,
            externalGameId: game.id,
            beatmapId: game.beatmapId,
            data: game,
          })),
        );
    }
    const didChange = context.result?.latestImportId !== importId;
    const version = (context.result?.version ?? 0) + (didChange ? 1 : 0);
    if (context.result)
      await tx
        .update(matchResults)
        .set({ latestImportId: importId!, version })
        .where(eq(matchResults.fixtureId, fixtureId));
    else
      await tx
        .insert(matchResults)
        .values({ fixtureId, latestImportId: importId!, version });
    const priorParsed = prior
      ? matchSourceSchema.safeParse(prior.source)
      : null;
    await tx.insert(resultAuditEvents).values({
      fixtureId,
      actorId: actor.osuId,
      action: didChange ? "source_imported" : "source_checked",
      requestKey: c.requestKey,
      requestHash: hash,
      detail: {
        entity: { type: "match_import", id: importId },
        before: {
          latestImportId: context.result?.latestImportId ?? null,
          version: context.result?.version ?? 0,
        },
        after: { latestImportId: importId, version },
        importId,
        externalMatchId: source.match.id,
        fingerprint: source.fingerprint,
        observedAt: source.fetchedAt,
        fromVersion: context.result?.version ?? 0,
        toVersion: version,
        diff: priorParsed?.success
          ? compareMatchSources(priorParsed.data, source)
          : null,
      },
    });
  });
  return matchReview(actor, slug, fixtureId);
}

export async function previewFixtureMatch(
  actor: User,
  slug: string,
  fixtureId: string,
  input: unknown,
): Promise<FixtureMatchPreview> {
  await assertCapability(actor, "record_results", slug);
  if (!(await hasCapability(actor, "manage_fixtures", slug))) {
    const [assignment] = await db()
      .select()
      .from(fixtureReferees)
      .where(
        and(
          eq(fixtureReferees.fixtureId, fixtureId),
          eq(fixtureReferees.userId, actor.osuId),
        ),
      );
    if (!assignment)
      throw new HttpError(403, "You are not assigned to this fixture.");
  }
  const workspace = await staffFixtures(actor, slug);
  const fixture = workspace.fixtures.find((f) => f.id === fixtureId);
  if (!fixture) throw new HttpError(404, "Fixture not found.");
  const parsed = previewMatchImportWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Confirm a valid MP link and current versions.");
  if (fixture.status === "cancelled")
    throw new HttpError(409, "Cancelled fixtures cannot import new results.");
  const source = await fetchMatchSource(parseMatchId(parsed.data.match));
  // Repeat authorization after the network call; revocations take effect immediately.
  const refreshed = await staffFixtures(actor, slug);
  if (!refreshed.fixtures.some((f) => f.id === fixtureId))
    throw new HttpError(403, "You are not assigned to this fixture.");
  const teams = refreshed.canManage
    ? await officialTeams(db(), slug)
    : refreshed.teams;
  const playerIds = [
    ...new Set(
      source.games.flatMap((g) =>
        g.scores.flatMap((s) => (s.osuId ? [s.osuId] : [])),
      ),
    ),
  ];
  const attribution = playerIds.map((osuId) => ({
    osuId,
    teamIds: teams
      .filter((t) => t.members.some((m) => m.osuId === osuId))
      .map((t) => t.id),
  }));
  const matched = [...new Set(attribution.flatMap((p) => p.teamIds))];
  const currentFixture = refreshed.fixtures.find((f) => f.id === fixtureId)!;
  const unique =
    attribution.length > 0 &&
    attribution.every((p) => p.teamIds.length === 1) &&
    matched.length === 2 &&
    (!currentFixture.homeTeamId ||
      matched.includes(currentFixture.homeTeamId)) &&
    (!currentFixture.awayTeamId || matched.includes(currentFixture.awayTeamId));
  const home =
    currentFixture.homeTeamId ??
    (unique
      ? (matched.find((id) => id !== currentFixture.awayTeamId) ?? null)
      : null);
  const away =
    currentFixture.awayTeamId ??
    (unique ? (matched.find((id) => id !== home) ?? null) : null);
  return {
    source,
    teams,
    attribution,
    fixture: currentFixture,
    suggested: { homeTeamId: home, awayTeamId: away },
    unique,
    expectedFixtureVersion: refreshed.fixtures.find((f) => f.id === fixtureId)!
      .version,
    expectedVersion:
      refreshed.fixtures.find((f) => f.id === fixtureId)!.result?.version ?? 0,
  };
}
export type { FixtureMatchPreview } from "./match-result-write-contracts";
