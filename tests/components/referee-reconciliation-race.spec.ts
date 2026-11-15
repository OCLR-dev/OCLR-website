import { expect, test, type Page, type Route } from "@playwright/test";

const endpoint =
  "**/api/admin/tournaments/synthetic/matches/*/referee/reconciliation";
const importId = "00000000-0000-4000-8000-000000000004";
const fingerprint = "b".repeat(64);
const attemptId = "00000000-0000-4000-8000-000000000002";
const dependencyFingerprint = "a".repeat(64);

function workspace(revision = 0) {
  return {
    fixtureId: "00000000-0000-4000-8000-000000000001",
    canRecord: true,
    teams: [
      { id: "home", name: "Synthetic Home" },
      { id: "away", name: "Synthetic Away" },
    ],
    sessionRevision: 1,
    dependencyFingerprint,
    revision,
    rows: [
      {
        attemptId,
        pickId: "00000000-0000-4000-8000-000000000003",
        pickTeamId: "home",
        beatmapId: 1001,
        category: "NM",
        attemptNumber: 1,
        attemptStatus: "completed",
        winnerTeamId: "home",
        link: revision
          ? {
              attemptId,
              importId,
              sourceFingerprint: fingerprint,
              gameId: 567,
              sessionRevision: 1,
              dependencyFingerprint,
            }
          : null,
        sourceWinnerTeamId: revision ? "home" : null,
        status: revision ? "matched" : "unmatched",
      },
    ],
    sources: [
      {
        importId,
        fingerprint,
        matchId: 123,
        complete: true,
        current: true,
        games: [
          {
            id: 567,
            beatmapId: 1001,
            winnerTeamId: "home",
            tied: false,
            ended: true,
            problems: [],
          },
        ],
      },
    ],
    ledgerScore: { home: 1, away: 0 },
    official: null,
    history: [],
  };
}

async function open(page: Page) {
  await page.goto("/referee-reconciliation");
  await expect(page.getByRole("status")).toHaveText("Not linked to an MP game");
}

async function release(page: Page, route: Route, status = 200) {
  const received = page.waitForResponse(
    (response) => response.request() === route.request(),
  );
  await route.fulfill({
    status,
    json: status === 200 ? workspace() : { error: "Old refresh failed" },
  });
  await (await received).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

for (const status of [200, 500]) {
  test(`save survives an older refresh returning ${status}`, async ({
    page,
  }) => {
    let reads = 0;
    let delayed: Route | undefined;
    const writes: Record<string, unknown>[] = [];
    await page.route(endpoint, async (route) => {
      if (route.request().method() === "POST") {
        writes.push(route.request().postDataJSON());
        await route.fulfill({ json: { workspace: workspace(writes.length) } });
      } else if (++reads === 2) {
        delayed = route;
      } else {
        await route.fulfill({ json: workspace() });
      }
    });
    await open(page);
    await page.getByRole("button", { name: "Refresh reconciliation" }).click();
    await expect.poll(() => delayed !== undefined).toBe(true);
    await page.getByRole("combobox").selectOption(`${importId}:567`);
    await page.getByRole("button", { name: "Save game link" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Recorded result matches this MP game",
    );
    await release(page, delayed!, status);
    await expect
      .soft(page.getByRole("status"))
      .toHaveText("Recorded result matches this MP game");
    await expect.soft(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Save game link" }).click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes.map((write) => write.expectedRevision)).toEqual([0, 1]);
  });
}

test("latest refresh wins when responses arrive in reverse order", async ({
  page,
}) => {
  let reads = 0;
  let delayed: Route | undefined;
  await page.route(endpoint, async (route) => {
    reads++;
    if (reads === 2) delayed = route;
    else await route.fulfill({ json: workspace(reads === 1 ? 0 : 1) });
  });
  await open(page);
  await page.getByRole("button", { name: "Refresh reconciliation" }).click();
  await expect.poll(() => delayed !== undefined).toBe(true);
  await page.getByRole("button", { name: "Refresh reconciliation" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Recorded result matches this MP game",
  );
  await release(page, delayed!);
  await expect(page.getByRole("status")).toHaveText(
    "Recorded result matches this MP game",
  );
});

test("a delayed initial load cannot overwrite a manual refresh", async ({
  page,
}) => {
  let initial: Route | undefined;
  await page.route(endpoint, async (route) => {
    if (!initial) initial = route;
    else await route.fulfill({ json: workspace(1) });
  });
  await page.goto("/referee-reconciliation");
  await expect.poll(() => initial !== undefined).toBe(true);
  await page.getByRole("button", { name: "Refresh reconciliation" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Recorded result matches this MP game",
  );
  await release(page, initial!);
  await expect(page.getByRole("status")).toHaveText(
    "Recorded result matches this MP game",
  );
});

test("current refresh errors remain visible and an unknown save retries the same receipt", async ({
  page,
}) => {
  let reads = 0;
  const writes: Record<string, unknown>[] = [];
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "POST") {
      writes.push(route.request().postDataJSON());
      await route.fulfill(
        writes.length === 1
          ? { status: 500, json: { error: "Save outcome unknown" } }
          : { json: { workspace: workspace(1) } },
      );
    } else {
      reads++;
      await route.fulfill(
        reads === 2
          ? { status: 500, json: { error: "Current refresh failed" } }
          : { json: workspace() },
      );
    }
  });
  await open(page);
  await page.getByRole("button", { name: "Refresh reconciliation" }).click();
  await expect(page.getByRole("alert")).toHaveText("Current refresh failed");
  await page.getByRole("button", { name: "Refresh reconciliation" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("combobox").selectOption(`${importId}:567`);
  await page.getByRole("button", { name: "Save game link" }).click();
  await expect(page.getByRole("alert")).toHaveText("Save outcome unknown");
  await expect(page.getByRole("combobox")).toBeDisabled();
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Recorded result matches this MP game",
  );
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  await expect(page.getByRole("combobox")).toBeEnabled();
});

test("saves a selection in one request and restores saved games after reload", async ({
  page,
}) => {
  const secondAttempt = "00000000-0000-4000-8000-000000000005";
  const first = workspace();
  first.rows.push({
    ...first.rows[0],
    attemptId: secondAttempt,
    beatmapId: 1002,
  });
  first.sources[0].games.push({
    ...first.sources[0].games[0],
    id: 568,
    beatmapId: 1002,
  });
  const saved = workspace(2);
  saved.rows.push({
    ...first.rows[1],
    status: "stale",
    link: {
      ...saved.rows[0].link!,
      attemptId: secondAttempt,
      gameId: 568,
      sessionRevision: 0,
    },
    sourceWinnerTeamId: "home",
  });
  saved.sources = first.sources;
  const writes: Record<string, unknown>[] = [];
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "POST") {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: { workspace: saved } });
    } else {
      await route.fulfill({ json: writes.length ? saved : first });
    }
  });
  await page.goto("/referee-reconciliation");
  const games = page.getByRole("combobox");
  await expect(games).toHaveCount(2);
  await page.getByRole("button", { name: "Select unique matches" }).click();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Clear selection" }).click();
  await page.getByRole("button", { name: "Select all ready rows" }).click();
  await page.getByRole("button", { name: "Save selected links" }).click();
  await expect(
    page.getByText("Recorded result matches this MP game"),
  ).toBeVisible();
  expect(writes).toEqual([
    expect.objectContaining({
      expectedRevision: 0,
      links: [
        expect.objectContaining({ attemptId, importId, gameId: 567 }),
        expect.objectContaining({
          attemptId: secondAttempt,
          importId,
          gameId: 568,
        }),
      ],
    }),
  ]);

  await page.reload();
  await expect(games.nth(0)).toHaveValue(`${importId}:567`);
  await expect(games.nth(1)).toHaveValue(`${importId}:568`);
  await expect(
    page.getByText("Record or source changed; confirm the link again"),
  ).toBeVisible();
});
