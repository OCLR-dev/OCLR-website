import { closeDb } from "../src/db";
import { refreshBeatmapDifficulties } from "../src/lib/difficulty-worker";
import { HttpError } from "../src/lib/http";
import {
  assertArchiveOperatorEnvironment,
  archiveOperatorDiagnostic,
} from "./archive-operator-diagnostics";

let phase: "arguments" | "environment" | "preview" | "apply" = "arguments";
try {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    (args[0] && !["--dry-run", "--apply"].includes(args[0]))
  )
    throw new Error("Invalid arguments.");
  const apply = args[0] === "--apply";
  phase = "environment";
  assertArchiveOperatorEnvironment();
  phase = apply ? "apply" : "preview";
  const result = await refreshBeatmapDifficulties(apply);
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
} catch (error) {
  if (phase === "arguments") console.error("Use --dry-run or --apply.");
  else if (error instanceof HttpError && error.status === 503)
    console.error(
      "Difficulty synchronization needs the approved osu! API configuration.",
    );
  else {
    const { code } = archiveOperatorDiagnostic(error, { phase });
    console.error(
      `Difficulty synchronization failed [${code}] during ${phase}.`,
    );
  }
  process.exitCode = 1;
} finally {
  await closeDb();
}
