import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"]) {
  test(`${theme}: title opens osu and BID copies the difficulty ID with failure feedback`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            if (location.search.includes("copy-fail"))
              throw new Error("Synthetic denial");
            (window as Window & { copiedBID?: string }).copiedBID = text;
          },
        },
      });
    });
    await page.goto(`/practice-records?theme=${theme}`);
    const own = page.getByRole("rowgroup", {
      name: "Synthetic Artist — NM Signal",
      exact: true,
    });
    await expect(
      own.getByRole("link", {
        name: "Synthetic Artist — NM Signal",
        exact: true,
      }),
    ).toHaveAttribute("href", "https://osu.ppy.sh/beatmaps/100");
    await expect(
      own.locator('a[href="https://osu.ppy.sh/beatmaps/100"]'),
    ).toHaveCount(1);
    await expect(
      own.getByRole("link", {
        name: "osu!direct · NM1 NM Signal",
        exact: true,
      }),
    ).toHaveAttribute("href", "osu://b/100");
    const copy = own.getByRole("button", {
      name: "Copy beatmap ID: 100",
      exact: true,
    });
    await expect(copy).toHaveText("100");
    await copy.click();
    await expect(copy).toHaveText("100");
    await expect(own.getByRole("status")).toHaveText("Copied");
    expect(
      await page.evaluate(
        () => (window as Window & { copiedBID?: string }).copiedBID,
      ),
    ).toBe("100");
    await page.goto(`/practice-records?theme=${theme}&copy-fail`);
    await copy.click();
    await expect(own.getByRole("alert")).toHaveText(
      "Could not copy the beatmap ID.",
    );
  });
  test(`${theme}: replaced-map history remains available beside the new inline form`, async ({
    page,
  }) => {
    await page.route("**/api/tournaments/synthetic/player/practice", (route) =>
      route.fulfill({ json: { saved: true, version: 2 } }),
    );
    await page.goto(`/practice-records?theme=${theme}&stale`);
    const own = page.getByRole("rowgroup", {
      name: "Synthetic Artist — NM Signal",
      exact: true,
    });
    const form = own.getByRole("form");
    await expect(
      form.getByLabel("Practice score", { exact: true }),
    ).toHaveValue("");
    const history = form.locator("details");
    await history.locator("summary").click();
    await expect(history).toContainText("900,000");
    await expect(history).toContainText("My saved comment");
    await form.getByLabel("Practice score", { exact: true }).fill("910000");
    await expect(form.getByRole("status")).toHaveText("Saved");
    await expect(history).toHaveCount(0);
  });
  test(`${theme}: owner edits inside a single compact record row`, async ({
    page,
  }) => {
    const writes: Record<string, unknown>[] = [];
    await page.route(
      "**/api/tournaments/synthetic/player/practice",
      async (route) => {
        writes.push(route.request().postDataJSON());
        await route.fulfill({ json: { saved: true, version: 2 } });
      },
    );
    for (const width of [719, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/practice-records?theme=${theme}&actor-last&long-bid`);
      const own = page.getByRole("rowgroup", {
        name: "Synthetic Artist — NM Signal",
        exact: true,
      });
      const form = own.getByRole("form", {
        name: "My practice: NM1",
        exact: true,
      });
      const score = form.getByRole("spinbutton", {
        name: "Practice score",
        exact: true,
      });
      await expect(
        page.getByRole("group", { name: "Practice rating", exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole("radio")).toHaveCount(0);
      const comment = form.getByRole("textbox", {
        name: "Practice comment",
        exact: true,
      });
      const feel = form.getByRole("combobox", { name: "Feel", exact: true });
      await expect(feel).toHaveValue("normal");
      await expect(form.getByRole("button")).toHaveCount(0);
      const boxes = await Promise.all(
        [score, feel, comment].map((control) => control.boundingBox()),
      );
      expect(boxes.every((box) => box !== null)).toBe(true);
      expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2);
      expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y);
      expect(boxes[2]!.width).toBeGreaterThan(
        boxes[0]!.width + boxes[1]!.width,
      );
      await expect(own.getByRole("row")).toHaveCount(1);
      await expect(own.locator('td[data-own="true"] form')).toHaveCount(1);
      expect((await own.boundingBox())!.height).toBeLessThan(
        width === 320 ? 155 : 135,
      );
      expect((await form.boundingBox())!.height).toBeLessThan(110);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await comment.fill("Single-row practice note");
      await feel.selectOption("good");
      await expect(form.getByRole("status")).toHaveText("Saved");
      expect(writes.at(-1)).not.toHaveProperty("rating");
      expect(writes.at(-1)).toMatchObject({
        action: "save_practice",
        score: 900000,
        feel: "good",
        comment: "Single-row practice note",
        expectedVersion: 1,
      });
    }
  });
  test(`${theme}: aligned team comparison and keyboard tabs retain drafts`, async ({
    page,
  }, info) => {
    await page.goto(`/practice-records?theme=${theme}&long`);
    const pools = page.getByRole("tablist", {
      name: "Published mappool",
      exact: true,
    });
    const mods = page.getByRole("tablist", { name: "Mods", exact: true });
    const own = page.getByRole("rowgroup", {
      name: "Synthetic Artist — NM Signal",
      exact: true,
    });
    await expect(own.getByText("Visible teammate comment")).toHaveCount(0);
    const disclosure = own.locator("details");
    await expect(
      disclosure.locator("summary").getByText(/合成測試評論WithALong/),
    ).toBeVisible();
    const collapsedHeight = (await own.boundingBox())!.height;
    await disclosure
      .getByRole("button", { name: "Read full comment", exact: true })
      .click();
    await expect(disclosure.locator("p")).toContainText(
      "合成測試評論WithALong",
    );
    expect((await own.boundingBox())!.height).toBeGreaterThan(collapsedHeight);
    await disclosure
      .getByRole("button", { name: "Read full comment", exact: true })
      .click();
    expect(
      Math.abs((await own.boundingBox())!.height - collapsedHeight),
    ).toBeLessThan(2);
    await expect(page.getByText("Accuracy (%)", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      own.getByRole("textbox", { name: "Practice comment", exact: true }),
    ).toHaveAttribute("rows", "1");
    expect(
      (await own
        .getByRole("textbox", { name: "Practice comment", exact: true })
        .boundingBox())!.height,
    ).toBeLessThan(80);
    const comparison = page.getByRole("region", {
      name: "Team practice records · NM",
      exact: true,
    });
    const mapHeading = comparison.getByRole("columnheader", {
      name: "Beatmap",
      exact: true,
    });
    const before = (await mapHeading.boundingBox())!.x;

    await comparison.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    expect(Math.abs((await mapHeading.boundingBox())!.x - before)).toBeLessThan(
      2,
    );

    await comparison.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await own.getByLabel("Practice score", { exact: true }).fill("920000");
    await mods.getByRole("tab", { name: "HD", exact: true }).click();
    const hd = page.getByRole("rowgroup", {
      name: "Synthetic Artist — HD Signal",
      exact: true,
    });
    await hd
      .getByRole("textbox", { name: "Practice comment", exact: true })
      .fill("Unsaved HD comment");
    await mods.getByRole("tab", { name: "NM", exact: true }).click();
    await expect(own.getByLabel("Practice score", { exact: true })).toHaveValue(
      "920000",
    );
    await mods.getByRole("tab", { name: "NM", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      mods.getByRole("tab", { name: "HD", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      hd.getByRole("textbox", { name: "Practice comment", exact: true }),
    ).toHaveValue("Unsaved HD comment");
    page.once("dialog", (dialog) => dialog.dismiss());
    await pools
      .getByRole("tab", { name: "Round 2 · Final Pool", exact: true })
      .click();
    await expect(
      pools.getByRole("tab", { name: "Round 1", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mods.getByRole("tab", { name: "NM", exact: true }).click();
    await page.screenshot({
      path: info.outputPath(`practice-${theme}.png`),
      fullPage: true,
    });
    page.once("dialog", (dialog) => dialog.accept());
    await pools
      .getByRole("tab", { name: "Round 2 · Final Pool", exact: true })
      .click();
    await expect(
      mods.getByRole("tab", { name: "HR", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("rowgroup", {
        name: "Synthetic Artist — HR Signal",
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("clears previously saved fields through autosave and omits the editor when read-only", async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = [];
  await page.route(
    "**/api/tournaments/synthetic/player/practice",
    async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ json: { saved: true, version: 2 } });
    },
  );
  await page.goto("/practice-records");
  const form = page.getByRole("form", { name: "My practice: NM1" });
  await expect(form.getByRole("button")).toHaveCount(0);
  await form.getByRole("spinbutton", { name: "Practice score" }).fill("");
  await form
    .getByRole("combobox", { name: "Feel", exact: true })
    .selectOption("");
  await form
    .getByRole("textbox", { name: "Practice comment", exact: true })
    .fill("");
  await expect(form.getByRole("status")).toHaveText("Saved");
  expect(requests.at(-1)).toMatchObject({
    action: "save_practice",
    score: null,
    feel: null,
    comment: "",
    expectedVersion: 1,
  });
  await expect(form.getByRole("button")).toHaveCount(0);
  await page.goto("/practice-records?readonly");
  await expect(
    page.getByText("My saved comment", { exact: true }),
  ).toBeVisible();
  await expect(form).toHaveCount(0);
});

test("autosave keeps newer edits across Mods and confirms the same request after a failure", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-01T12:01:00Z"));
  const firstSave = Promise.withResolvers<void>();
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/tournaments/synthetic/player/practice",
    async (route) => {
      writes.push(route.request().postDataJSON());
      const attempt = writes.length;
      if (attempt === 1) await firstSave.promise;
      if (attempt === 2) await route.abort();
      else
        await route.fulfill({
          json: { saved: true, version: attempt === 1 ? 2 : attempt },
        });
    },
  );
  await page.goto("/practice-records");
  const form = page.getByRole("form", { name: "My practice: NM1" });
  const score = form.getByLabel("Practice score", { exact: true });
  const comment = form.getByRole("textbox", {
    name: "Practice comment",
    exact: true,
  });
  await score.fill("910000");
  await form
    .getByRole("combobox", { name: "Feel", exact: true })
    .selectOption("good");
  await comment.fill("First note");
  await expect(form.getByRole("status")).toHaveText("Unsaved changes");
  await page.clock.runFor(749);
  expect(writes).toHaveLength(0);
  await page.clock.runFor(1);
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({
    expectedVersion: 1,
    score: 910000,
    feel: "good",
    comment: "First note",
  });
  await expect(form.getByRole("status")).toHaveText("Saving…");

  await comment.fill("Second note");
  await page.getByRole("tab", { name: "HD", exact: true }).press("Enter");
  await page.clock.runFor(750);
  expect(writes).toHaveLength(1);
  firstSave.resolve();
  await page.getByRole("tab", { name: "NM", exact: true }).press("Enter");
  await expect(comment).toHaveValue("Second note");
  await expect(form.getByRole("status")).toHaveText("Unsaved changes");
  await page.clock.runFor(750);
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByRole("button")).toHaveText("Retry");
  expect(writes[1]).toMatchObject({
    expectedVersion: 2,
    comment: "Second note",
  });

  await comment.fill("Latest note");
  await page.clock.runFor(750);
  expect(writes).toHaveLength(2);
  await form.getByRole("button", { name: "Retry" }).press("Enter");
  await expect.poll(() => writes.length).toBe(3);
  expect(writes[2]).toEqual(writes[1]);
  await expect(comment).toHaveValue("Latest note");
  await expect(form.getByRole("status")).toHaveText("Unsaved changes");
  await page.clock.runFor(750);
  await expect(form.getByRole("status")).toHaveText("Saved");
  await expect(form.getByRole("button")).toHaveCount(0);
  expect(writes[3]).toMatchObject({
    expectedVersion: 3,
    comment: "Latest note",
  });
});

test("leaves the Mod tabs without activating an arrow-focused tab", async ({
  page,
}) => {
  await page.goto("/practice-records?locale=en");
  const mods = page.getByRole("tablist", { name: "Mods" });
  const hd = mods.getByRole("tab", { name: "HD", exact: true });
  const nm = mods.getByRole("tab", { name: "NM", exact: true });
  await hd.press("Enter");
  await hd.press("ArrowLeft");
  await expect(nm).toBeFocused();
  await expect(hd).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("region", { name: "Team practice records · HD" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(hd).toBeFocused();
});
