import { closeDb } from "../src/db";
import { refreshEtxRatings } from "../src/lib/etx-rating-worker";

try {
  if (process.argv.slice(2).join(" ") !== "--apply") {
    console.error("Use --apply to refresh the S11 ETX rating cache.");
    process.exitCode = 1;
  } else {
    const result = await refreshEtxRatings();
    console.log(JSON.stringify(result));
    if ("failed" in result && result.failed) process.exitCode = 1;
  }
} catch {
  console.error(
    "S11 ETX refresh failed. Check the runtime database and migration.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
