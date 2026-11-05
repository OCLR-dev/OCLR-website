/** Dedicated Unix-socket service. Install separately from the runtime checkout. */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdirSync,
  chmodSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  lstatSync,
  appendFileSync,
  statfsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { databaseIdentity } from "./identity";
import { MAX_BYTES } from "./package";
const root = process.env.OCLR_OPERATOR_DATA!,
  socket = process.env.OCLR_OPERATOR_SOCKET!,
  lock = process.env.OCLR_OPERATOR_LOCK!;
if (![root, socket, lock].every((p) => p?.startsWith("/")))
  throw Error("Configure absolute operator paths");
mkdirSync(root, { recursive: true, mode: 0o700 });
if (lstatSync(root).isSymbolicLink() || (lstatSync(root).mode & 0o077) !== 0)
  throw Error("Unsafe operator data directory");
// Socket lives in an operator-owned directory accessible only to the runtime group.
try {
  if (!lstatSync(socket).isSocket()) throw Error("Unsafe socket path");
  unlinkSync(socket);
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const jobs = () =>
  readdirSync(root)
    .filter((x) => /^[a-f0-9-]{36}\.json$/.test(x))
    .map((x) => JSON.parse(readFileSync(join(root, x), "utf8")));
for (const job of jobs())
  if (["queued", "running"].includes(job.state)) {
    job.state = "failed";
    job.recovery = "operator-required";
    writeFileSync(join(root, job.id + ".json"), JSON.stringify(job), {
      mode: 0o600,
    });
  }
let busy = false;
createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const url = new URL(req.url!, "http://operator");
    if (
      req.headers["x-oclr-database"] !==
      databaseIdentity(process.env.OCLR_OPERATOR_DATABASE_URL || "")
    )
      throw Error("Database target mismatch");
    const actor = Number(req.headers["x-oclr-actor"]);
    if (!Number.isSafeInteger(actor) || actor < 1) throw Error();
    if (req.method === "GET" && url.pathname === "/jobs") {
      res.end(
        JSON.stringify(
          jobs().map(
            ({ id, state, action, manifest, recovery, createdAt, target }) => ({
              id,
              state,
              action,
              manifest,
              recovery,
              createdAt,
              target,
            }),
          ),
        ),
      );
      return;
    }
    const download = /^\/download\/([a-f0-9-]{36})$/.exec(url.pathname);
    if (req.method === "GET" && download) {
      const job = JSON.parse(
        readFileSync(join(root, download[1] + ".json"), "utf8"),
      );
      if (job.state !== "completed") throw Error();
      appendFileSync(
        join(root, "audit.jsonl"),
        JSON.stringify({
          id: download[1],
          actor,
          action: "download",
          at: new Date().toISOString(),
        }) + "\n",
        { mode: 0o600, flush: true },
      );
      res.end(readFileSync(join(root, download[1] + ".oclr")));
      return;
    }
    if (req.method !== "POST" || url.pathname !== "/jobs" || busy) {
      res.statusCode = 409;
      res.end("{}");
      return;
    }
    busy = true;
    try {
      // Bound both storage and memory. Explicit expiry removes completed packages after 7 days.
      if (jobs().some((j) => j.recovery === "operator-required"))
        throw Error("Operator recovery required");
      const now = Date.now();
      for (const old of jobs())
        if (
          now - Date.parse(old.createdAt) > 7 * 86400000 &&
          ["completed", "validated", "failed"].includes(old.state)
        )
          for (const suffix of [".oclr", ".upload", ".evidence", ".json"])
            try {
              unlinkSync(join(root, old.id + suffix));
            } catch {}
      if (jobs().length >= 20) throw Error("Quota");
      const space = statfsSync(root);
      if (space.bavail * space.bsize < MAX_BYTES * 4)
        throw Error("Insufficient disk space");
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BYTES + 16384) throw Error("Limit");
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks),
        action = url.searchParams.get("action");
      if (!["backup", "import", "restore"].includes(action || ""))
        throw Error();
      const source = url.searchParams.get("source");
      if (
        action === "restore" &&
        (!/^[a-f0-9-]{36}$/.test(source || "") ||
          url.searchParams.get("confirm") !== "REPLACE")
      )
        throw Error();
      const existing = jobs().find(
        (j) =>
          j.action === "restore" &&
          j.source === source &&
          // A safely failed attempt must not hide a newer active/completed retry.
          !(j.state === "failed" && j.recovery === "original-preserved"),
      );
      if (action === "restore" && existing) {
        res.statusCode = 202;
        res.end(JSON.stringify(existing));
        busy = false;
        return;
      }
      const id = randomUUID(),
        job = {
          id,
          actor,
          action,
          source,
          state: "queued",
          createdAt: new Date().toISOString(),
        };
      if (action === "import")
        writeFileSync(join(root, id + ".upload"), body, {
          mode: 0o600,
          flag: "wx",
        });
      writeFileSync(join(root, id + ".json"), JSON.stringify(job), {
        mode: 0o600,
        flag: "wx",
      });
      appendFileSync(
        join(root, "audit.jsonl"),
        JSON.stringify({
          id,
          actor,
          action,
          state: "queued",
          at: job.createdAt,
        }) + "\n",
        { mode: 0o600, flush: true },
      );
      const child = spawn(
        "flock",
        [
          "-n",
          lock,
          process.execPath,
          "--import",
          "tsx",
          resolve("operator/worker.ts"),
          id,
        ],
        { stdio: "ignore", env: process.env },
      );
      child.on("error", () => finish());
      child.on("exit", () => finish());
      let finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        busy = false;
        const p = join(root, id + ".json");
        const j = JSON.parse(readFileSync(p, "utf8"));
        if (["queued", "running"].includes(j.state)) {
          j.recovery =
            j.state === "queued" ? "original-preserved" : "operator-required";
          j.state = "failed";
          writeFileSync(p, JSON.stringify(j), { mode: 0o600 });
          appendFileSync(
            join(root, "audit.jsonl"),
            JSON.stringify({
              id,
              actor,
              action,
              state: j.state,
              recovery: j.recovery,
              at: new Date().toISOString(),
            }) + "\n",
            { mode: 0o600, flush: true },
          );
        }
      }
      res.statusCode = 202;
      res.end(JSON.stringify(job));
    } catch (error) {
      busy = false;
      throw error;
    }
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Operator request rejected" }));
  }
}).listen(socket, () => chmodSync(socket, 0o660));
