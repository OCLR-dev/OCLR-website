import { expect, test, type Route } from "@playwright/test";
import type { ScheduleWorkspace } from "../../src/lib/schedule-reads";

function snapshot(version: number): ScheduleWorkspace {
  return {
    admin: false,
    actorId: 676001,
    captain: false,
    ownTeamId: "00000000-0000-4000-8000-000000000001",
    requests: [],
    fixtures: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        label: `Snapshot ${version}`,
        roundId: "synthetic-round",
        roundName: "Synthetic round",
        version,
        timeZone: "Asia/Taipei",
        scheduledAt: `2090-01-0${version}T08:00:00.000Z`,
        eligible: true,
        home: "Synthetic home",
        away: "Synthetic away",
        participant: true,
        ownAvailability: { version: 1, intervals: [] },
        roster: [],
        summary: [],
        unreported: 0,
        sameStart: [],
        referees: [],
        commentators: [],
        streamer: null,
      },
    ],
  };
}

test("filters deleted fixture history and shows an empty state only when nothing matches", async ({
  page,
}) => {
  const data = snapshot(1);
  data.admin = true;
  data.fixtures = [];
  data.requests = [
    {
      id: "deleted-request",
      fixtureId: null,
      label: "Deleted A vs B",
      basis: {
        scheduledAt: "2090-01-01T08:00:00.000Z",
        timeZone: "Asia/Taipei",
        homeTeamId: "home",
        awayTeamId: "away",
        homeCaptainId: 1,
        awayCaptainId: 2,
      },
      proposedAt: "2090-01-02T08:00:00.000Z",
      proposerId: 1,
      proposerName: "Synthetic captain",
      status: "expired",
      version: 1,
      decisionNote: null,
      updatedAt: "2090-01-01T08:00:00.000Z",
      canReview: true,
      history: [],
    },
  ];
  await page.route("**/api/tournaments/synthetic/schedule/requests", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/schedule-selection?fixture");
  await page
    .getByRole("button", { name: "Reload schedule", exact: true })
    .click();
  await expect(page.locator(".schedule-heading")).toHaveCount(0);
  const history = page.locator("summary").filter({ hasText: "Deleted A vs B" });
  const empty = page.getByText("No matching schedule requests.", {
    exact: true,
  });
  for (const status of ["pending", "approved", "expired", "all"]) {
    await page
      .getByRole("combobox", { name: "Request status", exact: true })
      .selectOption(status);
    const matching = status === "expired" || status === "all";
    await expect(history).toHaveCount(matching ? 1 : 0);
    await expect(empty).toHaveCount(matching ? 0 : 1);
  }
});

for (const stale of ["success", "http-error", "network-error"] as const) {
  test(`ignores a late ${stale} after the newest schedule is shown`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const requests: Route[] = [];
    await page.route(
      "**/api/tournaments/synthetic/schedule/requests",
      (route) => {
        requests.push(route);
      },
    );
    await page.goto("/schedule-selection?fixture");
    const reload = page.getByRole("button", {
      name: "Reload schedule",
      exact: true,
    });
    await reload.click();
    await expect.poll(() => requests.length).toBe(1);
    await reload.click();
    await expect.poll(() => requests.length).toBe(2);
    await requests[1].fulfill({ json: snapshot(2) });
    const heading = page.locator(".schedule-heading");
    await expect(heading).toContainText("Snapshot 2");
    await expect(heading).toContainText("Jan 2, 2090");
    if (stale === "network-error") await requests[0].abort();
    else
      await requests[0].fulfill({
        status: stale === "http-error" ? 500 : 200,
        json: snapshot(1),
      });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(heading).toContainText("Snapshot 2");
    await expect(heading).toContainText("Jan 2, 2090");
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("retains the newest reload error when an older success arrives, then retries", async ({
  page,
}) => {
  const requests: Route[] = [];
  await page.route(
    "**/api/tournaments/synthetic/schedule/requests",
    (route) => {
      requests.push(route);
    },
  );
  await page.goto("/schedule-selection?fixture");
  const reload = page.getByRole("button", {
    name: "Reload schedule",
    exact: true,
  });
  await reload.click();
  await expect.poll(() => requests.length).toBe(1);
  await reload.click();
  await expect.poll(() => requests.length).toBe(2);
  await requests[1].abort();
  await expect(page.getByRole("alert")).toHaveText(
    "Reload failed. Refresh before continuing.",
  );
  await requests[0].fulfill({ json: snapshot(1) });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByRole("alert")).toHaveText(
    "Reload failed. Refresh before continuing.",
  );
  await expect(page.locator(".schedule-heading")).not.toContainText(
    "Snapshot 1",
  );
  await reload.click();
  await expect.poll(() => requests.length).toBe(3);
  await requests[2].fulfill({ json: snapshot(2) });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".schedule-heading")).toContainText("Snapshot 2");
});
