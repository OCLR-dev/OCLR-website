import { resolve } from "node:path";
import { isMainThread } from "node:worker_threads";
import { startRatingScheduler } from "./rating-scheduler";

// Node preloads can be inherited by child workers. Only the serving process
// started by production.sh owns the schedule.
if (
  isMainThread &&
  process.argv[1] === resolve("node_modules/next/dist/bin/next") &&
  process.argv[2] === "start"
)
  startRatingScheduler();
