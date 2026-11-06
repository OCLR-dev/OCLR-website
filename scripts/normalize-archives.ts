import env from "@next/env";
import { closeDb, db } from "../src/db";
import {
  backfillArchiveRelations,
  verifyArchiveRelations,
  historicalArchiveSlugs,
} from "../src/lib/archive-relations";
import { HttpError } from "../src/lib/http";
import {
  assertArchiveOperatorEnvironment,
  archiveOperatorDiagnostic,
  type ArchiveOperatorPhase,
} from "./archive-operator-diagnostics";

env.loadEnvConfig(process.cwd());
let phase: ArchiveOperatorPhase = "arguments",
  activeSlug: string | undefined;
try {
  const args = process.argv.slice(2),
    allowed = ["--dry-run", "--apply", "--rebuild", "--verify"];
  if (
    args.some((a) => a.startsWith("--") && !allowed.includes(a)) ||
    (args.includes("--apply") && args.includes("--dry-run")) ||
    (args.includes("--rebuild") && !args.includes("--apply"))
  )
    throw new HttpError(
      400,
      "Use [slugs...] [--dry-run | --apply [--rebuild]] [--verify].",
    );
  const selected = args.filter((a) => !a.startsWith("--"));
  if (selected.some((s) => !/^[a-z0-9][a-z0-9-]{0,79}$/.test(s)))
    throw new HttpError(400, "Invalid edition slug.");
  phase = "environment";
  assertArchiveOperatorEnvironment();
  phase = "discover";
  const slugs = selected.length
    ? [...new Set(selected)]
    : await historicalArchiveSlugs(db());
  const totals = {
    seasons: slugs.length,
    documents: 0,
    stale: 0,
    created: 0,
    archiveReadReady: 0,
  };
  for (const slug of slugs) {
    activeSlug = slug;
    phase = args.includes("--apply") ? "apply" : "preview";
    const result = await backfillArchiveRelations(
      slug,
      args.includes("--apply"),
      args.includes("--rebuild"),
    );
    if (args.includes("--verify")) phase = "verify";
    const verified = args.includes("--verify")
      ? await db().transaction((tx) => verifyArchiveRelations(tx, slug), {
          isolationLevel: "repeatable read",
          accessMode: "read only",
        })
      : undefined;
    totals.documents += result.documents;
    totals.stale += result.stale;
    totals.created += result.created;
    totals.archiveReadReady += Number(result.archiveReadReady);
    console.log(
      JSON.stringify({ ...result, ...(verified ? { verified } : {}) }),
    );
  }
  console.log(JSON.stringify({ total: totals }));
} catch (error) {
  console.error(
    JSON.stringify(
      archiveOperatorDiagnostic(error, { phase, slug: activeSlug }),
    ),
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
