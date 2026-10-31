import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect, request as apiRequest } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { desktopAuthorizations } from "../../src/db/desktop-auth-schema";
import { createSession } from "../../src/lib/auth/sessions";
import { seedRefereeFixture, refereeTestUser } from "../fixtures/referee";
import { englishStorage } from "../fixtures/preferences";
import { assertTestDatabase } from "../database";
import { seedBrowserEditions } from "./setup";

async function seed() {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  if (
    new URL(process.env.TEST_DATABASE_URL!).pathname === "/oclr_frontend_test"
  )
    throw Error("Use an isolated browser test database.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await seedBrowserEditions();
  const fixture = await seedRefereeFixture();
  const session = await createSession(refereeTestUser.osuId);
  return {
    ...fixture,
    cookie: {
      name: "oclr_session",
      value: session.token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax" as const,
      secure: false,
    },
  };
}
const scopes = [
  "referee:fixtures:read",
  "referee:context:read",
  "referee:panel:read",
  "referee:relay",
];
function authorizationInput(deviceName: string, port = 42123) {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  return {
    verifier,
    state,
    body: {
      client_id: "oclr-ref-tools",
      client_version: "0.7.0",
      platform: "linux",
      device_name: deviceName,
      redirect_uri: `http://127.0.0.1:${port}/oclr/callback`,
      scope: scopes,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    },
  };
}

test.use({ trace: "off" });
test.describe("desktop browser authorization", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  // These tests use generated, synthetic tokens. Do not retain callback URLs or
  // token responses in browser traces, even for fixtures.

  test.afterAll(async () => closeDb());
  test("consent returns a one-time loopback code, permits assigned reads and supports revocation", async ({
    page,
    context,
    browser,
    baseURL,
  }, info) => {
    const fixture = await seed();
    await context.addCookies([fixture.cookie]);
    const desktop = await apiRequest.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const deviceName = `${info.project.name} Browser relay ${randomUUID()}`;
    // page.route only sees the first URL of a redirect chain, so the consent
    // form's 303 must reach a real loopback listener, as the desktop app's does.
    const callback: { query?: URLSearchParams } = {};
    const loopback = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/oclr/callback") callback.query = url.searchParams;
      res
        .writeHead(200, { "Content-Type": "text/html" })
        .end("<h1>Local authorization received</h1>");
    }).unref();
    await new Promise<void>((resolve) =>
      loopback.listen(0, "127.0.0.1", resolve),
    );
    const input = authorizationInput(
      deviceName,
      (loopback.address() as AddressInfo).port,
    );
    const created = await desktop.post("/api/desktop/v1/auth/requests", {
      data: input.body,
    });
    expect(created.status()).toBe(201);
    expect(created.headers()["cache-control"]).toContain("no-store");
    const authorization = (await created.json()).data;
    const authPath = `/desktop/authorize?request_id=${authorization.authorization_request_id}`;
    const guest = await browser.newContext({
      baseURL,
      storageState: englishStorage,
    });
    const guestPage = await guest.newPage();
    await guestPage.goto(authPath);
    await expect(
      guestPage.getByRole("link", { name: "Continue with osu!", exact: true }),
    ).toHaveAttribute(
      "href",
      `/auth/osu?desktop_request=${authorization.authorization_request_id}`,
    );
    await expect(
      guestPage.getByRole("button", {
        name: "Authorize desktop app",
        exact: true,
      }),
    ).toHaveCount(0);
    await guest.close();
    await page.goto(authPath);
    await expect(
      page.getByText(authorization.verification_code, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Sync local IRC room activity and execute commands queued from the referee page",
        { exact: true },
      ),
    ).toBeVisible();
    const decision = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/desktop/v1/auth/decision") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Authorize desktop app", exact: true })
      .click();
    expect((await decision).status()).toBe(303);
    await expect(
      page.getByRole("heading", {
        name: "Local authorization received",
        exact: true,
      }),
    ).toBeVisible();
    loopback.closeAllConnections();
    loopback.close();
    expect(callback.query?.get("state") === input.state).toBe(true);
    const callbackCode = callback.query?.get("code");
    expect(typeof callbackCode === "string" && callbackCode.length === 43).toBe(
      true,
    );
    const exchange = await desktop.post("/api/desktop/v1/auth/exchange", {
      data: {
        authorization_request_id: authorization.authorization_request_id,
        client_id: "oclr-ref-tools",
        code: callbackCode,
        code_verifier: input.verifier,
        redirect_uri: input.body.redirect_uri,
      },
    });
    expect(exchange.status()).toBe(200);
    const token = (await exchange.json()).data;
    expect(token.scope).toEqual(scopes);
    expect(token.subject.osuId).toBe(refereeTestUser.osuId);
    const headers = { Authorization: `Bearer ${token.access_token}` };
    const fixtures = await desktop.get(
      "/api/referee/v1/me/fixtures?view=active",
      { headers },
    );
    expect(fixtures.status()).toBe(200);
    expect(fixtures.headers()["x-oclr-referee-contract"]).toBe("1.1.0");
    expect(
      (await fixtures.json()).data.items.map(
        (item: { fixtureId: string }) => item.fixtureId,
      ),
    ).toContain(fixture.fixtureId);
    const panel = await desktop.get(
      `/api/referee/v1/fixtures/${fixture.fixtureId}/panel`,
      { headers },
    );
    expect(panel.status()).toBe(200);
    const panelBody = await panel.json();
    expect(panelBody.data.viewer.osuId).toBe(refereeTestUser.osuId);
    expect(panelBody.data.workspace.fixture.id).toBe(fixture.fixtureId);
    const relayPath = `/api/referee/v1/fixtures/${fixture.fixtureId}/relay`;
    const browserIrcPath = `/api/admin/tournaments/test-cup/matches/${fixture.fixtureId}/referee/irc`;
    const receiver = await desktop.post(relayPath, {
      headers,
      data: {
        action: "bind",
        roomId: 0,
        ircUsername: refereeTestUser.username.replace(/ /g, "_"),
      },
    });
    expect(receiver.status()).toBe(200);
    const receiverId = (await receiver.json()).data.connectionId;
    const creationSync = {
      action: "sync",
      connectionId: receiverId,
      sequence: 1,
      projection: { status: "connected", messages: [] },
      receipts: [],
    };
    expect(
      (await desktop.post(relayPath, { headers, data: creationSync })).status(),
    ).toBe(200);
    const makeRequest = {
      action: "queue",
      requestKey: randomUUID(),
      text: "!mp make Synthetic browser match",
    };
    expect(
      (
        await context.request.post(browserIrcPath, {
          headers: { Origin: baseURL! },
          data: makeRequest,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await context.request.post(browserIrcPath, {
          headers: { Origin: baseURL! },
          data: makeRequest,
        })
      ).status(),
    ).toBe(200);
    const makeDispatch = await desktop.post(relayPath, {
      headers,
      data: { ...creationSync, sequence: 2 },
    });
    expect(makeDispatch.status()).toBe(200);
    const make = (await makeDispatch.json()).data.command;
    expect(make).toMatchObject({ text: makeRequest.text, target: "BanchoBot" });
    expect(
      (
        await desktop.post(relayPath, {
          headers,
          data: { ...creationSync, sequence: 3 },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await desktop.post(relayPath, {
          headers,
          data: {
            ...creationSync,
            sequence: 4,
            roomId: 912344,
            receipts: [{ commandId: make.id, status: "unknown" }],
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await context.request.get(browserIrcPath)).json()).connection
        .roomId,
    ).toBe(912344);
    const roomId = 912345;
    const bound = await desktop.post(relayPath, {
      headers,
      data: {
        action: "bind",
        roomId,
        ircUsername: refereeTestUser.username.replace(/ /g, "_"),
      },
    });
    expect(bound.status()).toBe(200);
    expect(bound.headers()["x-oclr-referee-contract"]).toBe("1.1.0");
    const connectionId = (await bound.json()).data.connectionId;
    const sync = {
      action: "sync",
      connectionId,
      sequence: 1,
      projection: { status: "connected", messages: [] },
      receipts: [],
    };
    expect(
      (await desktop.post(relayPath, { headers, data: sync })).status(),
    ).toBe(200);
    const requestKey = randomUUID();
    const queued = await context.request.post(browserIrcPath, {
      headers: { Origin: baseURL! },
      data: { action: "queue", requestKey, text: "!mp aborttimer" },
    });
    expect(queued.status()).toBe(200);
    const queuedView = await queued.json();
    expect(queuedView.connection).toMatchObject({
      id: connectionId,
      roomId,
      connected: true,
    });
    expect(queuedView.commands).toEqual([
      expect.objectContaining({ requestKey, status: "queued" }),
    ]);
    const dispatched = await desktop.post(relayPath, {
      headers,
      data: { ...sync, sequence: 2 },
    });
    expect(dispatched.status()).toBe(200);
    const command = (await dispatched.json()).data.command;
    expect(command).toMatchObject({
      text: "!mp aborttimer",
      target: `#mp_${roomId}`,
    });
    expect(
      (
        await desktop.post(relayPath, {
          headers,
          data: {
            ...sync,
            sequence: 3,
            receipts: [{ commandId: command.id, status: "sent" }],
          },
        })
      ).status(),
    ).toBe(200);
    const sent = await context.request.get(browserIrcPath);
    expect(sent.status()).toBe(200);
    expect((await sent.json()).commands).toEqual([
      expect.objectContaining({ id: command.id, status: "sent" }),
    ]);
    // Exercise the real HTTP relay with synthetic evidence, without an IRC socket.
    const evidence = {
      sender: "BanchoBot",
      target: command.target,
      text: "Countdown aborted.",
    };
    const message = {
      id: randomUUID(),
      sender: evidence.sender,
      text: evidence.text,
      at: new Date().toISOString(),
    };
    const confirmed = await desktop.post(relayPath, {
      headers,
      data: {
        ...sync,
        sequence: 4,
        projection: { status: "connected", messages: [message] },
        receipts: [{ commandId: command.id, status: "confirmed", evidence }],
      },
    });
    expect(confirmed.status()).toBe(200);
    expect((await confirmed.json()).data.command).toBeNull();
    const projected = await context.request.get(browserIrcPath);
    expect(projected.status()).toBe(200);
    const projection = await projected.json();
    expect(projection.messages).toEqual([message]);
    expect(projection.commands).toEqual([
      expect.objectContaining({ id: command.id, status: "confirmed" }),
    ]);
    expect(projection.workspace.projection.activeSelections).toEqual(
      panelBody.data.workspace.projection.activeSelections,
    );
    // The consumed request no longer offers an approval form.
    await page.goto(authPath);
    await expect(
      page.getByText(
        "This desktop authorization request expired or was already handled. Start again in oclr-irc.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.goto("/desktop/sessions");
    const card = page
      .locator("article")
      .filter({ hasText: deviceName })
      .filter({
        has: page.getByRole("button", {
          name: "Revoke desktop session",
          exact: true,
        }),
      });
    await card
      .getByRole("button", { name: "Revoke desktop session", exact: true })
      .click();
    await expect(
      page.locator("article").filter({ hasText: deviceName }),
    ).toContainText("Revoked");
    expect(
      (
        await desktop.get(
          `/api/referee/v1/fixtures/${fixture.fixtureId}/panel`,
          { headers },
        )
      ).status(),
    ).toBe(401);
    expect(
      (
        await desktop.post(relayPath, {
          headers,
          data: { ...sync, sequence: 5 },
        })
      ).status(),
    ).toBe(401);
    await desktop.dispose();
  });
  test("expired authorization does not offer approval", async ({
    page,
    context,
    baseURL,
  }) => {
    const fixture = await seed();
    await context.addCookies([fixture.cookie]);
    const desktop = await apiRequest.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const input = authorizationInput(`Expired ${randomUUID()}`);
    const response = await desktop.post("/api/desktop/v1/auth/requests", {
      data: input.body,
    });
    expect(response.status()).toBe(201);
    const id = (await response.json()).data.authorization_request_id;
    await db()
      .update(desktopAuthorizations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(desktopAuthorizations.id, id));
    await page.goto(`/desktop/authorize?request_id=${id}`);
    await expect(
      page.getByText(
        "This desktop authorization request expired or was already handled. Start again in oclr-irc.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Authorize desktop app", exact: true }),
    ).toHaveCount(0);
    await desktop.dispose();
  });
});
