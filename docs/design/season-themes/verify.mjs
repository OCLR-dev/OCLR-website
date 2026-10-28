// Dispatch to the actual application capture; static samples are historical evidence.
import { execFileSync } from "node:child_process";
const seasons = process.argv.slice(2);
if (
  !seasons.length ||
  seasons.some((season) => !["s7", "s8", "s9", "s10"].includes(season))
)
  throw new Error(
    "Choose s7, s8, s9 or s10; requires the season's explicit isolated test DB and loopback preview described in DESIGN.md.",
  );
for (const season of seasons)
  execFileSync(
    process.execPath,
    ["--import", "tsx", `docs/design/season-themes/${season}/capture.mjs`],
    { stdio: "inherit" },
  );
