import { expect, test } from "@playwright/test";

for (const failure of ["http", "network"] as const) {
  test(`staff identity ${failure} failure remains visible after discarding the candidate and permits a verified retry`, async ({
    page,
  }) => {
    let writes = 0;
    let lookups = 0;
    const httpError = "The action could not be completed.";
    const networkError =
      "Connection interrupted. Refresh to check the saved state before retrying.";
    await page.route("**/api/osu-images/avatar/*", (route) => route.abort());
    await page.route(
      "**/api/admin/tournaments/history-test/archive-staff",
      async (route) => {
        lookups++;
        expect(route.request().postDataJSON()).toMatchObject({
          staffIndex: 0,
          username: "Historical Host",
          expectedRevision: 0,
        });
        await route.fulfill({
          json: { osuId: 91005, username: "Synthetic Host", avatarUrl: null },
        });
      },
    );
    await page.route("**/api/admin/tournaments/history-test", async (route) => {
      writes++;
      expect(route.request().postDataJSON()).toMatchObject({
        action: "resolve-archive-staff",
        staffIndex: 0,
        osuId: 91005,
        expectedRevision: 0,
        identityConfirmed: true,
        confirmed: true,
      });
      if (writes > 1) await route.fulfill({ json: { saved: true } });
      else if (failure === "http")
        await route.fulfill({ status: 409, json: { error: httpError } });
      else await route.abort("failed");
    });
    await page.goto("/archive-importer?staff");
    const region = page.getByRole("region", {
      name: "Historical staff identities",
    });
    const lookup = region.getByRole("button", {
      name: "Look up osu! username",
      exact: true,
    });
    const link = region.getByRole("button", {
      name: "Link historical staff identity",
      exact: true,
    });
    const verifyAndSave = async () => {
      await lookup.click();
      await expect(region.getByRole("status")).toContainText("Synthetic Host");
      await expect(link).toBeDisabled();
      await region
        .getByLabel("Identity confirmation source", { exact: true })
        .fill("Synthetic independent source");
      await region.getByRole("checkbox").check();
      await link.click();
      await page
        .getByRole("dialog", {
          name: "Link historical staff identity",
          exact: true,
        })
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
    };
    await verifyAndSave();
    await expect.poll(() => writes).toBe(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(region.getByRole("status")).toHaveCount(0);
    await expect(region.getByRole("alert")).toHaveText(
      failure === "http" ? httpError : networkError,
    );
    await expect(link).toHaveCount(0);
    await verifyAndSave();
    await expect.poll(() => writes).toBe(2);
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(region.getByRole("alert")).toHaveCount(0);
    expect(lookups).toBe(2);
  });
}
