import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { staffRoles, developerApiTokens } from "../../src/db/schema";
import { createSession } from "../../src/lib/auth/sessions";
import { waitForRemoteRateWindow } from "../fixtures/remote-rate-window";
import {
  seedRemoteSite,
  remoteBusinessState,
  remoteFileState,
} from "../fixtures/remote-site";
const local = "http://127.0.0.1:31470",
  backend = "http://127.0.0.1:3100";
test.afterAll(async () => closeDb());
test("keeps forms, OBS and actual Captain workflows read-only and removes revoked snapshots", async ({
  page,
  context,
  browser,
  isMobile,
}, info) => {
  test.setTimeout(120000);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const fixture = await seedRemoteSite(isMobile ? 2718000 : 2717000);
  const signed = await browser.newContext({ baseURL: backend });
  const parent = await createSession(fixture.owner);
  await signed.addCookies([
    {
      name: "oclr_session",
      value: parent.token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
  const issued = await signed.request.post("/api/developer/tokens", {
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
  expect(issued.status()).toBe(201);
  const credential = await issued.json();
  await waitForRemoteRateWindow(page);
  expect(
    (
      await context.request.post("/api/remote/connection", {
        headers: { Origin: local },
        data: { mode: "developer", token: credential.token },
      })
    ).status(),
  ).toBe(201);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("https://a.ppy.sh/**", (r) => r.abort());
  await context.route("https://assets.ppy.sh/**", (r) => r.abort());
  const before = await remoteBusinessState(),
    files = await remoteFileState();
  await page.goto("/tournaments/remote-registration/register");
  await expect(page.locator("form .staff-readonly-fields")).toHaveAttribute(
    "disabled",
    "",
  );
  await expect(page.getByLabel("Synthetic introduction")).toBeDisabled();
  const overlayPoll = page.waitForResponse(
    (r) =>
      r.url().includes("/api/tournaments/remote-draft/draft?overlay=1") &&
      r.status() === 200,
  );
  await page.goto("/tournaments/remote-draft/draft/overlay");
  await overlayPoll;
  await expect(page.locator("[data-broadcast]")).toBeVisible();
  await expect(page.locator("[data-broadcast]")).toContainText(
    fixture.draft.teamRows[0].name,
  );
  await page.goto("/tournaments/remote-draft/draft?presenter=1");
  await expect(page.locator(".presenter-view")).toBeVisible();
  await page.goto("/tournaments/remote-draft/draft/captain");
  await expect(page.locator(".captain-draft-room")).toBeVisible();
  const poll = await context.request.get(
    "/api/tournaments/remote-draft/draft/captain",
  );
  expect(poll.status()).toBe(200);
  expect((await poll.json()).sessionId).toBeTruthy();
  await page.reload();
  await expect(page.locator(".captain-draft-room")).toBeVisible();
  const denied = await context.request.get("/api/tournaments/s9/draft/captain");
  expect(denied.status()).toBe(403);
  const avatar = await context.request.get(
    `/api/teams/${fixture.home.teamId}/avatar`,
  );
  expect(avatar.status()).toBe(200);
  expect(avatar.headers()["content-type"]).toBe("image/webp");
  const replayPath = `/api/admin/tournaments/test-cup/mappools/entries/${fixture.entryId}/replays/${fixture.replayId}`;
  const replay = await context.request.get(replayPath);
  expect(replay.status()).toBe(200);
  expect(await replay.body()).toEqual(fixture.replayBytes);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"])
    expect(
      (
        await context.request.fetch("/api/admin/tournaments/test-cup", {
          method,
          headers: { Origin: local },
          data: {},
        })
      ).status(),
    ).toBe(403);
  expect(
    (await context.request.get("/api/admin/registrations/export")).status(),
  ).toBe(403);
  // V1 is hosted by the authoritative backend, never initialized on the DB-free frontend.
  for (const path of ["/api/v1/me", "/api/v1/site"])
    expect((await context.request.get(path)).status()).toBe(403);
  expect(await remoteBusinessState()).toEqual(before);
  expect(await remoteFileState()).toEqual(files);
  // A cumulative role must not enable commands on a remote frontend.
  await db()
    .insert(staffRoles)
    .values({ userId: fixture.owner, role: "admin", grantedBy: fixture.admin });
  await page.goto("/admin/tournaments/new");
  await expect(
    page.getByRole("button", { name: "Create private draft", exact: true }),
  ).toBeDisabled();
  await page.goto("/admin/tournaments/test-cup/settings");
  await expect(
    page.locator("fieldset.staff-readonly-fields").first(),
  ).toHaveAttribute("disabled", "");
  if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("remote-workspace-readonly.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.goto("/admin/staff");
  const roleEditors = page.locator(".staff-role-editor");
  expect(await roleEditors.count()).toBeGreaterThan(0);
  for (const checkbox of await roleEditors
    .locator('input[type="checkbox"]')
    .all())
    await expect(checkbox).toBeDisabled();
  await page.goto("/admin/contributors");
  await expect(page.getByLabel("Display name", { exact: true })).toHaveCount(2);
  for (const input of await page
    .getByLabel("Display name", { exact: true })
    .all())
    await expect(input).toBeDisabled();
  expect((await context.request.get("/api/admin/contributors")).status()).toBe(
    200,
  );
  await page.goto("/about");
  await expect(
    page.getByText("Synthetic published contributor", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic private contributor", { exact: true }),
  ).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("link", { name: "OCLR profile", exact: false }),
  ).toBeVisible();
  // Polling must discard private snapshots after token revocation; reconnect requires a new credential.
  await page.goto("/tournaments/remote-draft/draft/captain");
  await db()
    .update(developerApiTokens)
    .set({ revokedAt: new Date() })
    .where(eq(developerApiTokens.id, credential.access.id));
  await expect(page.locator(".captain-draft-room")).toHaveCount(0, {
    timeout: 25000,
  });
  expect((await context.request.get(replayPath)).status()).toBe(401);
  expect(readFileSync(process.env.OCLR_TEST_NO_DB_ATTEMPTS!, "utf8")).toBe("");
  expect(errors).toEqual([]);
  await signed.close();
});
