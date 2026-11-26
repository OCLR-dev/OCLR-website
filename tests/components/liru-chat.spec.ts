import { expect, test } from "@playwright/test";
test("stop a pending turn, retry with sources, and start fresh in another edition", async ({
  page,
}) => {
  let count = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  // Seed the draw so checking that reopening refreshes the buttons is reproducible.
  await page.addInitScript(() => {
    let seed = 42;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
  });
  await page.route("**/api/osu-images/avatar/1425010", (route) =>
    route.fulfill({
      contentType: "image/gif",
      body: Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
      ),
    }),
  );
  const reply =
    "**Ask the referee.**\n\n**本屆已公布 3 個圖池。 ～** [1]\n\n> 原文。～\n\n- First option\n- Second option";
  const editions: string[] = [];
  await page.route("**/api/chat", async (route) => {
    count++;
    const body = route.request().postDataJSON();
    editions.push(body.edition);
    if (count === 1) {
      await gate;
      await route.abort().catch(() => {});
      return;
    }
    const chunks = [
      { type: "start" },
      {
        type: "source-url",
        sourceId: "1",
        title: "Substitution",
        url: "/tournaments/cup-a#rules-1",
      },
      { type: "text-start", id: "a" },
      {
        type: "text-delta",
        id: "a",
        delta: reply,
      },
      { type: "text-end", id: "a" },
      { type: "finish" },
    ];
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        chunks.map((c) => "data: " + JSON.stringify(c) + "\n\n").join("") +
        "data: [DONE]\n\n",
    });
  });
  await page.goto("/liru-chat#ask-liru");
  const launcher = page.getByRole("button", { name: "Ask Liru" });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeInViewport();
  await expect(
    dialog
      .getByRole("heading", { name: "Ask Liru" })
      .locator('img[src$="/mascot/liru/chat-launcher.webp"]'),
  ).toBeVisible();
  await expect(dialog.getByRole("textbox")).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveCount(0);
  const suggestions = page.getByRole("button", { name: /^How many / });
  await expect(suggestions).toHaveCount(3);
  const initial = await suggestions.allTextContents();
  expect(new Set(initial).size).toBe(3);
  await page.getByRole("textbox").fill("Substitution?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => count).toBe(1);
  const history = page.getByRole("log");
  const avatar = history.locator('img[src$="/api/osu-images/avatar/1425010"]');
  await expect(avatar).toBeVisible();
  await expect
    .poll(() =>
      avatar.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  const questionText = history
    .locator("p")
    .filter({ hasText: /^Substitution\?$/ });
  const spacing = await questionText.evaluate((text) => {
    const bubble = text.parentElement!;
    const textBox = text.getBoundingClientRect();
    const bubbleBox = bubble.getBoundingClientRect();
    const padding = Number.parseFloat(
      getComputedStyle(bubble).paddingBlockStart,
    );
    return {
      top: textBox.top - bubbleBox.top,
      bottom: bubbleBox.bottom - textBox.bottom,
      padding,
    };
  });
  expect(spacing.top).toBeCloseTo(spacing.padding, 0);
  expect(spacing.bottom).toBeCloseTo(spacing.padding, 0);
  const question = await questionText.boundingBox();
  const profile = await avatar.boundingBox();
  expect(profile!.x).toBeGreaterThanOrEqual(question!.x + question!.width);
  await expect(
    page.getByRole("status").filter({ hasText: "Loading…" }),
  ).toBeVisible();
  await expect(suggestions).toHaveText(initial);
  for (const suggestion of await suggestions.all()) {
    await expect(suggestion).toBeDisabled();
  }
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  release();
  await expect(page.getByRole("textbox")).toHaveValue("Substitution?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Ask the referee.")).toBeVisible();
  const portrait = history.locator('img[src$="/mascot/liru/chat-wink.webp"]');
  await expect(portrait).toBeVisible();
  await expect
    .poll(() =>
      portrait.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(160);
  const launcherPortrait = launcher.locator(
    'img[src$="/mascot/liru/chat-launcher.webp"]',
  );
  await expect(launcherPortrait).toBeVisible();
  await expect
    .poll(() =>
      launcherPortrait.evaluate(
        (image: HTMLImageElement) => image.naturalWidth,
      ),
    )
    .toBeGreaterThan(0);
  const sourceToggle = page.getByText("Source", { exact: true });
  const sourceLink = page.getByRole("link", { name: "Substitution" });
  await expect(sourceToggle).toBeVisible();
  await expect(sourceLink).toBeHidden();
  await expect(
    page.getByRole("log").getByText("[1]", { exact: true }),
  ).toHaveCount(0);
  await sourceToggle.press("Enter");
  await expect(sourceLink).toBeVisible();
  await expect(sourceLink).toHaveAttribute(
    "href",
    "/tournaments/cup-a#rules-1",
  );
  await sourceToggle.press("Enter");
  await expect(sourceLink).toBeHidden();
  await expect(
    page.getByRole("listitem").filter({ hasText: "First option" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Loading…" }),
  ).toHaveCount(0);
  await page.getByRole("textbox").fill("Draft for this season");
  await expect(suggestions).toHaveText(initial);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await launcher.click();
  await expect(page.getByText("Ask the referee.")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveValue("Draft for this season");
  await expect(suggestions).toHaveCount(3);
  await expect.poll(() => suggestions.allTextContents()).not.toEqual(initial);
  expect(new Set(await suggestions.allTextContents()).size).toBe(3);
  await page.reload();
  await launcher.click();
  await expect(questionText).toBeVisible();
  await expect(history.getByText("Ask the referee.").first()).toBeVisible();
  await expect(
    history.getByText("本屆已公布 3 個圖池～", { exact: true }),
  ).toBeVisible();
  await expect(history.locator("blockquote")).toHaveText("原文。～");
  await sourceToggle.click();
  await expect(sourceLink).toBeVisible();
  expect(count).toBe(2);
  await page.goto("/liru-chat?other#ask-liru");
  await expect(dialog.getByRole("textbox")).toBeVisible();
  await expect(page.getByRole("log", { includeHidden: true })).toBeEmpty();
  await page.goto("/liru-chat#ask-liru");
  await expect(history.getByText("Ask the referee.").first()).toBeVisible();
  await page.getByRole("textbox").fill("Who was the second option?");
  const followUp = page.waitForRequest("**/api/chat");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  expect((await followUp).postDataJSON()).toMatchObject({
    questions: ["Substitution?", "Who was the second option?"],
    previousAnswers: [reply],
  });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => count).toBe(4);
  await page.getByRole("button", { name: "Switch season" }).click();
  await launcher.click();
  await expect(page.getByRole("log", { includeHidden: true })).toBeEmpty();
  await page.getByRole("textbox").fill("My next question");
  await expect(suggestions).toHaveCount(3);
  const chosen = await suggestions.first().innerText();
  const request = page.waitForRequest("**/api/chat");
  await suggestions.first().click();
  expect((await request).postDataJSON()).toMatchObject({
    edition: "cup-b",
    locale: "en",
    questions: [chosen],
  });
  await expect(
    page.getByRole("log").getByText(chosen, { exact: true }),
  ).toBeVisible();
  await expect(suggestions.first()).toBeEnabled();
  await expect(page.getByRole("textbox")).toHaveValue("My next question");
  await expect
    .poll(() => editions)
    .toEqual(["cup-a", "cup-a", "cup-a", "cup-a", "cup-b"]);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("log", { includeHidden: true })).toBeEmpty();
  await page.reload();
  await launcher.click();
  await expect(history.getByText("Ask the referee.").first()).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.reload();
  await launcher.click();
  await expect(dialog.getByRole("textbox")).toBeVisible();
  await expect(page.getByRole("log", { includeHidden: true })).toBeEmpty();
});

test("visitors can open the fixed launcher after scrolling and sign in for the current season", async ({
  page,
}) => {
  await page.goto("/liru-chat?guest");
  const launcher = page.getByRole("button", { name: "Ask Liru" });
  await expect(launcher).toBeVisible();
  const before = await launcher.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await launcher.boundingBox()).toEqual(before);
  const viewport = page.viewportSize()!;
  expect(before!.x).toBeGreaterThan(viewport.width - 90);
  expect(before!.y).toBeGreaterThan(viewport.height - 90);
  await launcher.click();
  await expect(page.getByRole("dialog").getByRole("link")).toHaveAttribute(
    "href",
    "/auth/osu?chat_edition=cup-a&chat_return=%2Fwiki%2Fliru",
  );
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(launcher).toBeFocused();
  await page.getByRole("button", { name: "Switch season" }).click();
  await expect(launcher).toHaveCount(1);
  await launcher.click();
  await expect(
    page.getByRole("heading", { name: "Ask Liru · Archived Cup" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("link")).toHaveAttribute(
    "href",
    "/auth/osu?chat_edition=cup-b&chat_return=%2Ftournaments%2Fcup-b%2Fmappools%2Ffinal",
  );
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Open overlay" }).click();
  await expect(launcher).toHaveCount(0);
  await page.getByRole("button", { name: "Open full chat" }).click();
  await expect(launcher).toHaveCount(0);
});
