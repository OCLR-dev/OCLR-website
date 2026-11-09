import { db } from "@/db";
import {
  mappoolEntries,
  mappools,
  refereeRoundPolicies,
  tournamentRounds,
  tournamentStages,
} from "@/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { User } from "./auth/sessions";
import { assertReadCapability } from "./auth/staff";
import type { HistoricalMapSource } from "./competition-detail-read-contracts";
import { getEdition, getPublicEdition } from "./content";
import { remoteMode } from "./data-source";
import { previewConfigurations } from "./difficulty-display";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http-error";
import { loadSavedDifficulties, selectSavedDifficulty } from "./saved-difficulty";
import type { RoundRefereeRule } from "./staff-workspace-read-contracts";

/** Older saved-read backends omit this additive field. Current DB rows retain null. */
function historicalSourceRead<
  T extends {
    source: HistoricalMapSource | null;
    downloadMirror: string | null;
  },
>(
  entry: T,
): Omit<T, "source" | "downloadMirror"> & {
  source?: HistoricalMapSource | null;
  downloadMirror?: string | null;
} {
  return entry;
}

const roundFields = {
  id: tournamentRounds.id,
  name: tournamentRounds.name,
  stage: tournamentStages.kind,
  position: tournamentRounds.position,
  version: tournamentRounds.version,
};
const poolFields = {
  id: mappools.id,
  name: mappools.name,
  roundId: mappools.roundId,
  fmMode: mappools.fmMode,
  fmRestrictions: mappools.fmRestrictions,
  version: mappools.version,
  publishedAt: mappools.publishedAt,
  lockedAt: mappools.lockedAt,
  selectionLockedAt: mappools.selectionLockedAt,
  showcaseAt: mappools.showcaseAt,
  updatedAt: mappools.updatedAt,
};
async function databaseMappoolWorkspace(
  actor: User,
  slug: string,
): Promise<MappoolWorkspace> {
  await assertReadCapability(actor, "view_replays", slug);
  if (!(await getEdition(slug))) throw new HttpError(404, "Edition not found.");
  return db().transaction(
    async (tx) => {
      const rounds = await tx
        .select(roundFields)
        .from(tournamentRounds)
        .innerJoin(
          tournamentStages,
          eq(tournamentStages.id, tournamentRounds.stageId),
        )
        .where(eq(tournamentRounds.editionSlug, slug))
        .orderBy(tournamentStages.kind, tournamentRounds.position);
      const pools = await tx
        .select(poolFields)
        .from(mappools)
        .where(eq(mappools.editionSlug, slug))
        .orderBy(mappools.name);
      const entries = pools.length
        ? await tx
            .select()
            .from(mappoolEntries)
            .where(
              inArray(
                mappoolEntries.poolId,
                pools.map((p) => p.id),
              ),
            )
            .orderBy(mappoolEntries.category, mappoolEntries.position)
        : [];
      const refereeRules = await tx
        .select({
          roundId: tournamentRounds.id,
          policy: refereeRoundPolicies.policy,
          revision: refereeRoundPolicies.revision,
          rules: tournamentRounds.scoringRules,
        })
        .from(tournamentRounds)
        .leftJoin(
          refereeRoundPolicies,
          eq(refereeRoundPolicies.roundId, tournamentRounds.id),
        )
        .where(eq(tournamentRounds.editionSlug, slug));
      return {
        rounds,
        pools,
        entries: entries.map(historicalSourceRead),
        ...({
          refereeRules: refereeRules.map(
            ({ roundId, policy, revision, rules }) => ({
              roundId,
              policy,
              revision: revision ?? 0,
              series: rules?.series ?? null,
            }),
          ),
        } as { refereeRules?: RoundRefereeRule[] }),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function mappoolWorkspace(
  actor: User,
  slug: string,
): Promise<MappoolWorkspace> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<MappoolWorkspace>("mappoolWorkspace", { slug });
  }
  return databaseMappoolWorkspace(actor, slug);
}

export type MappoolWorkspace =
  import("./explicit-read-contracts").ExplicitReadData<"mappoolWorkspace">;

type PublicMappools =
  import("./explicit-read-contracts").ExplicitReadData<"publicMappools">;
async function databasePublicMappools(
  slug: string,
  poolId?: string,
): Promise<PublicMappools> {
  if (!(await getPublicEdition(slug)) || !process.env.DATABASE_URL) return [];
  if (poolId && !z.uuid().safeParse(poolId).success) return [];
  return db().transaction(
    async (tx) => {
      const pools = await tx
        .select({
          id: mappools.id,
          name: mappools.name,
          roundId: mappools.roundId,
          fmMode: mappools.fmMode,
          fmRestrictions: mappools.fmRestrictions,
          publishedAt: mappools.publishedAt,
          updatedAt: mappools.updatedAt,
          roundName: tournamentRounds.name,
          roundPosition: tournamentRounds.position,
          stage: tournamentStages.kind,
        })
        .from(mappools)
        .innerJoin(tournamentRounds, eq(tournamentRounds.id, mappools.roundId))
        .innerJoin(
          tournamentStages,
          eq(tournamentStages.id, tournamentRounds.stageId),
        )
        .where(
          and(
            eq(mappools.editionSlug, slug),
            isNotNull(mappools.publishedAt),
            poolId ? eq(mappools.id, poolId) : undefined,
          ),
        )
        .orderBy(
          tournamentStages.kind,
          tournamentRounds.position,
          mappools.name,
        );
      const entries = pools.length
        ? await tx
            .select({
              id: mappoolEntries.id,
              poolId: mappoolEntries.poolId,
              category: mappoolEntries.category,
              position: mappoolEntries.position,
              beatmapId: mappoolEntries.beatmapId,
              downloadMirror: mappoolEntries.downloadMirror,
              metadata: mappoolEntries.metadata,
              source: mappoolEntries.source,
            })
            .from(mappoolEntries)
            .where(
              inArray(
                mappoolEntries.poolId,
                pools.map((p) => p.id),
              ),
            )
            .orderBy(mappoolEntries.category, mappoolEntries.position)
        : [];
      return pools.map((p) => ({
        ...p,
        entries: entries
          .filter((e) => e.poolId === p.id)
          .map(historicalSourceRead),
      }));
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function publicMappools(
  slug: string,
  poolId?: string,
): Promise<PublicMappools> {
  const remote = remoteMode();
  const pools = remote
    ? await frontendResource<PublicMappools>("publicMappools", { slug, poolId })
    : await databasePublicMappools(slug, poolId);
  const saved = await loadSavedDifficulties(
    pools.flatMap((pool) => pool.entries.map((entry) => entry.beatmapId)),
  );
  return pools.map((pool) => ({
    ...pool,
    entries: pool.entries.map((entry) => {
      if (remote && entry.metadata.difficultySnapshot) return entry;
      const snapshot = selectSavedDifficulty(
        saved,
        entry.beatmapId,
        previewConfigurations(
          entry.category,
          entry.metadata.attributes?.configuration,
        ),
        entry.metadata.difficultySnapshot,
        entry.metadata.checksum,
        entry.metadata.mode,
      );
      return snapshot
        ? {
            ...entry,
            metadata: { ...entry.metadata, difficultySnapshot: snapshot },
          }
        : entry;
    }),
  }));
}
