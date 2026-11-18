import { test, expect, type Page, type Route } from "@playwright/test";

const endpoint = "/api/tournaments/synthetic-test/players/190004/messages";
const original = {
  id: "synthetic-message",
  authorId: 190001,
  author: "Synthetic Author",
  text: "Original text",
  createdAt: "2026-01-01T00:00:00Z",
  version: "1",
};
const latest = { ...original, text: "Other session edit", version: "2" };
const conflict = "This message has changed. Refresh before trying again.";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
}
async function edit(page: Page) {
  await page.getByRole("button", { name: "Edit message", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Edit message", exact: true })
    .fill("My draft");
  await page.getByRole("button", { name: "Save message", exact: true }).click();
}
async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ json: body, status });
}

test("gallery displays the full history and edits older messages in place", async ({
  page,
}) => {
  const gallery = "/api/wiki/liru-gallery/messages";
  const history = Array.from({ length: 25 }, (_, index) => ({
    ...original,
    id: `comment-${index}`,
    text: `Comment ${index}`,
    authorId: index === 24 ? original.authorId : 190002,
  }));
  const newest = { ...original, id: "new", text: "New gallery comment" };
  const oldest = history.at(-1)!;
  await page.route(`**${gallery}`, (route) =>
    route.request().method() === "GET"
      ? json(route, history)
      : json(route, newest, 201),
  );
  await page.route(`**${gallery}/${oldest.id}`, (route) =>
    route.request().method() === "PATCH"
      ? json(route, { ...oldest, text: "Edited older comment", version: "2" })
      : json(route, {}),
  );

  await page.goto("/?gallery");
  const list = page.getByRole("region", { name: "Messages for Liru Gallery" });
  const rows = list.locator("> div");
  await expect(rows).toHaveCount(25);
  await expect(rows.first()).toContainText(history[0].text);
  await expect(rows.last()).toContainText(oldest.text);
  await expect(
    page.getByRole("group", { name: "Message navigation" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Leave a message" }).click();
  await page.getByRole("textbox").fill(newest.text);
  await page.getByRole("button", { name: "Post message" }).click();
  await expect(rows).toHaveCount(26);
  await expect(rows.first()).toContainText(newest.text);
  await expect(rows.last()).toContainText(oldest.text);

  const oldestRow = rows.last();
  await oldestRow.getByRole("button", { name: "Edit message" }).click();
  const editor = oldestRow.getByRole("textbox", { name: "Edit message" });
  await expect(editor).toBeFocused();
  await editor.fill("Edited older comment");
  await oldestRow.getByRole("button", { name: "Save message" }).click();
  await expect(oldestRow).toContainText("Edited older comment");
  await expect(oldestRow).toBeFocused();
  await oldestRow.getByRole("button", { name: "Delete message" }).click();
  await oldestRow.getByRole("button", { name: "Confirm delete" }).click();
  await expect(rows).toHaveCount(25);
  await expect(list).not.toContainText("Edited older comment");
});

for (const status of [200, 503]) {
  test(`a late initial GET (${status}) cannot hide a successful post or change its selection`, async ({
    page,
  }) => {
    const get = deferred();
    const started = deferred();
    await page.route(`**${endpoint}`, async (route) => {
      if (route.request().method() === "GET") {
        started.resolve();
        await get.promise;
        await json(route, [], status);
      } else
        await json(route, { ...original, text: "Newly saved message" }, 201);
    });
    await page.goto("/");
    await started.promise;
    await page
      .getByRole("button", { name: "Leave a message", exact: true })
      .click();
    await page.getByRole("textbox").fill("Newly saved message");
    await page
      .getByRole("button", { name: "Post message", exact: true })
      .click();
    await expect(page.locator(".event-message-scroll")).toContainText(
      "Newly saved message",
    );
    const response = page.waitForResponse(
      (r) => r.request().method() === "GET" && r.url().endsWith(endpoint),
    );
    get.resolve();
    await (await response).finished();
    await settle(page);
    await expect(page.locator(".event-message-scroll")).toContainText(
      "Newly saved message",
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

for (const operation of ["edit", "delete"] as const) {
  test(`a late locale read cannot undo a confirmed ${operation}`, async ({
    page,
  }) => {
    const get = deferred(),
      started = deferred();
    let reads = 0;
    await page.route(`**${endpoint}`, async (route) => {
      if (++reads === 2) {
        started.resolve();
        await get.promise;
      }
      await json(route, [original]);
    });
    await page.route(`**${endpoint}/*`, (route) =>
      json(
        route,
        operation === "edit"
          ? { ...original, text: "Saved edit", version: "3" }
          : {},
      ),
    );
    await page.goto("/");
    await expect(page.locator(".event-message-scroll")).toContainText(
      original.text,
    );
    await page.getByRole("button", { name: "Switch locale" }).click();
    await started.promise;
    // Use structural selectors here because switching locale updates every label.
    const controls = page.locator(".player-message-controls").first();
    await controls
      .locator("button")
      .nth(operation === "edit" ? 1 : 2)
      .click();
    if (operation === "edit") {
      await page.locator("form textarea").fill("Saved edit");
      await page.locator("form button").first().click();
    } else await page.locator(".player-message-confirm button").first().click();
    const expected = operation === "edit" ? "Saved edit" : "—";
    await expect(page.locator(".event-message-scroll p")).toHaveText(expected);
    const response = page.waitForResponse(
      (r) => r.request().method() === "GET" && r.url().endsWith(endpoint),
    );
    get.resolve();
    await (await response).finished();
    await settle(page);
    await expect(page.locator(".event-message-scroll p")).toHaveText(expected);
  });
}

test("a newer reload wins over the delayed initial read", async ({ page }) => {
  const get = deferred(),
    started = deferred();
  let reads = 0;
  await page.route(`**${endpoint}`, async (route) => {
    if (route.request().method() === "POST")
      return json(route, { error: "Synthetic failure" }, 503);
    if (++reads === 1) {
      started.resolve();
      await get.promise;
      return json(route, []);
    }
    await json(route, [latest]);
  });
  await page.goto("/");
  await started.promise;
  await page
    .getByRole("button", { name: "Leave a message", exact: true })
    .click();
  await page.getByRole("textbox").fill("Retained compose draft");
  await page.getByRole("button", { name: "Post message", exact: true }).click();
  await page.getByRole("button", { name: "Reload messages" }).click();
  await expect(page.locator(".event-message-scroll")).toContainText(
    latest.text,
  );
  const response = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().endsWith(endpoint),
  );
  get.resolve();
  await (await response).finished();
  await settle(page);
  await expect(page.locator(".event-message-scroll")).toContainText(
    latest.text,
  );
  await expect(page.getByRole("textbox")).toHaveValue("Retained compose draft");
});

for (const outcome of ["latest", "deleted", "failure"] as const) {
  test(`conflict recovery with ${outcome} keeps the draft and requires explicit editing`, async ({
    page,
  }) => {
    let reads = 0;
    const patches: unknown[] = [];
    await page.route(`**${endpoint}`, (route) => {
      if (++reads === 1) return json(route, [original]);
      return outcome === "failure"
        ? json(route, {}, 503)
        : json(route, outcome === "latest" ? [latest] : []);
    });
    await page.route(`**${endpoint}/*`, (route) => {
      patches.push(route.request().postDataJSON());
      return patches.length === 1
        ? json(route, { error: conflict }, 409)
        : json(route, { ...latest, text: "My draft", version: "3" });
    });
    await page.goto("/");
    await edit(page);
    await expect(page.getByRole("alert")).toContainText(conflict);
    await expect(
      page.getByRole("button", { name: "Save message" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Reload messages" }).click();
    if (outcome === "failure") {
      await expect(page.getByRole("alert")).toContainText(
        "Messages could not be loaded",
      );
      await expect(
        page.getByRole("textbox", { name: "Edit message", exact: true }),
      ).toHaveValue("My draft");
      await expect(
        page.getByRole("button", { name: "Save message" }),
      ).toBeDisabled();
    } else {
      await expect(
        page.getByRole("textbox", { name: "Your unsaved draft" }),
      ).toHaveValue("My draft");
      await expect(
        page.getByRole("button", { name: "Save message" }),
      ).toHaveCount(0);
      expect(patches).toEqual([{ text: "My draft", version: "1" }]);
      if (outcome === "latest") {
        await expect(page.getByRole("status")).toContainText(latest.text);
        await page
          .getByRole("button", { name: "Edit latest message with this draft" })
          .click();
        await page.getByRole("button", { name: "Save message" }).click();
        await expect(page.locator(".event-message-scroll")).toContainText(
          "My draft",
        );
        expect(patches).toEqual([
          { text: "My draft", version: "1" },
          { text: "My draft", version: "2" },
        ]);
      } else {
        await expect(page.getByRole("status")).toContainText(
          "no longer available",
        );
        await expect(
          page.getByRole("button", {
            name: "Edit latest message with this draft",
          }),
        ).toHaveCount(0);
      }
    }
  });
}

test("late reads from a previous player do not change the next board", async ({
  page,
}) => {
  const started = deferred(),
    get = deferred();
  await page.route(`**${endpoint}`, async (route) => {
    started.resolve();
    await get.promise;
    await json(route, [original]);
  });
  await page.route(
    "**/api/tournaments/synthetic-test/players/190005/messages",
    (route) =>
      json(route, [
        { ...latest, id: "other-target", text: "Next player's message" },
      ]),
  );
  await page.goto("/");
  await started.promise;
  await page.getByRole("button", { name: "Switch player" }).click();
  await expect(page.locator(".event-message-scroll")).toContainText(
    "Next player's message",
  );
  get.resolve();
  await settle(page);
  await expect(page.locator(".event-message-scroll")).toContainText(
    "Next player's message",
  );
});

for (const locale of ["zh-Hans", "zh-Hant"]) {
  test(`recovery uses the ${locale} catalog and allows discarding the draft`, async ({
    page,
  }) => {
    let reads = 0;
    await page.route(`**${endpoint}`, (route) =>
      json(route, [++reads === 1 ? original : latest]),
    );
    await page.route(`**${endpoint}/*`, (route) =>
      json(route, { error: conflict }, 409),
    );
    await page.goto(`/?locale=${locale}`);
    await expect(page.locator(".event-message-scroll")).toContainText(
      original.text,
    );
    await page
      .locator(".player-message-controls")
      .first()
      .locator("button")
      .nth(1)
      .click();
    await page.locator("form textarea").fill("保留的草稿");
    await page.locator("form button").first().click();
    await page.locator("[role=alert] button").click();
    const recovery = page.getByRole("status");
    await expect(recovery.locator("textarea")).toHaveValue("保留的草稿");
    await expect(recovery).toContainText(
      locale === "zh-Hans" ? "请先查看最新留言" : "請先查看最新留言",
    );
    await recovery
      .getByRole("button", {
        name: locale === "zh-Hans" ? "丢弃草稿" : "捨棄草稿",
      })
      .click();
    await expect(recovery).toHaveCount(0);
    await expect(page.locator(".event-message-scroll")).toContainText(
      latest.text,
    );
  });
}
