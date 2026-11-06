import { vi } from "vitest";
import type { PoolClient, QueryResult } from "pg";
import { getPool } from "../src/db";
type Spy = {
  mock: { calls: unknown[][]; results: { type: string; value: unknown }[] };
  mockRestore: () => void;
};
export async function observe<T>(run: () => Promise<T>) {
  const spies: Spy[] = [],
    seen = new Set<PoolClient>(),
    pool = getPool();
  const acquired = (client: PoolClient) => {
    if (!seen.has(client)) {
      seen.add(client);
      spies.push(vi.spyOn(client, "query"));
    }
  };
  pool.on("acquire", acquired);
  // Pool.query uses the callback form of client.query internally. Its promise
  // owns the result; checked-out transaction clients return their own promise.
  const poolQueries = vi.spyOn(pool, "query");
  try {
    const value = await run();
    const statements = spies.flatMap((s) =>
      s.mock.calls.map(([q]) =>
        typeof q === "string"
          ? q
          : typeof q === "object" && q && "text" in q
            ? String(q.text)
            : "",
      ),
    );
    let bytes = 0,
      sourceArchives = 0,
      legacyPayloads = 0;
    for (const s of [...spies, poolQueries])
      for (const r of s.mock.results)
        if (r.type === "return") {
          const result = await r.value;
          if (result && typeof result === "object" && "rows" in result) {
            const response = result as QueryResult;
            bytes += Buffer.byteLength(JSON.stringify(response.rows));
            for (const field of response.fields ?? [])
              if (
                [114, 3802].includes(field.dataTypeID) &&
                ["payload", "public_statistics", "header"].includes(field.name)
              )
                legacyPayloads += response.rows.length;
            const configuration =
              response.fields?.findIndex(
                (field: { name: string }) => field.name === "configuration",
              ) ?? -1;
            if (configuration >= 0)
              for (const row of response.rows) {
                const raw = Array.isArray(row)
                  ? row[configuration]
                  : row.configuration;
                const value = typeof raw === "string" ? JSON.parse(raw) : raw;
                if (value?.archive) sourceArchives++;
              }
          }
        }
    return { value, statements, bytes, sourceArchives, legacyPayloads };
  } finally {
    pool.removeListener("acquire", acquired);
    poolQueries.mockRestore();
    for (const s of spies) s.mockRestore();
  }
}
// Detect projected JSONB values, not a boolean test of whether published is null.
export const sourceJson = (statements: string[]) =>
  statements.filter((s) => {
    if (!s.includes('from "historical_statistics"')) return false;
    const projection = s
      .slice(0, s.indexOf(" from "))
      .replace(/^select\s+/, "");
    return /(?:^|,\s*)(?:"historical_statistics"\.)?"(?:draft|published)"(?:\s*,|\s*$)/.test(
      projection,
    );
  });
