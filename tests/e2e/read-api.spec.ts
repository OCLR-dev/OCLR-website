import { createServer } from "node:http";
import { test, expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { assertTestDatabase } from "../database";
import { db, closeDb } from "../../src/db";
import {
  users,
  registrations,
  userProfileCache,
  staffRoles,
} from "../../src/db/schema";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { profileResponse } from "../fixtures/osu-profile";
import { seedPublicDirectory } from "../fixtures/players";
import { seedSession } from "./session";
const backend = "http://127.0.0.1:3100",
  local = "http://127.0.0.1:31468";
const transport = createServer((_request, response) => {
  response.writeHead(200, {
    "Content-Type": "text/html",
    "Cache-Control": "no-store",
  });
  response.end("<!doctype html><title>Stage 2 isolated frontend</title>");
});
test.describe("versioned read API and existing SSR", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      transport.once("error", reject);
      transport.listen(31468, "127.0.0.1", resolve);
    });
  });
  test.afterAll(async () => {
    await new Promise<void>((resolve) => transport.close(() => resolve()));
    await closeDb();
  });
  test("reads public and private projections from localhost, preserves complete SSR players and the API specification", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    const base = isMobile ? 2694000 : 2693000,
      ownerId = base + 500;
    await context.addCookies([await seedSession(ownerId)]);
    const seeded = await seedPublicDirectory(base);
    await db()
      .insert(staffRoles)
      .values({ userId: ownerId, role: "developer", grantedBy: ownerId });
    const extra = Array.from({ length: 60 }, (_, index) => ({
      osuId: base + 100 + index,
      username: `Synthetic API player ${base} ${index}`,
    }));
    await db().insert(users).values(extra);
    await db()
      .insert(registrations)
      .values(
        extra.map((player) => ({
          userId: player.osuId,
          editionSlug: "test-cup",
          status: "accepted" as const,
          answers: { private: "SYNTHETIC_PRIVATE_CONTACT" },
        })),
      );
    const ids = [
      base,
      base + 1,
      base + 3,
      ...extra.map((player) => player.osuId),
    ];
    for (const id of ids) {
      const profile = normalizeOsuProfile(
        {
          ...profileResponse,
          id,
          statistics: {
            ...profileResponse.statistics,
            pp: id === base + 1 ? 0 : 1234.56,
          },
        },
        id,
        "osu",
      );
      await db()
        .insert(userProfileCache)
        .values({
          osuId: id,
          mode: "osu",
          profile,
          attemptedAt: new Date(),
          retryAt: new Date(Date.now() + 3600000),
        })
        .onConflictDoUpdate({
          target: [userProfileCache.osuId, userProfileCache.mode],
          set: { profile, errorStatus: null },
        });
    }
    const issuance = await context.request.post("/api/developer/tokens", {
      headers: { Origin: backend },
      data: {
        origin: local,
        scopes: [
          "identity:read",
          "tournaments:read",
          "tournaments:private:read",
          "profiles:read",
        ],
      },
    });
    expect(issuance.status()).toBe(201);
    const credential = await issuance.json();
    const localPage = await context.newPage();
    await localPage.goto(local);
    try {
      const fetched = await localPage.evaluate(
        async ({ backend, token }) => {
          async function read(path: string, auth = false) {
            const response = await fetch(backend + "/api/v1" + path, {
              headers: auth ? { Authorization: `Bearer ${token}` } : {},
              credentials: "omit",
            });
            return {
              status: response.status,
              body: await response.json(),
              requestId: response.headers.get("X-Request-Id"),
            };
          }
          const first = await read("/tournaments/test-cup/players?pageSize=50");
          const pagination = first.body.meta.pagination;
          const second = await read(
            `/tournaments/test-cup/players?pageSize=50&page=2&version=${pagination.collectionVersion}`,
          );
          return {
            first,
            second,
            site: await read("/site"),
            publicDetail: await read("/tournaments/test-cup"),
            hidden: await read("/tournaments/private-test-cup", true),
            privateDetail: await read(
              "/staff/tournaments/private-test-cup",
              true,
            ),
            profile: await read(
              `/staff/profiles/${first.body.data[0].osuId}`,
              true,
            ),
            missingAuth: await read("/staff/tournaments"),
            invalid: await read("/tournaments?pageSize=101"),
            spec: await read("/openapi.json"),
          };
        },
        { backend, token: credential.token },
      );
      expect(fetched.first.status).toBe(200);
      expect(fetched.second.status).toBe(200);
      expect(fetched.first.body.meta.pagination.total).toBe(63);
      const all = [...fetched.first.body.data, ...fetched.second.body.data];
      expect(new Set(all.map((player) => player.osuId)).size).toBe(63);
      expect(all.some((player) => player.osuId === base + 2)).toBe(false);
      expect(JSON.stringify(all)).not.toContain("SYNTHETIC_PRIVATE_CONTACT");
      expect(
        all.find((player) => player.osuId === base + 1).statistics.pp,
      ).toBe(0);
      expect(fetched.first.requestId).toBe(fetched.first.body.meta.requestId);
      expect(fetched.site.status).toBe(200);
      expect(fetched.publicDetail.status).toBe(200);
      expect(fetched.publicDetail.body.data.overview.kind).toBe("database");
      expect(fetched.hidden.status).toBe(404);
      expect(fetched.privateDetail.status).toBe(200);
      expect(fetched.privateDetail.body.data.configuration.published).toBe(
        false,
      );
      expect(fetched.profile.status).toBe(200);
      expect(fetched.missingAuth.status).toBe(401);
      expect(fetched.invalid.status).toBe(400);
      expect(fetched.spec.body.openapi).toBe("3.1.0");
      await context.route("https://a.ppy.sh/**", (route) => route.abort());
      if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
      await page.goto("/tournaments/test-cup/players");
      await expect(page.locator(".event-player-row")).toHaveCount(63);
      const zero = page
        .locator(".event-player-row")
        .filter({ hasText: `Synthetic Directory ${base} Member` });
      await expect(
        zero.locator("dl > div").filter({ hasText: "PP" }).locator("dd"),
      ).toHaveText("0");
      await expect(
        page.getByRole("link", { name: "OCLR profile", exact: true }),
      ).toHaveCount(63);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.screenshot({
        path: info.outputPath(
          `${isMobile ? "mobile" : "desktop"}-shared-players-light.png`,
        ),
        fullPage: false,
      });
      await context.addCookies([
        { name: "oclr-theme", value: "dark", url: backend },
      ]);
      await page.goto("/tournaments/test-cup");
      await expect(
        page
          .getByRole("heading", { name: "Synthetic test edition", exact: true })
          .first(),
      ).toBeVisible();
      await expect(
        page.getByText("Synthetic rules for automated testing only.", {
          exact: true,
        }),
      ).toBeVisible();
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.screenshot({
        path: info.outputPath(
          `${isMobile ? "mobile" : "desktop"}-shared-tournament-dark.png`,
        ),
        fullPage: false,
      });
      await page.goto("/developer");
      await expect(
        page.getByRole("link", { name: "View API specification", exact: true }),
      ).toHaveAttribute("href", "/api/v1/openapi.json");
      const response = await context.request.get(
        `/api/players/${seeded.memberId}?edition=test-cup&mode=osu`,
      );
      expect(response.status()).toBe(200);
      const legacy = await response.json();
      const versioned = await (
        await context.request.get(
          `/api/v1/tournaments/test-cup/players/${seeded.memberId}?mode=osu`,
        )
      ).json();
      expect(versioned.data.snapshot.profile).toEqual(legacy.snapshot.profile);
    } finally {
      await localPage.close();
    }
  });
});

test.describe("full-site direct browser transport", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  // This test uses the same localhost document server as the contract test above.
  test.beforeAll(async () => {
    if (!transport.listening)
      await new Promise<void>((resolve, reject) => {
        transport.once("error", reject);
        transport.listen(31468, "127.0.0.1", resolve);
      });
  });
  test.afterAll(async () => {
    if (transport.listening)
      await new Promise<void>((resolve) => transport.close(() => resolve()));
    await closeDb();
  });
  test("preflights and reads protected media and saved registration data with Bearer/omit, then denies revoked access", async ({
    page,
    context,
    isMobile,
  }) => {
    const { seedRemoteSite, remoteBusinessState, remoteFileState } =
      await import("../fixtures/remote-site");
    const { createSession } = await import("../../src/lib/auth/sessions");
    const fixture = await seedRemoteSite(isMobile ? 2726000 : 2725000);
    const session = await createSession(fixture.owner);
    await context.addCookies([
      {
        name: "oclr_session",
        value: session.token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: false,
      },
    ]);
    const issued = await context.request.post(
      backend + "/api/developer/tokens",
      {
        headers: { Origin: backend },
        data: {
          origin: local,
          scopes: [
            "identity:read",
            "tournaments:read",
            "tournaments:private:read",
            "profiles:read",
          ],
        },
      },
    );
    expect(issued.status()).toBe(201);
    const credential = await issued.json();
    const replay = `/staff/tournaments/test-cup/mappool-entries/${fixture.entryId}/replays/${fixture.replayId}/file`;
    const options = await context.request.fetch(backend + "/api/v1" + replay, {
      method: "OPTIONS",
      headers: {
        Origin: local,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    });
    expect(options.status()).toBe(204);
    expect(options.headers()["access-control-allow-origin"]).toBe(local);
    expect(
      options.headers()["access-control-allow-credentials"],
    ).toBeUndefined();
    const before = await remoteBusinessState(),
      files = await remoteFileState();
    await page.goto(local);
    const result = await page.evaluate(
      async ({ backend, token, replay, avatar, bws }) => {
        const read = async (path: string) => {
          const response = await fetch(backend + "/api/v1" + path, {
            credentials: "omit",
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          });
          return {
            status: response.status,
            type: response.headers.get("content-type"),
            filename: response.headers.get("content-disposition"),
            version: response.headers.get("X-OCLR-Read-Contract"),
            requestId: response.headers.get("X-Request-Id"),
            length: (await response.arrayBuffer()).byteLength,
          };
        };
        return {
          replay: await read(replay),
          avatar: await read(avatar),
          bws: await read(bws),
        };
      },
      {
        backend,
        token: credential.token,
        replay,
        avatar: `/media/teams/${fixture.home.teamId}/avatar`,
        bws: `/staff/tournaments/test-cup/registrations/${fixture.registrationId}/bws`,
      },
    );
    expect(result.replay.status).toBe(200);
    expect(result.replay.type).toBe("application/octet-stream");
    expect(result.replay.filename).toContain("Synthetic%20readable");
    expect(result.replay.length).toBe(fixture.replayBytes.length);
    expect(result.avatar.status).toBe(200);
    expect(result.avatar.type).toBe("image/webp");
    expect(result.bws.status).toBe(200);
    expect(result.replay.version).toBe("1.2.0");
    expect(result.replay.requestId).toBeTruthy();
    expect(await remoteBusinessState()).toEqual(before);
    expect(await remoteFileState()).toEqual(files);
    expect(
      (
        await context.request.delete(
          backend + "/api/developer/tokens/" + credential.access.id,
          { headers: { Origin: backend } },
        )
      ).ok(),
    ).toBe(true);
    expect(
      await page.evaluate(
        async ({ backend, token, replay }) =>
          (
            await fetch(backend + "/api/v1" + replay, {
              credentials: "omit",
              headers: { Authorization: `Bearer ${token}` },
            })
          ).status,
        { backend, token: credential.token, replay },
      ),
    ).toBe(401);
  });
});
