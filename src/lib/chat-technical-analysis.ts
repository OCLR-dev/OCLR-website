import { db, getPool, readOnlyData } from "@/db";
import { publicArchiveStatistics } from "./archive-statistics-reads";
import { projectPublicPools, type Snapshot } from "./beatmap-similarity-model";
import {
  compareBeatmaps,
  latestVersions,
  profiles,
} from "./beatmap-similarity-ranking";
import type { chatAnalysisIntent } from "./chat-analysis-intent";
import { remoteMode } from "./data-source";
import { HttpError } from "./http-error";
import { playerPractice } from "./player-practice";
import {
  practiceEditions,
  practiceSnapshotSchema,
  releaseSchema,
} from "./player-practice-data";
import { attachArchiveDifficulties } from "./saved-difficulty";
import { readTournament } from "./tournament-reads";

type Intent = NonNullable<ReturnType<typeof chatAnalysisIntent>>;
type MapReport = Awaited<ReturnType<typeof compareBeatmaps>>;
type PlayerReport = Awaited<ReturnType<typeof playerPractice>>;
export type AnalysisResult =
  | { status: "needs-input"; intent: Intent }
  | { status: "unavailable" }
  | { status: "map-missing"; bid: number; mod: MapReport["input"]["mod"] }
  | { status: "maps"; report: MapReport }
  | { status: "player"; report: PlayerReport };

async function publishedCorpus(includeResults: boolean, signal?: AbortSignal) {
  return readOnlyData(async () => {
    const sources: Snapshot["sources"] = [];
    const slots: Snapshot["slots"] = [];
    const releases = [];
    for (const slug of practiceEditions) {
      signal?.throwIfAborted();
      const record = await readTournament(slug, db(), true);
      if (!record?.edition.published || !record.edition.archive) return;
      const archive = await attachArchiveDifficulties(record.edition.archive);
      const projected = projectPublicPools(slug, {
        data: { ...record, edition: { ...record.edition, archive } },
      });
      sources.push(projected.source);
      slots.push(...projected.slots);
      if (includeResults) {
        const stats = await publicArchiveStatistics(slug);
        if (!stats.publishedAt || !stats.poolFixtures) return;
        releases.push(releaseSchema.parse(stats));
      }
    }
    const capturedAt = new Date().toISOString();
    const pools: Snapshot = { version: 1, capturedAt, sources, slots };
    return { capturedAt, pools, releases };
  });
}

export async function chatTechnicalAnalysis(
  intent: Intent,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  if (intent.kind === "beatmap" ? !intent.bid || !intent.mod : !intent.uid)
    return { status: "needs-input", intent };
  if (remoteMode() || !process.env.DATABASE_URL)
    return { status: "unavailable" };

  const corpus = await publishedCorpus(intent.kind === "player", signal).catch(
    (error) => {
      if (error instanceof HttpError && error.status === 404) return undefined;
      throw error;
    },
  );
  signal?.throwIfAborted();
  if (!corpus) return { status: "unavailable" };
  if (intent.kind === "beatmap") {
    const { bid, mod } = intent;
    if (!bid || !mod) return { status: "needs-input", intent };
    const maps = latestVersions(corpus.pools.slots, mod);
    const seed = maps.find((row) => row.bid === bid);
    if (
      !seed ||
      !profiles.base.every((feature) => seed.values[feature] !== undefined)
    )
      return { status: "map-missing", bid, mod };
    const hasSkills = (row: typeof seed) =>
      row &&
      profiles.skills.every((feature) => row.values[feature] !== undefined);
    // Prefer the skill profile where it can still return a full Top 10.
    const profile =
      hasSkills(seed) && maps.filter(hasSkills).length >= 11
        ? "skills"
        : "base";
    const report = await compareBeatmaps(getPool(), corpus.pools, {
      bid,
      mod,
      profile,
      repeat: 1,
    });
    return { status: "maps", report };
  }
  if (!intent.uid) return { status: "needs-input", intent };
  const snapshot = practiceSnapshotSchema.parse({ version: 1, ...corpus });
  return {
    status: "player",
    report: await playerPractice(getPool(), snapshot, intent.uid, false),
  };
}
