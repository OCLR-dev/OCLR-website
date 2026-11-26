import { describe, it, expect } from "vitest";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { assertTestDatabase } from "../database";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("Admin backup PostgreSQL round trip", () => {
  it("preserves business data, rejects corrupt imports and invalidates sessions and grants", async () => {
    assertTestDatabase(url);
    const isolatedName =
      "oclr_backup_test_" + randomUUID().replaceAll("-", "").slice(0, 12);
    const templateName = isolatedName + "_template";
    const operatorRole = isolatedName + "_operator";
    const runtimeRole = isolatedName + "_runtime";
    const adminUrl = new URL(url!);
    adminUrl.pathname = "/postgres";
    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(
      `CREATE ROLE "${operatorRole}" LOGIN NOSUPERUSER CREATEDB NOCREATEROLE PASSWORD 'synthetic_test_only'`,
    );
    await admin.query(`CREATE ROLE "${runtimeRole}" NOLOGIN`);
    for (const name of [isolatedName, templateName]) {
      await admin.query(
        `CREATE DATABASE "${name}" OWNER "${operatorRole}" TEMPLATE template0`,
      );
      const extensionUrl = new URL(url!);
      extensionUrl.pathname = "/" + name;
      const dba = new Client({ connectionString: extensionUrl.toString() });
      await dba.connect();
      try {
        await dba.query("CREATE EXTENSION vector WITH SCHEMA public");
      } finally {
        await dba.end();
      }
    }
    const isolatedUrl = new URL(url!);
    isolatedUrl.pathname = "/" + isolatedName;
    isolatedUrl.username = operatorRole;
    isolatedUrl.password = "synthetic_test_only";
    // The synthetic CI PostgreSQL service has no TLS configuration. The operator
    // intentionally requires an explicit mode; retain any caller-supplied mode.
    if (!isolatedUrl.searchParams.has("sslmode"))
      isolatedUrl.searchParams.set("sslmode", "disable");
    const databaseUrl = isolatedUrl.toString();
    const migrationClient = new Client({ connectionString: databaseUrl });
    await migrationClient.connect();
    await migrate(drizzle(migrationClient), { migrationsFolder: "drizzle" });
    await migrationClient.end();
    const root = mkdtempSync(join(tmpdir(), "oclr-backup-test-"));
    mkdirSync(join(root, "media"));
    mkdirSync(join(root, "bin"));
    writeFileSync(join(root, "key"), randomBytes(32));
    const serviceLog = join(root, "service.log");
    writeFileSync(serviceLog, "");
    writeFileSync(
      join(root, "bin/sudo"),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "${0%/*}/../service.log"\nexit 0\n',
      { mode: 0o700 },
    );
    const release = "a".repeat(40);
    writeFileSync(join(root, "release"), release + "\n");
    const health = createServer((req, res) => {
      if (req.headers.host !== "synthetic-operator.test") {
        res.statusCode = 400;
        res.end("bad canonical host");
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ release }));
    });
    await new Promise<void>((resolve) =>
      health.listen(0, "127.0.0.1", resolve),
    );
    const port = (health.address() as { port: number }).port;
    const env = {
      ...process.env,
      OCLR_OPERATOR_DATA: root,
      OCLR_OPERATOR_KEY: join(root, "key"),
      OCLR_OPERATOR_DATABASE_URL: databaseUrl,
      OCLR_OPERATOR_RESTORE_TEMPLATE: templateName,
      OCLR_OPERATOR_RELEASE: "b".repeat(40),
      OCLR_OPERATOR_RELEASE_FILE: join(root, "release"),
      OCLR_OPERATOR_RUNTIME_ROLE: runtimeRole,
      APP_URL: "https://synthetic-operator.test",
      OCLR_BIND_HOST: "127.0.0.1",
      PORT: String(port),
      OCLR_OPERATOR_HEALTH_URL: `http://127.0.0.1:${port}/api/health`,
      OCLR_MEDIA_DIR: join(root, "media"),
      ADMIN_OSU_IDS: "999001",
      PATH: join(root, "bin") + ":" + process.env.PATH,
    };
    async function run(
      action: string,
      source?: string,
      upload?: Buffer,
      operatorDatabaseUrl = databaseUrl,
    ) {
      const id = randomUUID();
      writeFileSync(
        join(root, id + ".json"),
        JSON.stringify({ id, action, source, actor: 999001, state: "queued" }),
      );
      if (upload) writeFileSync(join(root, id + ".upload"), upload);
      await new Promise<void>((resolve) => {
        const child = spawn(
          process.execPath,
          ["--import", "tsx", "operator/worker.ts", id],
          {
            env: { ...env, OCLR_OPERATOR_DATABASE_URL: operatorDatabaseUrl },
            stdio: "ignore",
          },
        );
        child.on("exit", () => resolve());
      });
      return JSON.parse(readFileSync(join(root, id + ".json"), "utf8"));
    }
    const c = new Client({ connectionString: databaseUrl });
    await c.connect();
    const deniedRole =
      "oclr_test_ledger_" + randomUUID().replaceAll("-", "").slice(0, 12);
    let roleCreated = false;
    try {
      expect(
        (
          await c.query(`
            SELECT rolsuper, rolcreatedb, rolcreaterole
            FROM pg_roles WHERE rolname = current_user
          `)
        ).rows[0],
      ).toEqual({ rolsuper: false, rolcreatedb: true, rolcreaterole: false });
      // A separately authenticated, authorized actor can still lack ledger reads.
      // Reject this before the first service-control command; never grant runtime rights.
      await admin.query(
        `CREATE ROLE "${deniedRole}" LOGIN PASSWORD 'synthetic_test_only'`,
      );
      roleCreated = true;
      await c.query(`GRANT USAGE ON SCHEMA drizzle TO "${deniedRole}"`);
      const deniedUrl = new URL(databaseUrl);
      deniedUrl.username = deniedRole;
      deniedUrl.password = "synthetic_test_only";
      const denied = await run(
        "backup",
        undefined,
        undefined,
        deniedUrl.toString(),
      );
      expect(denied.state).toBe("failed");
      expect(denied.recovery).toBe("original-preserved");
      const events = readFileSync(join(root, "audit.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(events.at(-1).phase).toBe("database-preflight");
      expect(readFileSync(serviceLog, "utf8")).toBe("");
      // The documented grant is sufficient for the exact columns the worker reads.
      await c.query(
        `GRANT SELECT ON TABLE drizzle.__drizzle_migrations TO "${deniedRole}"`,
      );
      const ledgerReader = new Client({
        connectionString: deniedUrl.toString(),
      });
      await ledgerReader.connect();
      try {
        await ledgerReader.query(
          "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations LIMIT 0",
        );
      } finally {
        await ledgerReader.end();
      }
      await c.query(
        "CREATE TABLE IF NOT EXISTS backup_synthetic (id integer primary key, value text not null)",
      );
      await c.query(
        "INSERT INTO backup_synthetic VALUES (1,'snapshot') ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      );
      await c.query(`
        INSERT INTO edition_state (slug) VALUES ('archive-test');
        INSERT INTO chat_source_vectors
          (edition_slug, digest, collection, title, url, content, model, keywords, embedding)
        VALUES ('archive-test', 'snapshot', 'mappools', 'Synthetic history',
          '/tournaments/archive-test/mappools', 'Fixture', 'fixture-model', ARRAY['fixture'],
          ARRAY[0.6,0.8]::double precision[]);
      `);
      await c.query(
        "INSERT INTO users(osu_id,username) VALUES(999001,'Synthetic backup Admin') ON CONFLICT DO NOTHING",
      );
      await c.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,999001,now()+interval '1 day') ON CONFLICT DO NOTHING",
        ["b".repeat(64)],
      );
      await c.query(
        "INSERT INTO staff_roles(user_id,role,granted_by) VALUES(999001,'admin',999001) ON CONFLICT DO NOTHING",
      );
      // The physical database includes heap and index pages that do not
      // travel in a custom archive. Keep a large, compressible table live.
      await c.query("CREATE TABLE backup_padding (value text NOT NULL)");
      await c.query("ALTER TABLE backup_padding ALTER value SET STORAGE PLAIN");
      await c.query(
        "INSERT INTO backup_padding SELECT repeat('x', 2048) FROM generate_series(1, 36000)",
      );
      expect(
        (
          await c.query(
            "SELECT pg_database_size(current_database()) > 67108864 AS large",
          )
        ).rows[0].large,
      ).toBe(true);
      const backup = await run("backup");
      expect(backup.state).toBe("completed");
      const bytes = readFileSync(join(root, backup.id + ".oclr"));
      expect(bytes.length).toBeLessThan(64 * 1024 * 1024);
      // This payload exceeds the limit even after pg_dump compresses it.
      await c.query("CREATE TABLE backup_noise (value bytea NOT NULL)");
      await c.query(
        "INSERT INTO backup_noise SELECT $1::bytea FROM generate_series(1, 65)",
        [randomBytes(1024 * 1024)],
      );
      writeFileSync(serviceLog, "");
      const oversized = await run("backup");
      expect(oversized.state).toBe("failed");
      expect(oversized.recovery).toBe("original-preserved");
      const failure = readFileSync(join(root, "audit.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .find((event) => event.id === oversized.id && event.state === "failed");
      expect(failure.phase).toBe("archive-size");
      expect(readFileSync(serviceLog, "utf8").trim().split("\n")).toEqual([
        "-n /usr/bin/systemctl stop oclr.service",
        "-n /usr/bin/systemctl start oclr.service",
      ]);
      for (const suffix of [".oclr", ".dump"]) {
        expect(existsSync(join(root, oversized.id + suffix))).toBe(false);
      }
      await c.query("DROP TABLE backup_noise");
      const bad = Buffer.from(bytes);
      bad[25] ^= 1;
      expect((await run("import", undefined, bad)).state).toBe("failed");
      const imported = await run("import", undefined, bytes);
      expect(imported.state).toBe("validated");
      writeFileSync(serviceLog, "");
      env.OCLR_OPERATOR_RESTORE_TEMPLATE = "";
      const missingTemplate = await run("restore", imported.id);
      expect(missingTemplate).toMatchObject({
        state: "failed",
        recovery: "original-preserved",
      });
      expect(readFileSync(serviceLog, "utf8")).toBe("");
      const templateUrl = new URL(databaseUrl);
      templateUrl.pathname = "/" + templateName;
      const template = new Client({ connectionString: templateUrl.toString() });
      await template.connect();
      try {
        await template.query("CREATE TABLE stray_fixture (value text)");
        env.OCLR_OPERATOR_RESTORE_TEMPLATE = templateName;
        const incompatibleTemplate = await run("restore", imported.id);
        expect(incompatibleTemplate).toMatchObject({
          state: "failed",
          recovery: "original-preserved",
        });
        expect(readFileSync(serviceLog, "utf8")).toBe("");
        const lastEvent = readFileSync(join(root, "audit.jsonl"), "utf8")
          .trim()
          .split("\n")
          .at(-1)!;
        expect(JSON.parse(lastEvent).phase).toBe("restore-template");
        await template.query("DROP TABLE stray_fixture");
      } finally {
        await template.end();
      }
      await c.query("UPDATE backup_synthetic SET value='newer'");
      await c.end();
      writeFileSync(
        join(root, "media", "mismatch.bin"),
        "synthetic newer media",
      );
      expect((await run("restore", imported.id)).state).toBe("failed");
      const preserved = new Client({ connectionString: databaseUrl });
      await preserved.connect();
      expect(
        (await preserved.query("SELECT value FROM backup_synthetic")).rows[0]
          .value,
      ).toBe("newer");
      await preserved.end();
      unlinkSync(join(root, "media", "mismatch.bin"));
      const restored = await run("restore", imported.id);
      expect(restored.state).toBe("completed");
      const target = new Client({ connectionString: databaseUrl });
      await target.connect();
      try {
        expect(
          (await target.query("SELECT value FROM backup_synthetic")).rows[0]
            .value,
        ).toBe("snapshot");
        expect(
          (
            await target.query(`
              SELECT model, embedding, embedding_vector::text AS vector
              FROM chat_source_vectors WHERE edition_slug = 'archive-test'
            `)
          ).rows[0],
        ).toEqual({
          model: "fixture-model",
          embedding: [0.6, 0.8],
          vector: "[0.6,0.8]",
        });
        expect(
          (await target.query("SELECT count(*)::int n FROM sessions")).rows[0]
            .n,
        ).toBe(0);
        expect(
          (
            await target.query(
              "SELECT count(*)::int n FROM staff_roles WHERE revoked_at IS NULL",
            )
          ).rows[0].n,
        ).toBe(0);
      } finally {
        await target.query("DROP TABLE backup_synthetic");
        await target.end();
      }
    } finally {
      await c.end().catch(() => {});
      await new Promise<void>((resolve) => health.close(() => resolve()));
      rmSync(root, { recursive: true, force: true });
      const retained = (
        await admin.query(
          "SELECT datname FROM pg_database WHERE datname=$1 OR datname LIKE $2",
          [isolatedName, isolatedName + "\\_%"],
        )
      ).rows;
      for (const row of retained) {
        if (!row.datname.startsWith(isolatedName))
          throw Error("Unsafe cleanup");
        await admin.query('DROP DATABASE "' + row.datname + '" WITH (FORCE)');
      }
      if (roleCreated) await admin.query(`DROP ROLE "${deniedRole}"`);
      await admin.query(`DROP ROLE "${operatorRole}", "${runtimeRole}"`);
      await admin.end();
    }
  }, 120000);
});
