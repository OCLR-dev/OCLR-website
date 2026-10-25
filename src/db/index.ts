import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
type Database = ReturnType<typeof drizzle>;
const readScope = new AsyncLocalStorage<Database>();
const globalDb = globalThis as unknown as { oclrPool?: Pool };
export function getPool() {
  if (process.env.OCLR_DATA_SOURCE === "remote") throw new Error("Local database access is disabled in remote development.");
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
  if (!globalDb.oclrPool) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    pool.on("error", () => {
      console.error(
        "Idle database connection closed; subsequent requests will reconnect.",
      );
    });
    globalDb.oclrPool = pool;
  }
  return globalDb.oclrPool;
}
export function db() {
  return readScope.getStore() ?? drizzle(getPool());
}

/** Reuse domain services on one read-only snapshot. Call nested services serially:
 * Drizzle nested transactions use savepoints on this same connection. */
export async function readOnlyData<T>(read: () => Promise<T>) {
  if (readScope.getStore()) return read();
  return db().transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
      return readScope.run(tx as unknown as Database, read);
    },
    { accessMode: "read only", isolationLevel: "repeatable read" },
  );
}

export async function closeDb() {
  if (globalDb.oclrPool) {
    await globalDb.oclrPool.end();
    delete globalDb.oclrPool;
  }
}
