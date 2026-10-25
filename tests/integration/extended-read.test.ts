import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { staffRoles } from "../../src/db/schema";
import {
  seedRemoteSite,
  remoteBusinessState,
  remoteFileState,
} from "../fixtures/remote-site";
import { createSession, readSessionContext } from "../../src/lib/auth/sessions";
import { createDeveloperToken } from "../../src/lib/developer-api";
import { developerApiScopes } from "../../src/lib/developer-api-model";
import { readApiRoute } from "../../src/lib/read-api";
import {
  extendedResources,
  extendedSchemas,
} from "../../src/lib/extended-read-resources";
import { reviveReadValue } from "../../src/lib/read-value";
import contracts from "../../src/lib/extended-read-contracts.json" with { type: "json" };
vi.mock("../../src/lib/osu-api", () => ({
  osuApi: vi.fn(() => {
    throw new Error("Provider forbidden in read tests");
  }),
}));
import { osuApi } from "../../src/lib/osu-api";
const backend = "https://backend.example.test",
  origin = "http://localhost:3000";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("full-site saved-only read services", () => {
  let fixture: Awaited<ReturnType<typeof seedRemoteSite>>,
    token: string,
    media: string;
  beforeAll(async () => {
    media = await realpath(
      await mkdtemp(join(tmpdir(), "oclr-full-read-test-")),
    );
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("OCLR_MEDIA_DIR", media);
    vi.stubEnv("APP_URL", backend);
    vi.stubEnv("OCLR_DEVELOPER_ORIGINS", origin);
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "2711000");
    await writeFile(
      join(media, "news.json"),
      JSON.stringify((await import("../fixtures/announcements")).announcements),
    );
    vi.stubEnv("OCLR_ANNOUNCEMENTS_FILE", join(media, "news.json"));
    fixture = await seedRemoteSite();
    const session = await readSessionContext(
      (await createSession(fixture.owner)).token,
    );
    token = (
      await createDeveloperToken(session!, {
        origin,
        scopes: [...developerApiScopes],
      })
    ).token;
  });
  afterAll(async () => {
    await closeDb();
    if (media) await rm(media, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  const request = (path: string, credential = token, method = "GET") =>
    readApiRoute(
      new Request(backend + "/api/v1" + path, {
        method,
        headers: {
          Origin: origin,
          ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
        },
      }),
    );
  it("validates every registered domain response, revives dates, preserves actual identity and never changes saved state", async () => {
    const before = await remoteBusinessState(true);
    const files = await remoteFileState();
    for (const resource of extendedResources) {
      let edition = "test-cup";
      if (
        ["statisticsWorkspace", "publicArchiveStatistics"].includes(resource.id)
      )
        edition = "s9";
      if (
        ["captainDraft", "publicDraft", "publicBroadcastDraft"].includes(
          resource.id,
        )
      )
        edition = "remote-draft";
      const id = ["applicationDetails", "staffBws"].includes(resource.id)
        ? fixture.registrationId
        : resource.id === "replayList"
          ? fixture.entryId
          : fixture.fixtureId;
      const path = resource.path
        .replace("{edition}", edition)
        .replace("{id}", id)
        .replace("{osuId}", String(fixture.owner));
      const response = await request(path);
      const body = await response.json();
      expect(
        response.status,
        resource.id + ": " + JSON.stringify(body).slice(0, 350),
      ).toBe(200);
      expect(
        extendedSchemas[resource.id].safeParse(body.data).success,
        resource.id,
      ).toBe(true);
      if (resource.id === "ownRegistrations") {
        expect(
          body.data.every(
            (r: { userId: number }) => r.userId === fixture.owner,
          ),
        ).toBe(true);
        const revived = reviveReadValue(body.data, {
          ...(contracts.resources as Record<string, object>)[resource.id],
          $defs: contracts.$defs,
        }) as { createdAt: Date }[];
        expect(revived[0].createdAt).toBeInstanceOf(Date);
      }
      if (resource.id === "staffDraft")
        expect(body.data.canConfigure).toBe(false);
      if (resource.id === "publicArchiveStatistics")
        expect(body.data.plays.length).toBeGreaterThan(0);
      if (resource.id === "tournamentList")
        expect(body.data.canCreate).toBe(false);
    }
    const publicForm = await (
      await request("/tournaments/remote-registration/configuration", "")
    ).json();
    const contributors = await (await request("/site/contributors", "")).json();
    expect(contributors.data).toEqual([
      { name: "Synthetic published contributor", osuId: fixture.owner + 9000 },
    ]);
    const participation = await (
      await request(`/players/${fixture.owner}/participations`, "")
    ).json();
    expect(
      participation.data.some(
        (row: { osuId: number }) => row.osuId === fixture.owner,
      ),
    ).toBe(true);
    expect(publicForm.data.edition.registration.questions).toEqual([]);
    expect(publicForm.data.edition).not.toHaveProperty("automaticEligibility");
    const ownForm = await (
      await request("/me/tournaments/remote-registration/registration")
    ).json();
    expect(ownForm.data.edition.registration.questions.length).toBeGreaterThan(
      0,
    );
    const eligibility = await (
      await request("/me/tournaments/remote-registration/eligibility")
    ).json();
    expect(eligibility.data).toMatchObject({
      userId: fixture.owner,
      status: "pass",
      pp: 0,
      rank: null,
    });
    expect(vi.mocked(osuApi)).not.toHaveBeenCalled();
    expect(await remoteBusinessState(true)).toEqual(before);
    expect(await remoteFileState()).toEqual(files);
  });
  it("serves bounded protected binaries and denies mutation, missing scope, wrong IDs and absent captain appointment", async () => {
    const session = await readSessionContext(
      (await createSession(fixture.owner)).token,
    );
    const narrow = (
      await createDeveloperToken(session!, {
        origin,
        scopes: ["identity:read"],
      })
    ).token;
    const privateOnly = (
      await createDeveloperToken(session!, {
        origin,
        scopes: ["identity:read", "tournaments:private:read"],
      })
    ).token;
    const before = await remoteBusinessState(true);
    const files = await remoteFileState();
    const avatar = await request(`/media/teams/${fixture.home.teamId}/avatar`);
    expect(avatar.status).toBe(200);
    expect(avatar.headers.get("content-type")).toBe("image/webp");
    expect((await avatar.arrayBuffer()).byteLength).toBeLessThanOrEqual(
      1048576,
    );
    const replayPath = `/staff/tournaments/test-cup/mappool-entries/${fixture.entryId}/replays/${fixture.replayId}/file`;
    const replay = await request(replayPath);
    expect(replay.status).toBe(200);
    expect(replay.headers.get("content-disposition")).toContain(
      "Synthetic%20readable",
    );
    expect(Buffer.from(await replay.arrayBuffer())).toEqual(
      fixture.replayBytes,
    );
    expect((await request(replayPath, "")).status).toBe(401);
    expect((await request("/me/tournaments/s9/draft")).status).toBe(403);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"])
      expect(
        (await request("/staff/tournaments/test-cup/draft", token, method))
          .status,
      ).toBe(405);
    expect((await request("/staff/registrations/not-a-uuid")).status).toBe(400);
    expect((await request("/staff/site-settings", narrow)).status).toBe(403);
    expect((await request("/me/profile", narrow)).status).toBe(200);
    expect(
      (
        await request(
          `/staff/tournaments/test-cup/registrations/${fixture.registrationId}/bws`,
          privateOnly,
        )
      ).status,
    ).toBe(403);
    expect(await remoteBusinessState(true)).toEqual(before);
    expect(await remoteFileState()).toEqual(files);
  });
  it("keeps combined Admin/Developer and edition staff roles read-only on the delegated channel, and rechecks revocation", async () => {
    await db()
      .insert(staffRoles)
      .values([
        { userId: fixture.owner, role: "admin", grantedBy: fixture.admin },
        {
          userId: fixture.owner,
          role: "mappooler",
          editionSlug: "test-cup",
          grantedBy: fixture.admin,
        },
      ]);
    await db().insert(staffRoles).values({
      userId: fixture.owner,
      role: "referee",
      editionSlug: "test-cup",
      grantedBy: fixture.admin,
    });
    const list = await (await request("/staff/tournament-workspace")).json();
    expect(list.data.canCreate).toBe(false);
    const access = await (await request("/me/staff-access")).json();
    expect(access.data.map((g: { role: string }) => g.role)).toContain("admin");
    expect(access.data.map((g: { role: string }) => g.role)).toContain(
      "developer",
    );
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, fixture.owner));
    expect((await request("/me")).status).toBe(403);
    expect(
      (await request(`/media/teams/${fixture.home.teamId}/avatar`)).status,
    ).toBe(403);
  });
});
