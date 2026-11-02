import { expect, test } from "@playwright/test";
test.use({ timezoneId: "Asia/Taipei" });
const slot = (hour: string) =>
  `button[data-start="2026-11-01T${hour}:00.000Z"]`;
for (const theme of ["light", "dark"]) {
  test(`${theme}: captain compares all eligible rows and saves only their own states`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const writes: Record<string, unknown>[] = [];
    await page.route(
      "**/api/tournaments/synthetic/player/availability",
      async (route) => {
        writes.push(route.request().postDataJSON());
        await route.fulfill({ json: { saved: true, version: 2 } });
      },
    );
    await page.goto(`/schedule-selection?captain&theme=${theme}`);
    const roster = page.getByRole("region", {
      name: "Team availability",
      exact: true,
    });
    const day = roster.locator("section").last();
    await expect(day.getByRole("rowheader")).toHaveCount(3);
    await expect(
      day.getByRole("rowheader").filter({ hasText: "Unreported player" }),
    ).toContainText("Not submitted");
    await expect(day.locator('tr[data-own="false"] button')).toHaveCount(0);
    const cell = day.locator(slot("10:00"));
    expect(
      await day
        .locator(slot("11:00"))
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe("rgba(0, 0, 0, 0)");
    await cell.click();
    await expect(cell).toHaveAccessibleName(/Unsure$/);
    await expect(
      page.getByText("Unsaved changes", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(cell).toHaveAccessibleName(/Available$/);
    await cell.click();
    await page.getByRole("radio", { name: "UTC+0", exact: true }).check();
    await expect(cell).toHaveAccessibleName(/10:00 UTC\+0 · Unsure$/);
    await page.getByRole("radio", { name: "Local time", exact: true }).check();
    await page
      .getByRole("button", { name: "Save season timetable", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Saved");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({
      action: "save_availability",
      expectedVersion: 1,
      requestKey: expect.any(String),
      intervals: [
        {
          start: "2026-11-01T10:00:00.000Z",
          end: "2026-11-01T10:30:00.000Z",
          status: "unsure",
        },
        { start: "2026-11-01T10:30:00.000Z", end: "2026-11-01T11:00:00.000Z" },
      ],
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`timetable-${theme}.png`),
      fullPage: true,
    });
  });
  test(`${theme}: mouse and touch drag use the origin state over mixed cells and undo restores the stroke`, async ({
    page,
    isMobile,
  }) => {
    await page.goto(`/schedule-selection?captain&theme=${theme}`);
    const first = page.locator(slot("10:00")),
      last = page.locator(slot("11:00"));
    await first.click(); // Available -> Unsure.
    await last.scrollIntoViewIfNeeded();
    const a = (await first.boundingBox())!,
      b = (await last.boundingBox())!;
    if (isMobile) {
      const touch = await page.context().newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await touch.detach();
    } else {
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {
        steps: 8,
      });
      await page.mouse.up();
    }
    for (const hour of ["10:00", "10:30", "11:00"])
      await expect(page.locator(slot(hour))).toHaveAccessibleName(/Unsure$/);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(first).toHaveAccessibleName(/Unsure$/);
    await expect(last).toHaveAccessibleName(/Not filled in$/);
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(slot("10:30"))).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator(slot("10:30"))).toHaveAccessibleName(/Unsure$/);
  });
  test(`${theme}: read-only rows cannot edit; ordinary players retain only their own visibility`, async ({
    page,
  }) => {
    await page.goto(`/schedule-selection?captain&readonly&theme=${theme}`);
    await expect(
      page
        .getByRole("region", { name: "Team availability", exact: true })
        .locator("tbody tr"),
    ).toHaveCount(21);
    await expect(page.locator("button[data-slot]")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save season timetable", exact: true }),
    ).toHaveCount(0);
    await page.goto(`/schedule-selection?theme=${theme}`);
    await expect(
      page.getByRole("region", { name: "Team availability", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Synthetic teammate", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: "My availability", exact: true })
        .locator("tbody tr"),
    ).toHaveCount(7);
  });
}
test("local/UTC midnight conversion retains draft instants", async ({
  page,
}) => {
  await page.goto("/schedule-selection?captain");
  await page.getByLabel("Week containing", { exact: true }).fill("2026-11-02");
  const monday = page.locator('button[data-start="2026-11-01T16:00:00.000Z"]');
  await monday.click();
  await expect(monday).toHaveAccessibleName(
    /2026-11-02 · 00:00 UTC\+8 · Available$/,
  );
  await page.getByRole("radio", { name: "UTC+0", exact: true }).check();
  await page.getByLabel("Week containing", { exact: true }).fill("2026-11-01");
  const sunday = page.locator('button[data-start="2026-11-01T16:00:00.000Z"]');
  await expect(sunday).toHaveAccessibleName(
    /2026-11-01 · 16:00 UTC\+0 · Available$/,
  );
});

test.describe("clock changes", () => {
  test.use({ timezoneId: "America/New_York" });
  test("repeated local hours have distinct offsets and edit different UTC instants", async ({
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
    await page.goto("/schedule-selection?empty-own&captain");
    const early = page.locator('button[data-start="2026-11-01T05:30:00.000Z"]');
    const late = page.locator('button[data-start="2026-11-01T06:30:00.000Z"]');
    await expect(early).toHaveAccessibleName(/01:30 UTC-4 · Not filled in$/);
    await expect(late).toHaveAccessibleName(/01:30 UTC-5 · Not filled in$/);
    await late.click();
    await expect(early).toHaveAccessibleName(/Not filled in$/);
    await expect(late).toHaveAccessibleName(/Available$/);
    await page
      .getByRole("button", { name: "Save season timetable", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Saved");
    expect(writes[0].intervals).toEqual([
      { start: "2026-11-01T06:30:00.000Z", end: "2026-11-01T07:00:00.000Z" },
    ]);
  });
});
test("cycles every state, paints backwards and retries the same save", async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/tournaments/synthetic/player/availability",
    async (route) => {
      writes.push(route.request().postDataJSON());
      if (writes.length === 1) await route.abort();
      else await route.fulfill({ json: { saved: true, version: 2 } });
    },
  );
  await page.goto("/schedule-selection?captain");
  const first = page.locator(slot("10:00")),
    last = page.locator(slot("11:00"));
  await first.click();
  await first.click();
  await expect(first).toHaveAccessibleName(/Unavailable$/);
  await first.click();
  await expect(first).toHaveAccessibleName(/Not filled in$/);
  await first.click();
  await expect(first).toHaveAccessibleName(/Available$/);
  await last.click(); // Unfilled -> Available, then Unsure.
  await last.click();
  await first.scrollIntoViewIfNeeded();
  const a = (await last.boundingBox())!,
    b = (await first.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  for (const hour of ["10:00", "10:30", "11:00"])
    await expect(page.locator(slot(hour))).toHaveAccessibleName(/Unsure$/);
  await page
    .getByRole("button", { name: "Save season timetable", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Save season timetable", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Saved");
  expect(writes[0]).toEqual(writes[1]);
});
