import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { changedWorkspace, workspace, id } from "./referee-panel-data";

const endpoint = "**/api/admin/tournaments/synthetic/matches/*/referee";
async function setup(page: Page, mode = "success") {
  let current = changedWorkspace(mode === "recorded");
  current.dependencyFingerprint = "c".repeat(64);
  current.canRecord = mode !== "readonly";
  const writes: Record<string, unknown>[] = [];
  let reads = 0;
  const receipts = new Map<string, unknown>();
  await page.route(`${endpoint}/irc`, (r) =>
    r.fulfill({
      json: {
        connection: null,
        messages: [],
        commands: [],
        workspace: current,
      },
    }),
  );
  await page.route(`${endpoint}/mp`, (r) =>
    r.fulfill({ json: { binding: null, workspace: current } }),
  );
  await page.route(`${endpoint}/reconciliation`, (r) =>
    r.fulfill({
      status: 409,
      json: { error: "The action could not be completed." },
    }),
  );
  await page.route(endpoint, async (r) => {
    if (r.request().method() === "GET") {
      reads++;
      if (mode === "read-failure")
        return r.fulfill({
          status: 503,
          json: { error: "Unable to reload the referee workspace." },
        });
      if (mode === "already-current")
        current.session!.dependencyFingerprint = current.dependencyFingerprint;
      if (mode === "new-selection") {
        current = changedWorkspace(true);
        current.dependencyFingerprint = "c".repeat(64);
      }
      return r.fulfill({ json: current });
    }
    const body = r.request().postDataJSON();
    writes.push(body);
    if (mode === "conflict")
      return r.fulfill({
        status: 409,
        json: { error: "Fixture dependencies changed. Refresh before saving." },
      });
    expect(body.action).toBe("reconfirm_dependencies");
    expect(body.dependencyFingerprint).toBe("c".repeat(64));
    let receipt = receipts.get(body.requestKey);
    if (!receipt) {
      current = workspace([
        ...current.events,
        {
          id: id(1000 + current.events.length),
          ordinal: current.events.length + 1,
          actorId: 1,
          createdAt: "2026-11-03T00:00:00.000Z",
          payload: { type: "dependencies_reconfirmed" },
        },
      ]);
      current.dependencyFingerprint = "c".repeat(64);
      current.session!.dependencyFingerprint = current.dependencyFingerprint;
      receipt = {
        requestKey: body.requestKey,
        eventId: current.events.at(-1)!.id,
      };
      receipts.set(body.requestKey, receipt);
    }
    if (mode === "lost" && writes.length === 1) return r.abort("failed");
    return r.fulfill({ json: { receipt, workspace: current } });
  });
  return { writes, reads: () => reads, current: () => current };
}

test("dependency anchor focuses the check; one click reads current data and saves once", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/referee-panel?stale#referee-dependencies");
  const check = page.locator("#referee-dependencies");
  await expect(check).toBeFocused();
  expect(state.writes).toHaveLength(0);
  const button = check.getByRole("button", {
    name: "Recheck fixture dependencies",
  });
  await button.evaluate((element: HTMLButtonElement) => {
    element.click();
    element.click();
  });
  await expect(check.getByRole("status")).toHaveText(
    "Reloaded saved referee state.",
  );
  expect(state.reads()).toBe(1);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].expectedRevision).toBe(1);
  expect(state.current().session?.dependencyFingerprint).toBe(
    state.current().dependencyFingerprint,
  );
});

test("already-current configuration reads without appending a duplicate record", async ({
  page,
}) => {
  const state = await setup(page, "already-current");
  await page.goto("/referee-panel?stale#referee-dependencies");
  await page
    .getByRole("button", { name: "Recheck fixture dependencies" })
    .click();
  await expect(
    page.locator("#referee-dependencies").getByRole("status"),
  ).toBeVisible();
  expect(state.reads()).toBe(1);
  expect(state.writes).toHaveLength(0);
});

for (const mode of ["conflict", "read-failure", "new-selection"])
  test(`dependency check preserves ${mode} instead of reporting success`, async ({
    page,
  }) => {
    const state = await setup(page, mode);
    await page.goto("/referee-panel?stale#referee-dependencies");
    await page
      .getByRole("button", { name: "Recheck fixture dependencies" })
      .click();
    const message =
      mode === "read-failure"
        ? "Unable to reload the referee workspace."
        : mode === "conflict"
          ? "Fixture dependencies changed. Refresh before saving."
          : "Withdraw recorded steps before confirming changed dependencies.";
    await expect(
      page.getByRole("alert").filter({ hasText: message }),
    ).toBeVisible();
    expect(state.writes).toHaveLength(mode === "conflict" ? 1 : 0);
    await expect(
      page.locator("#referee-dependencies").getByRole("status"),
    ).toHaveCount(0);
  });

test("unknown save outcome retries the exact request and does not reconfirm again", async ({
  page,
}) => {
  const state = await setup(page, "lost");
  await page.goto("/referee-panel?stale#referee-dependencies");
  await page
    .getByRole("button", { name: "Recheck fixture dependencies" })
    .click();
  await page.getByRole("button", { name: "Retry same request" }).click();
  await expect(
    page.locator("#referee-dependencies").getByRole("status"),
  ).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1]).toEqual(state.writes[0]);
  expect(state.reads()).toBe(1);
  expect(
    state
      .current()
      .events.filter((e) => e.payload.type === "dependencies_reconfirmed"),
  ).toHaveLength(1);
});

for (const mode of ["readonly", "simulation", "recorded"])
  test(`dependency check cannot write in ${mode}`, async ({ page }) => {
    const state = await setup(page, mode);
    await page.goto(
      `/referee-panel?stale=${mode === "recorded" ? "recorded" : ""}&${mode}#referee-dependencies`,
    );
    await expect(
      page.getByRole("button", { name: "Recheck fixture dependencies" }),
    ).toBeDisabled();
    expect(state.writes).toHaveLength(0);
  });

for (const locale of ["zh-Hans", "zh-Hant", "en"])
  for (const theme of ["light", "dark"])
    test(`dependency check ${locale} ${theme} fits and remains accessible`, async ({
      page,
    }, testInfo) => {
      await setup(page);
      if (testInfo.project.name === "mobile")
        await page.setViewportSize({ width: 320, height: 720 });
      await page.goto(
        `/referee-panel?stale&locale=${locale}&theme=${theme}#referee-dependencies`,
      );
      const check = page.locator("#referee-dependencies");
      await expect(check).toBeFocused();
      await expect(check.getByRole("button")).toBeEnabled();
      expect(
        await check.evaluate((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.left >= 0 &&
            r.right <= innerWidth &&
            r.top >= 0 &&
            r.bottom <= innerHeight
          );
        }),
      ).toBe(true);
      if (locale === "zh-Hant") {
        expect(
          (
            await new AxeBuilder({ page })
              .include("#referee-dependencies")
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.screenshot({
          path: `docs/verification/issue-766/${testInfo.project.name}-${theme}.png`,
        });
      }
    });
