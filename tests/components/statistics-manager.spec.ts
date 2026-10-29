import { expect, test } from "@playwright/test";
test("failed match switches retain the complete prior context and its draft, then recover", async ({
  page,
}) => {
  const fixtures = [
    {
      id: "A",
      label: "Match A",
      stage: "Final",
      teams: ["A1", "A2"],
      mpIds: [101],
      score: [1, 0],
    },
    {
      id: "B",
      label: "Match B",
      stage: "Final",
      teams: ["B1", "B2"],
      mpIds: [202],
      score: [4, 1],
    },
  ];
  const workspace = (id: string) => ({
    slug: "synthetic",
    fixtures,
    summaries: [],
    pools: [],
    blockers: [],
    canPublish: false,
    reviews: [
      {
        mpId: id === "A" ? 101 : 202,
        version: 1,
        poolId: "",
        complete: true,
        warnings: [],
        games: [],
        allowUnlistedMaps: false,
        excludedScores: [],
        rosterTeamGames: [],
        technicalAdjudication: false,
      },
    ],
  });
  let fail = true;
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/statistics**",
    async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        writes.push(body);
        await route.fulfill({ json: workspace(body.mpId === 101 ? "A" : "B") });
        return;
      }
      const id = new URL(route.request().url()).searchParams.get("fixture")!;
      if (id === "B" && fail)
        await route.fulfill({
          status: 503,
          json: { error: "Synthetic load failure" },
        });
      else await route.fulfill({ json: workspace(id) });
    },
  );
  await page.goto("/statistics-manager");
  const select = page.getByRole("combobox", { name: "Match", exact: true });
  await select.selectOption("A");
  await expect(
    page.getByRole("heading", { name: "MP 101", exact: true }),
  ).toBeVisible();
  // Keep an unsaved draft while a switch fails.
  const draft = page.getByRole("checkbox").first();
  await draft.check();
  await select.selectOption("B");
  await expect(page.getByRole("alert")).toContainText("Synthetic load failure");
  await expect(select).toHaveValue("A");
  await expect(page.getByRole("heading", { name: /Match A/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Match B/ })).toHaveCount(0);
  await expect(draft).toBeChecked();
  await page
    .getByRole("button", { name: "Save statistics review", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ mpId: 101, allowUnlistedMaps: true });
  fail = false;
  await select.selectOption("B");
  await expect(select).toHaveValue("B");
  await expect(
    page.getByRole("heading", { name: "MP 202", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "MP 101", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Save statistics review", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({ mpId: 202 });
  // Importing a different match must not replace the selected match's review
  // if the final reload fails.
  fail = true;
  await page
    .getByRole("row")
    .filter({ hasText: "Match A" })
    .getByRole("button", { name: "Import MP", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await expect(select).toHaveValue("B");
  await expect(
    page.getByRole("heading", { name: "MP 202", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "MP 101", exact: true }),
  ).toHaveCount(0);
});
