import { test, expect } from "@playwright/test";
import type { HistoricalPoolChoice } from "../../src/lib/exhibition-pools";

const source = (id: string): HistoricalPoolChoice => ({
  editionSlug: `synthetic-${id}`,
  editionName: `History ${id}`,
  poolId: `pool-${id}`,
  poolName: `Pool ${id}`,
  fingerprint: id.repeat(64),
  maps: [
    {
      key: "NM1",
      slot: "NM1",
      category: "NM",
      beatmapId: id === "a" ? 111 : 222,
      title: `Map ${id}`,
    },
  ],
});

for (const reload of ["refresh", "reopen"]) {
  test(`${reload} recovers when the selected source edition is removed`, async ({
    page,
  }) => {
    let sources = [source("a"), source("b")];
    let reads = 0;
    const writes: Record<string, unknown>[] = [];
    await page.route(
      "**/api/admin/tournaments/synthetic/mappools/history",
      (route) => {
        reads++;
        return route.fulfill({ json: sources });
      },
    );
    await page.route("**/api/admin/tournaments/synthetic/mappools", (route) => {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: {} });
    });
    await page.goto("/exhibition-pool-import");
    const summary = page.locator("summary");
    await summary.click();
    const edition = page.getByRole("combobox", { name: "Source tournament" });
    await edition.selectOption("synthetic-b");
    await page.getByRole("checkbox", { name: /Map b/ }).check();
    sources = [source("a")];
    if (reload === "refresh") {
      await page
        .getByRole("button", { name: "Refresh historical mappools" })
        .click();
    } else {
      await summary.click();
      await summary.click();
    }
    await expect.poll(() => reads).toBe(2);
    await expect(edition).toHaveValue("synthetic-a");
    const map = page.getByRole("checkbox", { name: /Map a/ });
    await expect(map).not.toBeChecked();
    const add = page.getByRole("button", {
      name: "Add selected maps",
      exact: true,
    });
    await expect(add).toBeDisabled();
    expect(writes).toHaveLength(0);
    await map.check();
    await add.click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({
      sourceEdition: "synthetic-a",
      sourcePool: "pool-a",
      sourceKeys: ["NM1"],
      sourceFingerprint: "a".repeat(64),
    });
  });
}

test("refresh preserves an available edition and distinguishes an empty source list", async ({
  page,
}) => {
  let sources = [source("a"), source("b")];
  let reads = 0;
  await page.route(
    "**/api/admin/tournaments/synthetic/mappools/history",
    (route) => {
      reads++;
      return route.fulfill({ json: sources });
    },
  );
  await page.goto("/exhibition-pool-import");
  const summary = page.locator("summary");
  await summary.click();
  const edition = page.getByRole("combobox", { name: "Source tournament" });
  await edition.selectOption("synthetic-b");
  await page.getByRole("checkbox", { name: /Map b/ }).check();
  const refresh = page.getByRole("button", {
    name: "Refresh historical mappools",
  });
  await refresh.click();
  await expect.poll(() => reads).toBe(2);
  await expect(edition).toHaveValue("synthetic-b");
  await expect(page.getByRole("checkbox", { name: /Map b/ })).not.toBeChecked();
  sources = [];
  await refresh.click();
  await expect(
    page.getByText("No published historical mappools available.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(edition).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add selected maps", exact: true }),
  ).toHaveCount(0);
  sources = [source("a")];
  await summary.click();
  await summary.click();
  await expect(edition).toHaveValue("synthetic-a");
  await expect(page.getByRole("checkbox", { name: /Map a/ })).not.toBeChecked();
});
