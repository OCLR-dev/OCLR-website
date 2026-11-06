import { HttpError } from "../src/lib/http";
import env from "@next/env";
import { closeDb, db } from "../src/db";
import {
  backfillArchiveReads,
  verifyArchiveReads,
} from "../src/lib/archive-read";
import { historicalArchiveSlugs } from "../src/lib/archive-relations";
import {
  assertArchiveOperatorEnvironment,
  archiveOperatorDiagnostic,
  type ArchiveOperatorPhase,
} from "./archive-operator-diagnostics";

env.loadEnvConfig(process.cwd());
let phase: ArchiveOperatorPhase = "arguments",
  activeSlug: string | undefined;
try {
  const args = process.argv.slice(2);
  if (
    args.some(
      (a) =>
        a.startsWith("--") &&
        a !== "--apply" &&
        a !== "--dry-run" &&
        a !== "--rebuild" &&
        a !== "--verify",
      // --verify audits the native summary/facts against preserved JSONB.
    ) ||
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
  const slugs = selected.length ? selected : await historicalArchiveSlugs(db());
  for (const slug of slugs) {
    activeSlug = slug;
    phase = args.includes("--apply") ? "apply" : "preview";
    const result = await backfillArchiveReads(
      slug,
      args.includes("--apply"),
      args.includes("--rebuild"),
    );
    let verified;
    if (args.includes("--verify")) {
      phase = "verify";
      verified = await db().transaction((tx) => verifyArchiveReads(tx, slug), {
        accessMode: "read only",
        isolationLevel: "repeatable read",
      });
    }
    console.log(
      JSON.stringify({ ...result, ...(verified ? { verified } : {}) }),
    );
  }
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
