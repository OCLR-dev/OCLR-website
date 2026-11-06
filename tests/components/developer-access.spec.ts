import { test, expect } from "@playwright/test";

// Port parsing/authorization live in unit/integration tests. This exercises the
// actual editor's add/remove, Enter handling, pending state and submitted list.
test("edits and submits multiple ports without losing an unfinished entry", async ({
  page,
}) => {
  const submitted: unknown[] = [];
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/developer/tokens", async (route) => {
    submitted.push(route.request().postDataJSON());
    await pending;
    await route.fulfill({
      status: 400,
      json: { error: "This local origin is not allowed." },
    });
  });
  await page.goto("/developer-access");
  const input = page.getByRole("textbox", {
    name: "Add local port",
    exact: true,
  });
  const create = page.getByRole("button", {
    name: "Create token",
    exact: true,
  });
  await input.fill("5173");
  await expect(create).toBeDisabled();
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Remove port 5173", exact: true }),
  ).toBeVisible();
  expect(submitted).toHaveLength(0);
  await input.fill("5173");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toHaveText(
    "This port is already in the list.",
  );
  await input.fill("4000");
  await page.getByRole("button", { name: "Add port", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove port 3000", exact: true })
    .click();
  await create.click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0]).toMatchObject({ ports: [5173, 4000] });
  await expect(input).toBeDisabled();
  finish();
  await expect(page.getByRole("alert")).toHaveText(
    "This local origin is not allowed.",
  );
  await expect(input).toBeEnabled();
  await page
    .getByRole("button", { name: "Remove port 5173", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove port 4000", exact: true })
    .click();
  await expect(create).toBeDisabled();
});

test("shows the configured server ceiling and disabled state", async ({
  page,
}) => {
  await page.goto("/developer-access?restricted");
  await page
    .getByRole("textbox", { name: "Add local port", exact: true })
    .fill("4000");
  await page.getByRole("button", { name: "Add port", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "This port is not allowed by the server.",
  );
  await page.goto("/developer-access?disabled");
  await expect(
    page.getByRole("button", { name: "Create token", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "Add local port", exact: true }),
  ).toBeDisabled();
});
