import { expect, test } from "@playwright/test";
const draft = "2002";
test(`removing a coach preserves the pending add draft ${draft}`, async ({
  page,
}) => {
  const requests: { command: { action: string; userId: number } }[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/teams",
    async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true } });
    },
  );
  await page.goto("/team-coach-draft");
  const input = page.getByRole("spinbutton", { name: "Coach osu! ID" });
  await input.fill(draft);
  await page
    .getByRole("button", { name: "Remove coach Synthetic Coach" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Coach removed.");
  await expect(input).toHaveValue(draft);
  await page.getByRole("button", { name: "Add coach", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Coach added.");
  await expect(input).toHaveValue("");
  expect(requests.map((r) => r.command)).toEqual([
    { action: "remove_coach", teamId: "synthetic-team", userId: 1001 },
    { action: "add_coach", teamId: "synthetic-team", userId: Number(draft) },
  ]);
});
test("a failed removal preserves the pending add draft", async ({ page }) => {
  await page.route("**/api/admin/tournaments/synthetic/teams", (route) =>
    route.fulfill({ status: 409, json: { error: "Synthetic conflict" } }),
  );
  await page.goto("/team-coach-draft");
  await page.getByRole("spinbutton", { name: "Coach osu! ID" }).fill("2002");
  await page
    .getByRole("button", { name: "Remove coach Synthetic Coach" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Synthetic conflict");
  await expect(
    page.getByRole("spinbutton", { name: "Coach osu! ID" }),
  ).toHaveValue("2002");
});
