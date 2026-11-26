import { db, getPool, readOnlyData } from "@/db";
import { supportsArchiveStatistics } from "./archive-statistics-model";
import { publicArchiveStatistics } from "./archive-statistics-reads";
import { projectPublicPools, type Snapshot } from "./beatmap-similarity-model";
import {
  compareBeatmaps,
  latestVersions,
  profiles,
} from "./beatmap-similarity-ranking";
import type { chatAnalysisIntent } from "./chat-analysis-intent";
import { chatSeasonScope } from "./chat-season-scope";
import { remoteMode } from "./data-source";
import type { Edition } from "./editions";
import { HttpError } from "./http-error";
import { publicMappools } from "./mappool-reads";
import { playerPractice } from "./player-practice";
import { releaseSchema, type PracticeCorpus } from "./player-practice-data";
import { publishedLivePractice } from "./published-live-practice";
import { attachArchiveDifficulties } from "./saved-difficulty";
import { readTournament } from "./tournament-reads";

type Intent = NonNullable<ReturnType<typeof chatAnalysisIntent>>;
type MapReport = Awaited<ReturnType<typeof compareBeatmaps>>;
type PlayerReport = Awaited<ReturnType<typeof playerPractice>>;
export type TechnicalCoverage = {
  seasons: {
    slug: string;
    name: string;
    slots: number;
    comparableMaps?: number;
  }[];
  unavailable: string[];
};
export type AnalysisResult =
  | { status: "needs-input"; intent: Intent }
  | { status: "unavailable"; coverage?: TechnicalCoverage }
  | {
      status: "map-missing";
      bid: number;
      mod: MapReport["input"]["mod"];
      coverage: TechnicalCoverage;
    }
  | { status: "maps"; report: MapReport; coverage: TechnicalCoverage }
  | { status: "player"; report: PlayerReport; coverage: TechnicalCoverage };

async function archivedPractice(slug: string) {
  if (!supportsArchiveStatistics(slug)) return;
  try {
    const stats = await publicArchiveStatistics(slug);
    if (stats.publishedAt && stats.poolFixtures)
      return releaseSchema.parse(stats);
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 404)) throw error;
  }
}

async function publishedCorpus(
  selected: Edition,
  question: string,
  previous: string,
  includeResults: boolean,
  signal?: AbortSignal,
) {
  return readOnlyData(async () => {
    const scope = await chatSeasonScope(
      selected,
      question,
      previous,
      Boolean(previous),
      true,
    );
    const coverage: TechnicalCoverage = {
      seasons: [],
      unavailable: [...(scope?.summary.unavailable ?? [])],
    };
    const capturedAt = new Date().toISOString();
    const pools: Snapshot = { version: 1, capturedAt, sources: [], slots: [] };
    const snapshot: PracticeCorpus = {
      version: 1,
      capturedAt,
      pools,
      releases: [],
    };
    // Read serially on the same public transaction, including the nested saved readers.
    for (const { slug } of scope?.editions ?? []) {
      signal?.throwIfAborted();
      const record = await readTournament(slug, db(), true);
      if (!record?.edition.published) {
        coverage.unavailable.push(slug);
        continue;
      }
      const archive =
        record.edition.archive &&
        (await attachArchiveDifficulties(record.edition.archive));
      const native = record.edition.archive
        ? undefined
        : await publicMappools(slug);
      const projected = projectPublicPools(
        slug,
        {
          data: { ...record, edition: { ...record.edition, archive } },
        },
        native && {
          data: native.map((pool) => ({
            ...pool,
            publishedAt: pool.publishedAt?.toISOString() ?? null,
          })),
        },
      );
      pools.sources.push(projected.source);
      pools.slots.push(...projected.slots);
      coverage.seasons.push({
        slug,
        name: record.edition.name,
        slots: projected.slots.length,
      });
      if (!includeResults) continue;
      const release = archive
        ? await archivedPractice(slug)
        : await publishedLivePractice(slug, projected.slots);
      if (release) snapshot.releases.push(release);
    }
    return { snapshot, coverage };
  });
}

export async function chatTechnicalAnalysis(
  intent: Intent,
  selected: Edition,
  question: string,
  previous: string,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  if (intent.kind === "beatmap" ? !intent.bid || !intent.mod : !intent.uid)
    return { status: "needs-input", intent };
  if (remoteMode() || !process.env.DATABASE_URL)
    return { status: "unavailable" };

  const { snapshot, coverage } = await publishedCorpus(
    selected,
    question,
    previous,
    intent.kind === "player",
    signal,
  );
  signal?.throwIfAborted();
  if (!coverage.seasons.length) return { status: "unavailable", coverage };
  if (intent.kind === "beatmap") {
    const { bid, mod } = intent;
    if (!bid || !mod) return { status: "needs-input", intent };
    const maps = latestVersions(snapshot.pools.slots, mod);
    const seed = maps.find((row) => row.bid === bid);
    const hasSkills = (row: typeof seed) =>
      row &&
      profiles.skills.every((feature) => row.values[feature] !== undefined);
    // Prefer the skill profile where it can still return a full Top 10.
    const profile =
      hasSkills(seed) && maps.filter(hasSkills).length >= 11
        ? "skills"
        : "base";
    const comparable = maps.filter(
      (row) =>
        row.bid !== bid &&
        profiles[profile].every((feature) => row.values[feature] !== undefined),
    );
    for (const season of coverage.seasons)
      season.comparableMaps = comparable.filter((row) =>
        row.sources.some((source) => source.edition === season.slug),
      ).length;
    if (
      !seed ||
      !profiles.base.every((feature) => seed.values[feature] !== undefined)
    )
      return { status: "map-missing", bid, mod, coverage };
    const report = await compareBeatmaps(getPool(), snapshot.pools, {
      bid,
      mod,
      profile,
      repeat: 1,
    });
    return { status: "maps", report, coverage };
  }
  if (!intent.uid) return { status: "needs-input", intent };
  const report = await playerPractice(getPool(), snapshot, intent.uid, false);
  return { status: "player", report, coverage };
}
