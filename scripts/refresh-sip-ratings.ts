import { closeDb } from "../src/db";
import { refreshSipRatings } from "../src/lib/sip-rating-worker";
import { assertArchiveOperatorEnvironment } from "./archive-operator-diagnostics";

const args = process.argv.slice(2);
try {
  if (
    args.length > 1 ||
    (args[0] && !["--dry-run", "--apply"].includes(args[0]))
  ) {
    console.error("Use --dry-run or --apply.");
    process.exitCode = 1;
  } else if (args[0] === "--apply" && !process.env.SIP_API_TOKEN?.trim()) {
    console.error("Set SIP_API_TOKEN in the approved worker environment.");
    process.exitCode = 1;
  } else {
    assertArchiveOperatorEnvironment();
    const result = await refreshSipRatings(args[0] === "--apply");
    console.log(JSON.stringify(result));
    if (result.failed || (result.stopped && result.stopped !== "busy"))
      process.exitCode = 1;
  }
} catch {
  // Driver and fetch errors may contain connection or request details.
  console.error(
    "SIP refresh failed. Check the worker environment and migration.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
