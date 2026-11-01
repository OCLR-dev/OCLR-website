import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`${theme}: captain sees the full team without choosing a player and saves only their own slots`, async ({
    page,
  }) => {
    const writes: Record<string, unknown>[] = [];
    await page.route(
      "**/api/tournaments/synthetic/player/availability",
      async (route) => {
        writes.push(route.request().postDataJSON());
        await route.fulfill({ json: { saved: true, version: 2 } });
      },
    );
    await page.goto(`/schedule-selection?captain&empty-own&theme=${theme}`);
    const roster = page.getByRole("region", {
      name: "Team availability",
      exact: true,
    });
    const self = roster
      .getByRole("listitem")
      .filter({ hasText: "Synthetic player" });
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(roster.getByRole("listitem")).toHaveCount(3);
    await expect(self).toContainText("Not submitted");
    await expect(
      roster.getByRole("listitem").filter({ hasText: "Unreported player" }),
    ).toContainText("Not submitted");
    await expect(page.locator(".schedule-teammate")).toHaveCount(1);
    await expect(page.locator(".schedule-teammate")).toContainText(
      "Synthetic teammate",
    );
    await expect(page.locator(".schedule-own")).toHaveCount(0);
    await page.locator(".schedule-teammate").click();
    await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
    await page
      .getByLabel("Available from: date", { exact: true })
      .fill("2026-11-01");
    await page
      .getByLabel("Available from: time (HH:mm)", { exact: true })
      .fill("18:00");
    await page
      .getByLabel("Available until: date", { exact: true })
      .fill("2026-11-01");
    await page
      .getByLabel("Available until: time (HH:mm)", { exact: true })
      .fill("19:00");
    await expect(page.locator(".schedule-selection")).toHaveCount(1);
    await expect(page.locator(".schedule-teammate")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Add time slot", exact: true })
      .click();
    await expect(page.locator(".schedule-own")).toContainText(
      "Synthetic player",
    );
    await expect(self).toContainText("Not submitted"); // The roster reflects saved reports.
    await page
      .getByRole("button", { name: "Save season timetable", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Saved");
    await expect(self).not.toContainText("Not submitted");
    await expect(page.locator(".schedule-teammate")).toHaveCount(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({
      action: "save_availability",
      expectedVersion: 1,
      requestKey: expect.any(String),
      intervals: [
        { start: "2026-11-01T10:00:00.000Z", end: "2026-11-01T11:00:00.000Z" },
      ],
    });
  });

  test(`${theme}: read-only captain keeps the team overview and ordinary players see only themselves`, async ({
    page,
  }) => {
    await page.goto(`/schedule-selection?captain&readonly&theme=${theme}`);
    await expect(page.locator(".schedule-own")).toContainText(
      "Synthetic player",
    );
    await expect(page.locator(".schedule-teammate")).toContainText(
      "Synthetic teammate",
    );
    await expect(
      page
        .getByRole("region", { name: "Team availability", exact: true })
        .getByRole("listitem"),
    ).toHaveCount(3);
    await expect(
      page.getByRole("button", {
        name: /Add time slot|Save season timetable|^Edit |^Remove /,
      }),
    ).toHaveCount(0);
    await page.goto(`/schedule-selection?theme=${theme}`);
    await expect(page.locator(".schedule-own")).toHaveCount(1);
    await expect(page.locator(".schedule-teammate")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Team availability", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
  });
}
