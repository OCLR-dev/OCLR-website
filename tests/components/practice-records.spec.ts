import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"]) {
  test(`${theme}: score, rating, comment and save stay on one row at 719px and 320px`, async ({
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
      await page.goto(`/practice-records?theme=${theme}`);
      const own = page.getByRole("article", {
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
      const rating = form.getByRole("group", {
        name: "Practice rating",
        exact: true,
      });
      const comment = form.getByRole("textbox", {
        name: "Practice comment",
        exact: true,
      });
      const save = form.getByRole("button", {
        name: "Save practice",
        exact: true,
      });
      const boxes = await Promise.all(
        [score, rating, comment, save].map((control) => control.boundingBox()),
      );
      expect(boxes.every((box) => box !== null)).toBe(true);
      expect(
        Math.max(...boxes.map((box) => box!.y)) -
          Math.min(...boxes.map((box) => box!.y)),
      ).toBeLessThan(2);
      expect((await form.boundingBox())!.height).toBeLessThan(90);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const toggle = rating.getByRole("button", { name: /^Practice rating/ });
      const compact = await toggle.isVisible();
      if (compact) {
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Tab");
        await expect(
          rating.getByRole("radio", { name: "3 out of 5 stars", exact: true }),
        ).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(toggle).toBeFocused();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await toggle.click();
        await score.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await toggle.click();
      }
      await rating
        .getByRole("radio", { name: "5 out of 5 stars", exact: true })
        .check();
      if (compact) {
        await expect(toggle).toHaveAccessibleName(
          "Practice rating: 5 out of 5 stars",
        );
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await toggle.click();
      }
      await rating
        .getByRole("button", { name: "Clear rating", exact: true })
        .click();
      await comment.fill("Single-row practice note");
      await save.click();
      await expect(form.getByRole("status")).toHaveText("Saved");
      expect(writes.at(-1)).toMatchObject({
        action: "save_practice",
        rating: null,
        score: 900000,
        comment: "Single-row practice note",
        expectedVersion: 1,
      });
    }
  });
  test(`${theme}: compact practice, expanded team records and keyboard tabs retain drafts`, async ({
    page,
  }, info) => {
    await page.goto(`/practice-records?theme=${theme}&long`);
    const pools = page.getByRole("tablist", {
      name: "Published mappool",
      exact: true,
    });
    const mods = page.getByRole("tablist", { name: "Mods", exact: true });
    const own = page.getByRole("article", {
      name: "Synthetic Artist — NM Signal",
      exact: true,
    });
    await expect(own.getByText("Visible teammate comment")).toHaveCount(0);
    await expect(own.getByText(/合成測試評論WithALong/)).toBeVisible();
    await expect(own.locator("details")).toHaveAttribute("open", "");
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
    await own.getByLabel("Practice score", { exact: true }).fill("920000");
    await mods.getByRole("tab", { name: "HD", exact: true }).click();
    const hd = page.getByRole("article", {
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
      page.getByRole("article", {
        name: "Synthetic Artist — HR Signal",
        exact: true,
      }),
    ).toBeVisible();
  });
  test(`${theme}: owner deletion retries safely and recreates using the retained version`, async ({
    page,
  }) => {
    const requests: Record<string, unknown>[] = [];
    let deletes = 0;
    await page.route(
      "**/api/tournaments/synthetic/player/practice",
      async (route) => {
        const input = route.request().postDataJSON();
        requests.push(input);
        if (input.action === "delete_practice") {
          deletes++;
          if (deletes === 1) {
            await route.abort();
            return;
          }
          await route.fulfill({ json: { saved: true, version: 2 } });
        } else await route.fulfill({ json: { saved: true, version: 3 } });
      },
    );
    await page.goto(`/practice-records?theme=${theme}`);
    const own = page.getByRole("article", {
      name: "Synthetic Artist — NM Signal",
      exact: true,
    });
    await expect(
      own.getByRole("button", { name: "Delete practice record", exact: true }),
    ).toHaveCount(1);
    const teammate = own
      .locator("li")
      .filter({ has: page.getByText("Synthetic Teammate", { exact: true }) });
    await expect(
      teammate.getByRole("button", {
        name: "Delete practice record",
        exact: true,
      }),
    ).toHaveCount(0);
    page.once("dialog", (dialog) => dialog.dismiss());
    await own
      .getByRole("button", { name: "Delete practice record", exact: true })
      .click();
    expect(requests).toHaveLength(0);
    page.once("dialog", (dialog) => dialog.accept());
    await own
      .getByRole("button", { name: "Delete practice record", exact: true })
      .click();
    await expect(own.getByRole("alert")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await own
      .getByRole("button", { name: "Delete practice record", exact: true })
      .click();
    await expect(own.getByRole("status")).toHaveText(
      "Practice record deleted.",
    );
    expect(requests[0]).toEqual(requests[1]);
    expect(requests[1].expectedVersion).toBe(1);
    await expect(
      own.getByRole("button", { name: "Delete practice record", exact: true }),
    ).toHaveCount(0);
    await expect(teammate).toBeVisible();
    await expect(own.getByLabel("Practice score", { exact: true })).toHaveValue(
      "",
    );
    await own.getByLabel("Practice score", { exact: true }).fill("999000");
    await own
      .getByRole("button", { name: "Save practice", exact: true })
      .click();
    await expect(own.getByRole("status")).toHaveText("Saved");
    expect(requests[2].expectedVersion).toBe(2);
    expect(requests[2]).not.toHaveProperty("accuracy");
    expect(requests[2]).not.toHaveProperty("userId");
    await expect(
      own.getByRole("button", { name: "Delete practice record", exact: true }),
    ).toHaveCount(1);
    await page.goto(`/practice-records?theme=${theme}&readonly`);
    await expect(
      page.getByRole("button", { name: "Delete practice record", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save practice", exact: true }),
    ).toHaveCount(0);
  });
}
