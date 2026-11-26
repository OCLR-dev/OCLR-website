/** Run only by the separately installed operator, under the updater's flock. */
import { Client } from "pg";
import { operatorHealthTarget } from "./health";
import { request as healthRequest } from "node:http";
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  appendFileSync,
  statfsSync,
  readdirSync,
  lstatSync,
  openSync,
  readSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { seal, open, MAX_BYTES } from "./package";
const root = process.env.OCLR_OPERATOR_DATA!;
const id = process.argv[2];
if (!root?.startsWith("/") || !/^[a-f0-9-]{36}$/.test(id))
  throw Error("Invalid configuration");
let phase = "configuration";
const path = join(root, id + ".json");
const job = JSON.parse(readFileSync(path, "utf8"));
const key = readFileSync(process.env.OCLR_OPERATOR_KEY!);
const url = new URL(process.env.OCLR_OPERATOR_DATABASE_URL!);
const database = decodeURIComponent(url.pathname.slice(1));
const release = process.env.OCLR_OPERATOR_RELEASE_FILE
  ? readFileSync(process.env.OCLR_OPERATOR_RELEASE_FILE, "utf8").trim()
  : process.env.OCLR_OPERATOR_RELEASE!;
const runtimeRole = process.env.OCLR_OPERATOR_RUNTIME_ROLE!;
const service = process.env.OCLR_SERVICE || "oclr.service";
if (
  !/^[a-z][a-z0-9_]{0,39}$/.test(database) ||
  !/^[a-z][a-z0-9_]{0,39}$/.test(runtimeRole) ||
  !/^[\w-]+\.service$/.test(service) ||
  !/^[a-f0-9]{40}$/.test(release) ||
  key.length !== 32 ||
  !/^[1-9][0-9]*(,[1-9][0-9]*)*$/.test(process.env.ADMIN_OSU_IDS || "") ||
  !["disable", "verify-full"].includes(url.searchParams.get("sslmode") || "")
)
  throw Error("Invalid configuration");
const q = (name: string) => '"' + name.replaceAll('"', '""') + '"';
function save(state: string, extra = {}) {
  Object.assign(job, { state, ...extra, updatedAt: new Date().toISOString() });
  writeFileSync(path + ".tmp", JSON.stringify(job), { mode: 0o600 });
  renameSync(path + ".tmp", path);
  appendFileSync(
    join(root, "audit.jsonl"),
    JSON.stringify({
      id,
      actor: job.actor,
      action: job.action,
      phase,
      state,
      at: job.updatedAt,
    }) + "\n",
    { mode: 0o600, flush: true },
  );
}
function tool(command: string, args: string[], target = database) {
  const result = spawnSync(command, args, {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: target,
      PGSSLMODE: url.searchParams.get("sslmode")!,
      PGSSLROOTCERT: url.searchParams.get("sslrootcert") || undefined,
    },
    timeout: 300000,
    maxBuffer: command === "pg_dump" ? MAX_BYTES : MAX_BYTES + 16384,
  });
  if (
    command === "pg_dump" &&
    (result.error as NodeJS.ErrnoException)?.code === "ENOBUFS"
  ) {
    phase = "archive-size";
    throw Error("Dump exceeds package limit");
  }
  if (result.status !== 0 || result.error)
    throw Error("Operator command failed");
  return result.stdout;
}
async function connection(name = database) {
  const copy = new URL(url);
  copy.pathname = "/" + name;
  const c = new Client({
    connectionString: copy.toString(),
    connectionTimeoutMillis: 10000,
    statement_timeout: 300000,
  });
  await c.connect();
  return c;
}
async function vectorExtension(c: Client) {
  const { rows } = await c.query<{ version: string; schema: string }>(
    `SELECT e.extversion AS version, n.nspname AS schema
     FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname = 'vector'`,
  );
  return rows[0];
}
async function restoreVectorTemplate(current: Client) {
  const source = await vectorExtension(current);
  if (!source) return null;

  const name = process.env.OCLR_OPERATOR_RESTORE_TEMPLATE;
  if (
    !name ||
    !/^[a-z][a-z0-9_]{0,39}$/.test(name) ||
    [database, "postgres", "template0", "template1"].includes(name)
  )
    throw Error("Configure a dedicated pgvector restore template");

  const template = await connection(name);
  try {
    const extension = await vectorExtension(template);
    const {
      rows: [state],
    } = await template.query<{
      owned: boolean;
      empty: boolean;
    }>(`
      SELECT pg_get_userbyid(datdba) = current_user AS owned,
        NOT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
        ) AND NOT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname NOT IN ('plpgsql', 'vector')
        ) AS empty
      FROM pg_database WHERE datname = current_database()
    `);
    if (
      !state?.owned ||
      !state.empty ||
      extension?.version !== source.version ||
      extension?.schema !== source.schema
    )
      throw Error("The pgvector restore template is incompatible");
  } finally {
    await template.end();
  }
  return name;
}
async function inventory(c: Client) {
  const tables = (
    await c.query(
      "SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema IN ('public','drizzle') ORDER BY table_schema,table_name",
    )
  ).rows;
  const counts: Record<string, string> = {};
  for (const t of tables)
    counts[t.table_schema + "." + t.table_name] = (
      await c.query(
        `SELECT count(*)::text n FROM ${q(t.table_schema)}.${q(t.table_name)}`,
      )
    ).rows[0].n;
  const ledger = (
    await c.query(
      "SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id",
    )
  ).rows;
  return { counts, ledger };
}
function media() {
  const directory = process.env.OCLR_MEDIA_DIR;
  if (!directory) throw Error("Configure the matching durable media directory");
  const helper = process.env.OCLR_OPERATOR_MEDIA_HELPER;
  if (helper) {
    if (!helper.startsWith("/")) throw Error("Invalid media helper");
    const fingerprint = tool("sudo", [
      "-n",
      "-u",
      "oclr",
      "/usr/bin/node",
      helper,
      directory,
    ])
      .toString()
      .trim();
    if (!/^[a-f0-9]{64}$/.test(fingerprint))
      throw Error("Invalid media fingerprint");
    return fingerprint;
  }
  const hash = createHash("sha256");
  function walk(dir: string, prefix = "") {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name),
        s = lstatSync(p),
        relative = prefix + name;
      if (s.isSymbolicLink()) throw Error("Unsafe media entry");
      if (s.isDirectory()) walk(p, relative + "/");
      else if (s.isFile()) {
        hash.update(relative + "\0");
        const fileHash = createHash("sha256"),
          fd = openSync(p, "r"),
          buffer = Buffer.alloc(65536);
        try {
          let read;
          while ((read = readSync(fd, buffer, 0, buffer.length, null)) > 0)
            fileHash.update(buffer.subarray(0, read));
        } finally {
          closeSync(fd);
        }
        hash.update(fileHash.digest());
      } else throw Error("Unsafe media entry");
    }
  }
  if (lstatSync(directory).isSymbolicLink()) throw Error("Unsafe media root");
  walk(directory);
  return hash.digest("hex");
}
let stopped = false,
  switched = false;
let vectorTemplate: string | null = null;
const candidate = database + "_r_" + id.slice(0, 8),
  previous = database + "_p_" + id.slice(0, 8);
try {
  save("running");
  const free = statfsSync(root);
  if (free.bavail * free.bsize < MAX_BYTES * 4)
    throw Error("Insufficient disk space");
  const health = operatorHealthTarget({
    healthUrl: process.env.OCLR_OPERATOR_HEALTH_URL,
    bindHost: process.env.OCLR_BIND_HOST,
    port: process.env.PORT,
    appUrl: process.env.APP_URL,
  });
  phase = "authorization";
  const current = await connection();
  try {
    const serverMajor = Math.floor(
      Number(
        (await current.query("SHOW server_version_num")).rows[0]
          .server_version_num,
      ) / 10000,
    );
    if (job.action === "import" || job.action === "restore") {
      const name = job.action === "import" ? id : job.source;
      const metadata = open(
        readFileSync(join(root, name + ".upload")),
        key,
      ).manifest;
      if (metadata.postgres !== serverMajor)
        throw Error("Incompatible PostgreSQL version");
    }
    const authorized =
      (process.env.ADMIN_OSU_IDS || "")
        .split(",")
        .includes(String(job.actor)) ||
      (
        await current.query(
          "SELECT 1 FROM staff_roles WHERE user_id=$1 AND role='admin' AND edition_slug IS NULL AND revoked_at IS NULL",
          [job.actor],
        )
      ).rowCount;
    if (!authorized) throw Error("Permission revoked");
    // Validate the ledger's exact read permissions before any service control.
    // Owning the application database does not imply owning an older ledger.
    phase = "database-preflight";
    await current.query(
      "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations LIMIT 0",
    );
    if (job.action === "restore") {
      phase = "restore-template";
      vectorTemplate = await restoreVectorTemplate(current);
    }
  } finally {
    await current.end();
  }
  if (job.action === "import") {
    phase = "validation";
    const { manifest, dump: importedDump } = open(
      readFileSync(join(root, id + ".upload")),
      key,
    );
    const validationPath = join(root, id + ".restore");
    writeFileSync(validationPath, importedDump, { mode: 0o600 });
    tool("pg_restore", ["--file=/dev/null", validationPath]);
    if (manifest.release !== release || !manifest.mediaHash || !manifest.counts)
      throw Error("Incompatible release");
    const c = await connection();
    try {
      const inv = await inventory(c);
      if (
        manifest.schema !==
        createHash("sha256").update(JSON.stringify(inv.ledger)).digest("hex")
      )
        throw Error("Incompatible schema");
    } finally {
      await c.end();
    }
    save("validated", {
      manifest,
      target: `${process.env.OCLR_ENVIRONMENT || "unconfigured"}/${database}`,
    });
  } else {
    phase = "stopping-service";
    stopped = true;
    tool("sudo", ["-n", "/usr/bin/systemctl", "stop", service]);
    phase = "inventory";
    const c = await connection();
    let inv;
    try {
      inv = await inventory(c);
    } finally {
      await c.end();
    }
    const schema = createHash("sha256")
      .update(JSON.stringify(inv.ledger))
      .digest("hex");
    phase = "backup";
    const fingerprint = media();
    // pg_dump writes a compressed custom archive to stdout. Bound the bytes
    // while they are produced, before creating a scratch file or package.
    const dump = tool("pg_dump", ["--format=custom", "--no-owner", "--no-acl"]);
    const dumpPath = join(root, id + ".dump");
    writeFileSync(dumpPath, dump, { mode: 0o600 });
    tool("pg_restore", ["--file=/dev/null", dumpPath]);
    const backup = seal(
      dump,
      {
        createdAt: new Date().toISOString(),
        source: process.env.OCLR_ENVIRONMENT || "unconfigured",
        release,
        schema,
        mediaHash: fingerprint,
        counts: inv.counts,
        postgres:
          (Number(
            tool("psql", ["-Atc", "SHOW server_version_num"]).toString().trim(),
          ) /
            10000) |
          0,
      },
      key,
    );
    writeFileSync(join(root, id + ".oclr"), backup, {
      mode: 0o600,
      flush: true,
    });
    writeFileSync(
      join(root, id + ".evidence"),
      JSON.stringify({ inv, media: fingerprint }),
      { mode: 0o600, flush: true },
    );
    if (job.action === "restore") {
      const source = JSON.parse(
        readFileSync(join(root, job.source + ".json"), "utf8"),
      );
      if (source.state !== "validated") throw Error("Upload is not validated");
      const { manifest, dump: restored } = open(
        readFileSync(join(root, job.source + ".upload")),
        key,
      );
      if (manifest.release !== release || manifest.schema !== schema)
        throw Error("Incompatible backup");
      if (manifest.mediaHash !== fingerprint)
        throw Error("Matching media must be attested by the operator");
      phase = "isolated-restore";
      const admin = await connection("postgres");
      try {
        await admin.query(
          `CREATE DATABASE ${q(candidate)} TEMPLATE ${q(vectorTemplate ?? "template0")}`,
        );
        const input = join(root, id + ".restore");
        writeFileSync(input, restored, { mode: 0o600 });
        tool(
          "pg_restore",
          [
            "--exit-on-error",
            "--single-transaction",
            "--no-owner",
            "--no-acl",
            // The DBA owns the extension copied from the template.
            ...(vectorTemplate ? ["--no-comments"] : []),
            "--dbname",
            candidate,
            input,
          ],
          candidate,
        );
        const target = await connection(candidate);
        try {
          const targetInv = await inventory(target);
          if (
            JSON.stringify(targetInv.counts) !== JSON.stringify(manifest.counts)
          )
            throw Error("Restored row counts mismatch");
          if (
            createHash("sha256")
              .update(JSON.stringify(targetInv.ledger))
              .digest("hex") !== schema
          )
            throw Error("Restored schema mismatch");
          if (
            (
              await target.query(
                "SELECT 1 FROM pg_constraint WHERE NOT convalidated LIMIT 1",
              )
            ).rowCount
          )
            throw Error("Unvalidated restored constraint");
          await target.query("BEGIN");
          await target.query(
            "DELETE FROM desktop_tokens; DELETE FROM desktop_sessions; DELETE FROM desktop_authorizations; DELETE FROM streaming_api_tokens; DELETE FROM developer_api_tokens; DELETE FROM sessions; DELETE FROM oauth_states; UPDATE staff_roles SET revoked_at=now() WHERE revoked_at IS NULL",
          );
          await target.query(
            `GRANT USAGE ON SCHEMA public TO ${q(runtimeRole)}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${q(runtimeRole)}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${q(runtimeRole)}`,
          );
          await target.query("COMMIT");
        } finally {
          await target.end();
        }
        await admin.query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
          [database],
        );
        phase = "cutover";
        await admin.query("BEGIN");
        await admin.query(
          `ALTER DATABASE ${q(database)} RENAME TO ${q(previous)}`,
        );
        await admin.query(
          `ALTER DATABASE ${q(candidate)} RENAME TO ${q(database)}`,
        );
        await admin.query("COMMIT");
        switched = true;
      } finally {
        await admin.end();
      }
    }
    tool("sudo", ["-n", "/usr/bin/systemctl", "start", service]);
    stopped = false;
    phase = "health";
    let healthy = false;
    const { url: healthTarget, canonicalHost } = health;
    for (let attempt = 0; attempt < 30; attempt++) {
      healthy = await new Promise<boolean>((resolve) => {
        const request = healthRequest(
          healthTarget,
          { headers: { Host: canonicalHost } },
          (response) => {
            let body = "";
            response.on("data", (chunk) => {
              body += chunk.toString();
              if (body.length > 8192) {
                response.destroy();
                resolve(false);
              }
            });
            response.on("end", () => {
              try {
                resolve(
                  response.statusCode === 200 &&
                    JSON.parse(body).release === release,
                );
              } catch {
                resolve(false);
              }
            });
            response.on("error", () => resolve(false));
          },
        );
        request.setTimeout(2000, () => {
          request.destroy();
          resolve(false);
        });
        request.on("error", () => resolve(false));
        request.end();
      });
      if (healthy) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!healthy) throw Error("Health verification failed");
    save("completed", { manifest: open(backup, key).manifest });
  }
} catch {
  if (switched) {
    try {
      tool("sudo", ["-n", "/usr/bin/systemctl", "stop", service]);
    } catch {}
  }
  save("failed", {
    recovery: switched ? "operator-required" : "original-preserved",
  });
  if (stopped && !switched) {
    try {
      tool("sudo", ["-n", "/usr/bin/systemctl", "start", service]);
    } catch {
      /* Operator recovery required. */
    }
  }
  process.exitCode = 1;
} finally {
  for (const suffix of [".dump", ".restore"]) {
    try {
      unlinkSync(join(root, id + suffix));
    } catch {}
  }
}
