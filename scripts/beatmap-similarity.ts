import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { z } from "zod";
import {
  bidSchema,
  editionSchema,
  modSchema,
  readPublicSnapshot,
  snapshotSchema,
} from "./beatmap-similarity-data";
import { compareBeatmaps, describePools } from "./beatmap-similarity-ranking";

const usage = `
npm run beatmap:similarity -- snapshot [--editions s9,s10] [--osu-dir DIR]
npm run beatmap:similarity -- query --bid BID --mod MOD [--profile base|skills]
  [--editions s9,s10 | --snapshot FILE] [--osu-dir DIR]
  [--candidate-edition SLUG] [--pool EDITION:POOL_ID]
  [--min-stars N] [--max-stars N] [--repeat 1..100]
npm run beatmap:similarity -- distribution
  [--editions s9,s10 | --snapshot FILE] [--osu-dir DIR] [--pool EDITION:POOL_ID]

The query reads BEATMAP_SIMILARITY_DATABASE_URL for a PostgreSQL server with pgvector.
JSON is written to stdout. Archive snapshots can be replayed offline.
`;

const string = { type: "string" } as const;
const sourceOptions = { editions: string, "osu-dir": string, snapshot: string };
const poolKey = z.string().regex(/^[a-z0-9-]+:[a-z0-9_-]+$/i);

function numericFlag(value: string | undefined, option: string) {
  if (value === undefined) return;
  if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))
    throw new Error(option + " requires a non-negative number.");
  return Number(value);
}

async function loadSnapshot(options: {
  snapshot?: string;
  editions?: string;
  "osu-dir"?: string;
}) {
  if (options.snapshot !== undefined) {
    if (options.editions !== undefined || options["osu-dir"] !== undefined)
      throw new Error(
        "--snapshot already contains its editions and file features.",
      );
    return snapshotSchema.parse(
      JSON.parse(await readFile(options.snapshot, "utf8")),
    );
  }
  const editions = z
    .array(editionSchema)
    .min(2)
    .max(12)
    .parse((options.editions ?? "s9,s10").split(","));
  if (editions.length !== new Set(editions).size)
    throw new Error("Provide distinct editions.");
  return readPublicSnapshot(editions, options["osu-dir"]);
}

async function main([command, ...args]: string[]) {
  if (!command || command === "--help" || args.includes("--help")) {
    console.log(usage.trim());
    return;
  }
  if (command === "snapshot") {
    const { values } = parseArgs({
      args,
      options: { editions: string, "osu-dir": string },
    });
    console.log(JSON.stringify(await loadSnapshot(values), null, 2));
    return;
  }
  if (command === "distribution") {
    const { values } = parseArgs({
      args,
      options: { ...sourceOptions, pool: string },
    });
    const pool = poolKey.optional().parse(values.pool);
    console.log(
      JSON.stringify(describePools(await loadSnapshot(values), pool), null, 2),
    );
    return;
  }
  if (command !== "query")
    throw new Error("Expected snapshot, query or distribution. Use --help.");
  const { values } = parseArgs({
    args,
    options: {
      ...sourceOptions,
      bid: string,
      mod: string,
      profile: string,
      "candidate-edition": string,
      pool: string,
      "min-stars": string,
      "max-stars": string,
      repeat: string,
    },
  });
  const bid = bidSchema.parse(numericFlag(values.bid, "--bid"));
  const mod = modSchema.parse(values.mod?.toUpperCase());
  const profile = z.enum(["base", "skills"]).parse(values.profile ?? "base");
  const candidateEdition = editionSchema
    .optional()
    .parse(values["candidate-edition"]);
  const pool = poolKey.optional().parse(values.pool);
  const minStars = numericFlag(values["min-stars"], "--min-stars");
  const maxStars = numericFlag(values["max-stars"], "--max-stars");
  if (minStars !== undefined && maxStars !== undefined && minStars > maxStars)
    throw new Error("--min-stars must be at most --max-stars.");
  const repeat = z
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(numericFlag(values.repeat, "--repeat") ?? 1);
  const connectionString = process.env.BEATMAP_SIMILARITY_DATABASE_URL;
  if (!connectionString)
    throw new Error(
      "Set BEATMAP_SIMILARITY_DATABASE_URL to a PostgreSQL database with pgvector.",
    );
  const snapshot = await loadSnapshot(values);
  const db = new Client({
    connectionString,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
  try {
    try {
      await db.connect();
    } catch {
      throw new Error("Cannot connect to BEATMAP_SIMILARITY_DATABASE_URL.");
    }
    const report = await compareBeatmaps(db, snapshot, {
      bid,
      mod,
      profile,
      candidateEdition,
      pool,
      minStars,
      maxStars,
      repeat,
    });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await db.end();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Beatmap similarity command failed.",
  );
  process.exitCode = 1;
});
