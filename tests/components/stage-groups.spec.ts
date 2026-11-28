import { test, expect, type Page, type Locator } from "@playwright/test";
const teamId = (index: number) => `00000000-0000-4000-8000-00000000000${index}`;
async function pointerMove(page: Page, handle: Locator, target: Locator) {
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  await target.scrollIntoViewIfNeeded();
  const to = await target.boundingBox();
  // Restore the source into view before starting capture; targets are within the same board.
  await handle.scrollIntoViewIfNeeded();
  const start = await handle.boundingBox();
  expect(from && to && start).toBeTruthy();
  await page.mouse.move(
    start!.x + start!.width / 2,
    start!.y + start!.height / 2,
  );
  await page.mouse.down();
  // Selection affordances can change card height while the pointer is captured.
  const destination = await target.boundingBox();
  await page.mouse.move(
    destination!.x + destination!.width / 2,
    destination!.y + 32,
    { steps: 12 },
  );
  await page.mouse.up();
}
test("generates cards, moves teams by drag, picker and keyboard without saving early", async ({
  page,
  isMobile,
}, info) => {
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/matches",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/stage-groups");
  await page.getByLabel("Group count", { exact: true }).selectOption("2");
  await page
    .getByRole("button", { name: "Generate groups", exact: true })
    .click();
  const a = page.getByRole("article", { name: "Group A", exact: true }),
    b = page.getByRole("article", { name: "Group B", exact: true });
  await expect(page.locator(".group-assignment-card")).toHaveCount(2);
  if (isMobile) {
    await page
      .getByRole("button", { name: "Select team Atlas", exact: true })
      .click();
    await a
      .getByRole("button", { name: "Move selected team here", exact: true })
      .click();
  } else
    await pointerMove(
      page,
      page.getByRole("button", { name: "Drag team Atlas", exact: true }),
      a,
    );
  await expect(
    a.getByRole("button", { name: "Select team Atlas", exact: true }),
  ).toBeVisible();
  await a.getByRole("combobox").selectOption(teamId(2));
  await page
    .getByRole("button", { name: "Select team Cobalt", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await b
    .getByRole("button", { name: "Move selected team here", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await b.getByRole("combobox").selectOption(teamId(4));
  expect(writes).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Save group assignments", exact: true }),
  ).toBeEnabled();
  if (isMobile) await b.getByRole("combobox").selectOption(teamId(1));
  else
    await pointerMove(
      page,
      a.getByRole("button", { name: "Drag team Atlas", exact: true }),
      b,
    );
  await expect(
    a.getByRole("button", { name: "Select team Atlas", exact: true }),
  ).toHaveCount(0);
  await expect(
    b.getByRole("button", { name: "Select team Atlas", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Save group assignments", exact: true }),
  ).toBeEnabled();
  await a.getByRole("combobox").selectOption(teamId(1));
  await page
    .getByRole("button", { name: "Save group assignments", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    expectedVersion: 7,
    published: false,
    configuration: {
      groups: [
        { name: "A", teamIds: [teamId(2), teamId(1)] },
        { name: "B", teamIds: [teamId(3), teamId(4)] },
      ],
    },
  });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`groups-${theme}.png`),
      fullPage: true,
    });
  }
});
test("saves the group count before assigning teams and counts only current teams", async ({
  page,
}) => {
  await page.goto("/stage-groups?saved&stale");
  const group = page.getByRole("article", { name: "Group Alpha", exact: true });
  await expect(group.locator(".badge")).toHaveText("0");
  await expect(group.getByText("Drop teams here")).toBeVisible();
  await page.getByLabel("Group count", { exact: true }).selectOption("4");
  await page
    .getByRole("button", { name: "Apply group count", exact: true })
    .click();
  const save = page.getByRole("button", {
    name: "Save group assignments",
    exact: true,
  });
  await expect(save).toBeEnabled();
  await page.getByRole("switch").click();
  await expect(save).toBeDisabled();
});
test("resizes existing groups without losing stable identities and confirms returning assigned teams", async ({
  page,
}) => {
  let payload: Record<string, unknown> = {};
  await page.route(
    "**/api/admin/tournaments/synthetic/matches",
    async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/stage-groups?saved=1");
  await page.getByLabel("Group count", { exact: true }).selectOption("3");
  await page
    .getByRole("button", { name: "Apply group count", exact: true })
    .click();
  await page
    .getByRole("article", { name: "Group C", exact: true })
    .getByRole("combobox")
    .selectOption(teamId(5));
  await page.getByLabel("Group count", { exact: true }).selectOption("2");
  await page
    .getByRole("button", { name: "Apply group count", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Teams in removed groups",
  );
  await page
    .getByRole("alert")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.locator(".group-assignment-card")).toHaveCount(3);
  const moveNotice = page.locator(".group-assignment-status");
  await expect(moveNotice).toContainText("Echo moved to C.");
  await page.getByLabel("Group count", { exact: true }).selectOption("2");
  await page
    .getByRole("button", { name: "Apply group count", exact: true })
    .click();
  await page
    .getByRole("alert")
    .getByRole("button", { name: "Apply group count", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Unassigned teams", exact: true })
      .getByRole("button", { name: "Select team Echo", exact: true }),
  ).toBeVisible();
  await expect(moveNotice).toBeEmpty();
  await page.getByLabel("Group name 1", { exact: true }).fill("Renamed Alpha");
  await page
    .getByRole("button", { name: "Save group assignments", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  expect(payload).toMatchObject({
    configuration: {
      groups: [
        { key: "g-a", name: "Renamed Alpha", teamIds: [teamId(1), teamId(2)] },
        { key: "g-b", name: "Beta", teamIds: [teamId(3), teamId(4)] },
      ],
    },
  });
});
test("keeps read-only controls and drag sources disabled", async ({ page }) => {
  await page.goto("/stage-groups?saved=1&readonly=1");
  await expect(page.getByLabel("Group count", { exact: true })).toBeDisabled();
  await expect(page.getByRole("switch")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Randomize groups", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Select team Atlas", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Drag team Atlas", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save group assignments", exact: true }),
  ).toBeDisabled();
  expect(await page.locator('.group-team-card[draggable="true"]').count()).toBe(
    0,
  );
});
test("randomizes a balanced draft and saves it only after confirmation", async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/matches",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/stage-groups?saved=1");
  const randomize = page.getByRole("button", {
    name: "Randomize groups",
    exact: true,
  });
  const count = page.getByLabel("Group count", { exact: true });
  await count.selectOption("3");
  await expect(randomize).toBeDisabled();
  await count.selectOption("2");
  await randomize.click();
  const dialog = page.getByRole("dialog", {
    name: "Randomize group assignments?",
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save group assignments", exact: true }),
  ).toBeDisabled();
  await expect(randomize).toBeFocused();
  await randomize.click();
  await dialog
    .getByRole("button", { name: "Randomize groups", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Unassigned teams", exact: true }),
  ).toContainText("None");
  expect(writes).toHaveLength(0);

  await page
    .getByRole("button", { name: "Save group assignments", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({
    action: "stage_groups",
    expectedVersion: 7,
    published: false,
    configuration: {
      groups: [
        { key: "g-a", name: "Alpha" },
        { key: "g-b", name: "Beta" },
      ],
    },
  });
  const { groups } = writes[0].configuration as {
    groups: { teamIds: string[] }[];
  };
  expect(groups.map(({ teamIds }) => teamIds.length).sort()).toEqual([2, 3]);
  expect(groups.flatMap(({ teamIds }) => teamIds).sort()).toEqual(
    [1, 2, 3, 4, 5].map(teamId),
  );
});
test("keeps the publication switch at the top and applies changes only after save confirmation", async ({
  page,
}, info) => {
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/matches",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    },
  );
  for (const initiallyPublished of [false, true]) {
    await page.goto(
      `/stage-groups?saved=1${initiallyPublished ? "&published=1" : ""}`,
    );
    const publication = page.getByRole("switch", {
      name: "Publish approved group assignments",
      exact: true,
    });
    const save = page.getByRole("button", {
      name: "Save group assignments",
      exact: true,
    });
    await expect(publication).toBeChecked({ checked: initiallyPublished });
    await expect(save).toBeDisabled();
    expect(
      await publication.evaluate((element) =>
        element
          .closest(".team-group-manager")!
          .firstElementChild!.contains(element),
      ),
    ).toBe(true);
    await publication.focus();
    await page.keyboard.press("Space");
    await expect(publication).toBeChecked({ checked: !initiallyPublished });
    await expect(save).toBeEnabled();
    await expect(
      page.getByText("Unsaved changes", { exact: true }),
    ).toBeVisible();
    expect(writes).toHaveLength(initiallyPublished ? 1 : 0);
    await save.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    expect(writes).toHaveLength(initiallyPublished ? 1 : 0);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) => (document.documentElement.dataset.theme = value),
        theme,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(
          `publication-${!initiallyPublished}-${theme}.png`,
        ),
        fullPage: true,
        animations: "disabled",
      });
    }
    await save.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    expect(writes.at(-1)).toMatchObject({
      action: "stage_groups",
      stageId: "00000000-0000-4000-8000-000000000010",
      expectedVersion: 7,
      published: !initiallyPublished,
      confirmed: true,
    });
    expect(writes).toHaveLength(initiallyPublished ? 2 : 1);
  }
});
test("previews the default evening schedule before submitting the confirmed fixtures", async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = [];
  const fingerprint = "a".repeat(64);
  await page.route(
    "**/api/admin/tournaments/synthetic/matches",
    async (route) => {
      const request = route.request().postDataJSON();
      requests.push(request);
      await route.fulfill({
        json:
          request.action === "preview_group_schedule"
            ? {
                fingerprint,
                timeZone: "Asia/Taipei",
                matches: [
                  {
                    group: "Alpha",
                    homeTeamId: teamId(1),
                    awayTeamId: teamId(2),
                    scheduledAt: "2026-12-05T12:00:00.000Z",
                    position: 1,
                  },
                ],
              }
            : {},
      });
    },
  );
  await page.goto("/stage-groups?saved&schedule");
  await page.getByText("Automatic group schedule", { exact: true }).click();
  for (const [index, time] of ["20:00", "21:00", "22:00"].entries()) {
    await expect(
      page.getByLabel(`Match time ${index + 1}`, { exact: true }),
    ).toHaveValue(time);
  }
  const generate = page.getByRole("button", {
    name: "Preview group schedule",
    exact: true,
  });
  await expect(generate).toBeDisabled();
  await page
    .getByLabel("Schedule start date", { exact: true })
    .fill("2026-12-02");
  await expect(generate).toBeDisabled();
  const endDate = page.getByLabel("Schedule end date", { exact: true });
  await endDate.fill("2026-12-01");
  await expect(generate).toBeDisabled();
  await expect(endDate).toHaveAttribute("aria-invalid", "true");
  await endDate.fill("2026-12-05");
  await generate.click();
  await expect(page.getByText("Atlas · Birch", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    action: "preview_group_schedule",
    expectedVersion: 7,
    startDate: "2026-12-02",
    endDate: "2026-12-05",
    times: ["20:00", "21:00", "22:00"],
  });
  await page
    .getByRole("button", { name: "Create group matches", exact: true })
    .click();
  expect(requests).toHaveLength(1);
  await page
    .getByRole("dialog", { name: "Create these group matches?" })
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page.getByText("Group matches created.", { exact: false }),
  ).toBeVisible();
  expect(requests[1]).toMatchObject({
    action: "create_group_schedule",
    expectedFingerprint: fingerprint,
    endDate: "2026-12-05",
    confirmed: true,
  });
});
test("supports native card dragging", async ({ page, isMobile }) => {
  test.skip(isMobile, "Pointer handle and picker cover touch devices");
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("/stage-groups");
  await page.getByLabel("Group count", { exact: true }).selectOption("1");
  await page
    .getByRole("button", { name: "Generate groups", exact: true })
    .click();
  const group = page.getByRole("article", { name: "Group A", exact: true });
  await page
    .getByRole("button", { name: "Select team Atlas", exact: true })
    .dragTo(group, { targetPosition: { x: 20, y: 20 } });
  await expect(
    group.getByRole("button", { name: "Select team Atlas", exact: true }),
  ).toBeVisible();
});
