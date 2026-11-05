import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { join } from "node:path";
import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from "node:http";
import { databaseIdentity } from "../../operator/identity";

const operator = vi.hoisted(() => ({
  files: new Map<string, string>(),
  handler: undefined as RequestListener | undefined,
  spawn: vi.fn(),
}));
vi.mock("node:http", () => ({
  createServer: (handler: RequestListener) => {
    operator.handler = handler;
    return { listen: (_: string, ready: () => void) => ready() };
  },
}));
vi.mock("node:child_process", () => ({ spawn: operator.spawn }));
vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
  lstatSync: () => ({
    isSymbolicLink: () => false,
    isSocket: () => true,
    mode: 0o700,
  }),
  readdirSync: (root: string) =>
    [...operator.files.keys()].map((path) => path.slice(root.length + 1)),
  readFileSync: (path: string) => {
    if (!operator.files.has(path)) throw Error("Missing test file");
    return operator.files.get(path)!;
  },
  writeFileSync: (path: string, data: string) => operator.files.set(path, data),
  appendFileSync: (path: string, data: string) =>
    operator.files.set(path, (operator.files.get(path) ?? "") + data),
  unlinkSync: (path: string) => operator.files.delete(path),
  statfsSync: () => ({ bavail: 1024 * 1024, bsize: 4096 }),
}));

const root = "/oclr-retry-test";
const source = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const target = "postgresql://synthetic@localhost/oclr_retry_test";
type Job = {
  id: string;
  action: string;
  state: string;
  source?: string;
  recovery?: string;
  createdAt: string;
};
function save(job: Job) {
  operator.files.set(join(root, job.id + ".json"), JSON.stringify(job));
}
function read(id: string): Job {
  return JSON.parse(operator.files.get(join(root, id + ".json"))!);
}
async function restore(confirm = "REPLACE") {
  const req = Readable.from([]) as IncomingMessage;
  req.method = "POST";
  req.url = `/jobs?action=restore&source=${source}&confirm=${confirm}`;
  req.headers = {
    "x-oclr-actor": "1",
    "x-oclr-database": databaseIdentity(target),
  };
  let body = "";
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: (data: string) => {
      body = data;
    },
  };
  await operator.handler!(req, res as unknown as ServerResponse);
  return { status: res.statusCode, job: JSON.parse(body) as Job };
}
beforeEach(async () => {
  vi.resetModules();
  operator.files.clear();
  operator.spawn.mockReset().mockImplementation(() => new EventEmitter());
  vi.stubEnv("OCLR_OPERATOR_DATA", root);
  vi.stubEnv("OCLR_OPERATOR_SOCKET", "/oclr-retry-test/operator.sock");
  vi.stubEnv("OCLR_OPERATOR_LOCK", "/oclr-retry-test/lock");
  vi.stubEnv("OCLR_OPERATOR_DATABASE_URL", target);
  await import("../../operator/server");
  save({
    id: source,
    action: "import",
    state: "validated",
    createdAt: new Date().toISOString(),
  });
});
afterEach(() => vi.unstubAllEnvs());

it("queues a fresh restore of the same upload after a denied lock, then deduplicates its completed retry", async () => {
  const first = await restore();
  expect(first).toMatchObject({
    status: 202,
    job: { state: "queued", source },
  });
  expect(operator.spawn).toHaveBeenCalledTimes(1);
  operator.spawn.mock.results[0].value.emit("exit", 1);
  expect(read(first.job.id)).toMatchObject({
    state: "failed",
    recovery: "original-preserved",
  });

  const retry = await restore();
  expect(retry).toMatchObject({
    status: 202,
    job: { state: "queued", source },
  });
  expect(retry.job.id).not.toBe(first.job.id);
  expect(operator.spawn).toHaveBeenCalledTimes(2);
  expect(read(first.job.id).state).toBe("failed");
  const audit = operator.files.get(join(root, "audit.jsonl"))!;
  expect(audit).toContain(first.job.id);
  expect(audit).toContain(retry.job.id);

  // Child completion persists the final job before releasing the daemon's busy flag.
  save({ ...retry.job, state: "completed" });
  operator.spawn.mock.results[1].value.emit("exit", 0);
  expect(await restore()).toEqual({ status: 202, job: read(retry.job.id) });
  expect(operator.spawn).toHaveBeenCalledTimes(2);
});

it.each(["queued", "running", "completed", "failed"])(
  "keeps existing %s restores without a safe recovery classification deduplicated",
  async (state) => {
    const job: Job = {
      id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      action: "restore",
      source,
      state,
      createdAt: new Date().toISOString(),
    };
    save(job);
    expect(await restore()).toEqual({ status: 202, job });
    expect(operator.spawn).not.toHaveBeenCalled();
  },
);

it("rejects concurrent confirmation while the retry's worker is active", async () => {
  expect((await restore()).status).toBe(202);
  expect((await restore()).status).toBe(409);
  expect(operator.spawn).toHaveBeenCalledTimes(1);
});

it("keeps operator recovery and explicit confirmation mandatory", async () => {
  expect((await restore("")).status).toBe(400);
  save({
    id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
    action: "restore",
    source,
    state: "failed",
    recovery: "operator-required",
    createdAt: new Date().toISOString(),
  });
  expect((await restore()).status).toBe(400);
  expect(operator.spawn).not.toHaveBeenCalled();
});
