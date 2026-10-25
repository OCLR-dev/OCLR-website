/** Preload only in the isolated remote frontend browser server. */
import pg from "pg";
import { appendFileSync } from "node:fs";
const blocked = () => {
  if (process.env.OCLR_TEST_NO_DB_ATTEMPTS)
    appendFileSync(
      process.env.OCLR_TEST_NO_DB_ATTEMPTS,
      "Local PostgreSQL connection attempted\n",
    );
  throw new Error("Remote frontend must never connect to local PostgreSQL");
};
pg.Pool.prototype.connect = blocked;
pg.Client.prototype.connect = blocked;
