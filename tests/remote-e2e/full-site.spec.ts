import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeDb } from "../../src/db";
import { createSession } from "../../src/lib/auth/sessions";
import { waitForRemoteRateWindow } from "../fixtures/remote-rate-window";
import {
  seedRemoteSite,
  remoteBusinessState,
  remoteFileState,
} from "../fixtures/remote-site";
import matrix from "../../docs/remote-coverage.json" with { type: "json" };
import { wikiArticles } from "../../src/lib/wiki-articles";
import { english } from "../../src/i18n/translate";
import { historicalArchive } from "../fixtures/historical-archive";
const local = "http://127.0.0.1:31470",
  backend = "http://127.0.0.1:3100";
test.afterAll(async () => closeDb());
test("renders the complete saved-read page and GET matrix without a frontend database", async ({
  page,
  context,
  browser,
  isMobile,
}, info) => {
  test.setTimeout(600000);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const fixture = await seedRemoteSite(isMobile ? 2716000 : 2715000);
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
  let credential = await issued.json();
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
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("https://a.ppy.sh/**", (r) => r.abort());
  await context.route("https://assets.ppy.sh/**", (r) => r.abort());
  const news = await signed.request.get("/api/v1/site/news?locale=en", {
    headers: { Origin: local, Authorization: `Bearer ${credential.token}` },
  });
  expect(news.status()).toBe(200);
  const newsSlug = (await news.json()).data.items[0].slug;
  let navigationCount = 0,
    issuedCount = 1;
  async function rotateForWorkload() {
    if (navigationCount++ % 9 !== 8) return;
    if (issuedCount % 4 === 0) await page.waitForTimeout(61000);
    await signed.request.delete(
      "/api/developer/tokens/" + credential.access.id,
      { headers: { Origin: backend } },
    );
    const next = await signed.request.post("/api/developer/tokens", {
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
    expect(next.status()).toBe(201);
    credential = await next.json();
    issuedCount++;
    expect(
      (
        await context.request.post("/api/remote/connection", {
          headers: { Origin: local },
          data: { mode: "developer", token: credential.token },
        })
      ).status(),
    ).toBe(201);
  }
  const evidence: { file: string; path: string; status: number }[] = [];
  const before = await remoteBusinessState();
  const files = await remoteFileState();
  for (const row of matrix.rows.filter((r) => r.kind === "page")) {
    let path =
      row.file.replace(/^src\/app/, "").replace(/\/page\.tsx$/, "") || "/";
    let edition = "test-cup";
    if (
      path.includes("/archive") ||
      path === "/admin/tournaments/[edition]/statistics"
    )
      edition = "s9";
    if (path.includes("/draft/captain")) edition = "remote-draft";
    const historicalProfile = path === "/tournaments/[edition]/players/[osuId]";
    if (historicalProfile || path === "/tournaments/[edition]/staff")
      edition = "s9";
    path = path
      .replace("[edition]", edition)
      .replace("[fixtureId]", fixture.fixtureId)
      .replace("[poolId]", fixture.poolId!)
      .replace("[teamId]", fixture.home.teamId)
      .replace(
        "[osuId]",
        String(
          historicalProfile
            ? historicalArchive.players[0].osuId
            : fixture.owner,
        ),
      )
      .replace("[id]", fixture.registrationId)
      .replace("[slug]", newsSlug)
      .replace(
        "[article]",
        wikiArticles(english).find((a) => a.slug !== "introduction")!.slug,
      );
    await rotateForWorkload();
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("body")).not.toContainText(
      "The remote backend is unavailable or returned invalid data.",
    );
    if (path !== "/remote/unsupported")
      await expect(page.locator("body")).not.toContainText(
        "This page or feature is not supported in remote development yet.",
      );
    if (
      !["/remote", "/remote/unsupported", "/login", "/developer"].includes(path)
    )
      await expect(
        page.getByRole("heading", {
          name: "Remote frontend development",
          exact: true,
        }),
      ).toHaveCount(0);
    expect(await page.content()).not.toContain(credential.token);
    evidence.push({ file: row.file, path, status: response!.status() });
  }
  // Historical deep links reuse the complete archive view, without present-day profile overlays.
  for (const section of [
    "",
    "rules",
    "players",
    "teams",
    "draft",
    "mappools",
    "schedule",
    "bracket",
    "results",
    "results/awards",
    "staff",
    "statistics",
    `players/${historicalArchive.players[0].osuId}`,
    `teams/${historicalArchive.teams[0].id}`,
    `mappools/${historicalArchive.pools[0].id}`,
    `matches/${historicalArchive.matches[0].id}`,
  ]) {
    await rotateForWorkload();
    const response = await page.goto("/tournaments/s9/" + section);
    expect(response?.status(), section).toBe(200);
    await expect(page.locator("body")).not.toContainText(
      "The remote backend is unavailable or returned invalid data.",
    );
  }
  for (const row of matrix.rows.filter(
    (r) =>
      r.kind === "read-route" &&
      !r.file.includes("/api/v1/") &&
      !r.file.includes("/api/remote/read/"),
  )) {
    await rotateForWorkload();
    let path = row.file.replace(/^src\/app/, "").replace(/\/route\.ts$/, "");
    const edition = path.includes("/statistics")
      ? "s9"
      : path.endsWith("/draft/captain")
        ? "remote-draft"
        : "test-cup";
    path = path
      .replace("[edition]", edition)
      .replace("[fixtureId]", fixture.fixtureId)
      .replace("[poolId]", fixture.poolId!)
      .replace("[teamId]", fixture.home.teamId)
      .replace("[entryId]", fixture.entryId)
      .replace("[replayId]", fixture.replayId)
      .replace("[osuId]", String(fixture.owner))
      .replace("[id]", fixture.registrationId);
    if (path === "/api/players" || path.startsWith("/api/players/"))
      path += "?edition=test-cup";
    if (path.includes("/admin/tournaments/s9/statistics"))
      path += "?fixture=one";
    const result = await context.request.get(path);
    expect(result.status(), path).toBe(row.authority === "denied" ? 403 : 200);
    evidence.push({ file: row.file, path, status: result.status() });
  }
  expect(await remoteBusinessState()).toEqual(before);
  expect(await remoteFileState()).toEqual(files);
  expect(readFileSync(process.env.OCLR_TEST_NO_DB_ATTEMPTS!, "utf8")).toBe("");
  expect(errors).toEqual([]);
  await info.attach("remote-page-matrix", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
  await signed.close();
});
