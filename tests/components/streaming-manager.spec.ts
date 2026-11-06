import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("selects multiple commentators, retains the draft after a revision conflict, and refreshes all bookings", async ({
  page,
}, testInfo) => {
  const writes: Record<string, unknown>[] = [];
  const booking = (userId: number, username: string) => ({
    userId,
    username,
    source: "staff",
    assignedBy: 999,
    assignedByName: "Synthetic Organizer",
    assignedAt: "2030-01-01T00:00:00Z",
    eligible: true,
    needsConfirmation: false,
    conflicts: [],
  });
  const existing = booking(2003, "Existing Commentator");
  let fixture = { streamRevision: 8, commentators: [existing] };
  await page.route("**/synthetic-streaming-state", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.route(
    "**/api/admin/tournaments/synthetic/streaming/*",
    async (route) => {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1) {
        fixture = { ...fixture, streamRevision: 9 };
        await route.fulfill({
          status: 409,
          json: {
            error:
              "The fixture or streaming task changed. Refresh before continuing.",
          },
        });
      } else {
        fixture = {
          streamRevision: 10,
          commentators: [
            existing,
            booking(2001, "Synthetic Commentator"),
            booking(2002, "Second Commentator"),
          ],
        };
        await route.fulfill({ json: { saved: true } });
      }
    },
  );
  await page.goto("/streaming-manager?existing&refresh");
  const commentary = page.getByRole("region", {
    name: "Commentators",
    exact: true,
  });
  await commentary.getByText("Choose Commentators", { exact: true }).click();
  await expect(
    commentary.getByRole("checkbox", { name: /Existing Commentator/ }),
  ).toHaveCount(0);
  const first = commentary.getByRole("checkbox", {
    name: "Synthetic Commentator · 2001",
    exact: true,
  });
  const second = commentary.getByRole("checkbox", {
    name: "Second Commentator · 2002",
    exact: true,
  });
  await first.focus();
  await page.keyboard.press("Space");
  await second.check();
  await second.uncheck();
  await second.check();
  await expect(
    commentary.getByText("Same start time as: Other commentary match", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await commentary.screenshot({
    path: testInfo.outputPath("commentator-multi-select.png"),
  });
  expect(
    (
      await new AxeBuilder({ page })
        .include("article")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const assign = commentary.getByRole("button", {
    name: "Assign Commentator",
    exact: true,
  });
  await assign.click();
  expect(writes).toHaveLength(0);
  await expect(page.getByRole("dialog")).toContainText(
    "Synthetic Commentator · 2001, Second Commentator · 2002",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(commentary.getByRole("alert")).toContainText(
    "The fixture or streaming task changed.",
  );
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();
  await assign.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    commentary.getByRole("group", { name: "Second Commentator", exact: true }),
  ).toBeVisible();
  await expect(
    commentary.getByRole("group", {
      name: "Existing Commentator",
      exact: true,
    }),
  ).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[0]).toMatchObject({
    task: "commentary",
    action: "assign",
    userIds: [2001, 2002],
    expectedRevision: 8,
    expectedFixtureVersion: 4,
  });
  expect(writes[1]).toMatchObject({
    userIds: [2001, 2002],
    expectedRevision: 9,
  });
  expect(writes[1].requestKey).not.toBe(writes[0].requestKey);
  await page.reload();
  await expect(
    page.getByRole("group", { name: "Second Commentator", exact: true }),
  ).toBeVisible();
});

test("keeps compact booking actions accessible and sends versioned changes only after confirmation", async ({
  page,
  isMobile,
}) => {
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/streaming/*",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/streaming-manager");
  const card = page.getByRole("article", {
    name: "Synthetic Broadcast Test",
    exact: true,
  });
  await expect(card.locator("details")).toHaveCount(1);
  await expect(card.getByText("Staff-assigned", { exact: true })).toHaveCount(
    0,
  );
  await expect(card.getByText("Asia/Taipei", { exact: true })).toHaveCount(0);
  await expect(card.getByText("Alpha vs Beta", { exact: true })).toBeVisible();
  await expect(card.getByText(/UTC\+8/)).toBeVisible();
  const streamer = card.getByRole("region", { name: "Streamer", exact: true });
  const picker = streamer.getByRole("combobox", {
    name: "Assign Streamer",
    exact: true,
  });
  const reassign = streamer.getByRole("button", {
    name: "Reassign Streamer",
    exact: true,
  });
  if (!isMobile) {
    const selectBox = (await picker.boundingBox())!;
    const buttonBox = (await reassign.boundingBox())!;
    expect(Math.abs(selectBox.y - buttonBox.y)).toBeLessThan(2);
  }
  await picker.selectOption("1002");
  await reassign.click();
  expect(writes).toHaveLength(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(writes).toHaveLength(0);
  await reassign.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({
    action: "assign",
    userId: 1002,
    expectedRevision: 8,
    expectedFixtureVersion: 4,
    confirmed: true,
  });
  expect(writes[0].requestKey).toMatch(/^[\da-f-]{36}$/);
  await card
    .getByRole("button", { name: "Cancel streaming task", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({
    action: "cancel",
    expectedRevision: 8,
    expectedFixtureVersion: 4,
  });
  const commentary = card.getByRole("region", {
    name: "Commentators",
    exact: true,
  });
  await commentary.getByText("Choose Commentators", { exact: true }).click();
  await commentary
    .getByRole("checkbox", {
      name: "Synthetic Commentator · 2001",
      exact: true,
    })
    .check();
  await commentary
    .getByRole("button", { name: "Assign Commentator", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(3);
  expect(writes[2]).toMatchObject({
    action: "assign",
    task: "commentary",
    userIds: [2001],
  });
});

test("retains actionable warnings and read-only boundaries", async ({
  page,
}) => {
  await page.goto("/streaming-manager?warnings=1&readonly=1");
  await expect(page.getByText(/Streamer access was revoked/)).toBeVisible();
  await expect(page.getByText(/Schedule changed/)).toBeVisible();
  await expect(
    page.getByText(/Same start time as: Simultaneous Match/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reconfirm booking", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Cancel streaming task", exact: true }),
  ).toBeDisabled();
  await page.getByText("Choose Commentators", { exact: true }).click();
  await expect(page.getByRole("checkbox").first()).toBeDisabled();
});

test("keeps Streamer and Commentator self-selection distinct", async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/streaming/*",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    },
  );
  for (const role of ["streamer", "commentary"]) {
    await page.goto(`/streaming-manager?self=${role}`);
    await expect(page.getByRole("combobox", { name: /^Assign/ })).toHaveCount(
      0,
    );
    const label =
      role === "streamer" ? "Stream this match" : "Commentate this match";
    await page.getByRole("button", { name: label, exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect.poll(() => writes.length).toBe(role === "streamer" ? 1 : 2);
    expect(writes.at(-1)).toMatchObject({
      action: "select",
      ...(role === "commentary" ? { task: "commentary" } : {}),
    });
    if (role === "streamer") expect(writes.at(-1)).not.toHaveProperty("task");
  }
});

test("fits long task labels at the workflow viewport", async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 900 });

  const locale = "en";

  const appearance = "default";

  const theme = "light";

  await page.goto(
    `/streaming-manager?locale=${locale}&appearance=${appearance}&theme=${theme}`,
  );
  await expect(page.getByRole("article")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include("article")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
