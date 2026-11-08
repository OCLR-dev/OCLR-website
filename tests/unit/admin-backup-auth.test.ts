import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { databaseIdentity } from "../../operator/identity";
import { describe, it, expect, vi, beforeEach } from "vitest";
const mock = vi.hoisted(() => ({
  grants: [] as { role: string; editionSlug: string | null }[],
  remote: false,
  read: false,
}));
vi.mock("@/lib/auth/user", () => ({ requireUser: async () => ({ osuId: 1 }) }));
vi.mock("@/lib/auth/staff", () => ({ staffAccess: async () => mock.grants }));
vi.mock("@/lib/data-source", () => ({ remoteMode: () => mock.remote }));
vi.mock("@/lib/read-channel", () => ({ inReadChannel: () => mock.read }));
import { backupActor } from "@/lib/admin-backups";
import { queueAdminBackupWrite } from "@/lib/admin-operations-write-contracts";
import { POST } from "@/app/api/admin/backups/route";
describe("global backup authorization", () => {
  beforeEach(() => {
    mock.grants = [];
    mock.remote = false;
    mock.read = false;
  });
  it("requires an explicit global Admin on every request", async () => {
    for (const grants of [
      [],
      [{ role: "admin", editionSlug: "s11" }],
      [{ role: "developer", editionSlug: null }],
      [{ role: "referee", editionSlug: null }],
    ]) {
      mock.grants = grants;
      await expect(backupActor()).rejects.toMatchObject({ status: 403 });
    }
    mock.grants = [{ role: "admin", editionSlug: null }];
    await expect(backupActor()).resolves.toMatchObject({ osuId: 1 });
    mock.grants = [];
    await expect(backupActor()).rejects.toMatchObject({ status: 403 });
  });
  it("forwards raw backup requests and preserves the operator's 202 receipt", async () => {
    const path = mkdtempSync(join(tmpdir(), "b-"));
    const socket = join(path, "op.sock");
    const origin = "https://oclr.example.test";
    const database = "postgresql://127.0.0.1:55315/oclr_synthetic_test";
    const id = "93000000-0000-4000-8000-000000000001";
    const source = "93000000-0000-4000-8000-000000000002";
    const received: {
      url: string;
      method?: string;
      actor?: string | string[];
      identity?: string | string[];
      body: Buffer;
    }[] = [];
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      received.push({
        url: req.url!,
        method: req.method,
        actor: req.headers["x-oclr-actor"],
        identity: req.headers["x-oclr-database"],
        body: Buffer.concat(chunks),
      });
      const query = new URL(req.url!, "http://operator").searchParams;
      if (query.get("action") === "restore" && query.get("confirm") !== "REPLACE") {
        res.writeHead(400).end("{}");
        return;
      }
      res.writeHead(202).end(JSON.stringify({
        id,
        actor: 1,
        action: query.get("action"),
        source: query.get("source"),
        state: query.get("action") === "restore" ? "completed" : "queued",
        createdAt: "2026-10-25T00:00:00.000Z",
      }));
    });
    const bytes = new Uint8Array([0, 255, 79, 67, 76, 82]);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socket, resolve);
      });
      vi.stubEnv("APP_URL", origin);
      vi.stubEnv("DATABASE_URL", database);
      vi.stubEnv("OCLR_OPERATOR_SOCKET", socket);
      const post = (query: string, body?: Uint8Array<ArrayBuffer>, authorization?: string) =>
        POST(new Request(origin + queueAdminBackupWrite.path + "?" + query, {
          method: "POST",
          headers: { origin, ...(authorization ? { authorization } : {}) },
          body,
        }));

      expect((await post("action=backup")).status).toBe(403);
      mock.grants = [{ role: "admin", editionSlug: null }];
      expect((await post("action=backup", undefined, "Bearer synthetic-only")).status).toBe(403);
      expect((await post("action=unknown")).status).toBe(400);
      expect(received).toHaveLength(0);
      for (const [query, body] of [
        ["action=backup", undefined],
        ["action=import", bytes],
        [`action=restore&source=${source}&confirm=REPLACE`, undefined],
      ] as const) {
        const response = await post(query, body);
        expect(response.status).toBe(202);
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        const payload = await response.json();
        expect(queueAdminBackupWrite.response.parse(payload)).toEqual(payload);
        expect(received.at(-1)).toEqual({
          url: "/jobs?" + query,
          method: "POST",
          actor: "1",
          identity: databaseIdentity(database),
          body: Buffer.from(body ?? []),
        });
      }
      expect((await post(`action=restore&source=${source}`)).status).toBe(409);
      vi.stubEnv("OCLR_OPERATOR_SOCKET", "");
      const unavailable = await post("action=backup");
      expect(unavailable.status).toBe(503);
      expect(queueAdminBackupWrite.errorResponses[503].parse(await unavailable.json()))
        .toEqual({ error: "Backup service is unavailable.", code: "not_configured" });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(path, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });
  it("rejects remote and Developer read channels even with cumulative Admin grants", async () => {
    mock.grants = [{ role: "admin", editionSlug: null }];
    mock.remote = true;
    await expect(backupActor()).rejects.toMatchObject({ status: 403 });
    mock.remote = false;
    mock.read = true;
    await expect(backupActor()).rejects.toMatchObject({ status: 403 });
  });
});
