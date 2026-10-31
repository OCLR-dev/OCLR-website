import { test, expect } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import hans from "../../messages/zh-Hans.json" with { type: "json" };
import hant from "../../messages/zh-Hant.json" with { type: "json" };
const route = "**/api/admin/tournaments/synthetic/rounds/*/referee-policy";
test("edits S11 defaults in round management before any fixture exists", async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  await page.route(route, async (request) => {
    const body = request.request().postDataJSON();
    writes.push(body);
    await request.fulfill({ json: { revision: 1, policy: body.policy } });
  });
  await page.goto("/round-referee-policy");
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  await expect(
    page.getByLabel("Ban timer seconds", { exact: true }),
  ).toHaveValue("60");
  await expect(
    page.getByLabel("Pick timer seconds", { exact: true }),
  ).toHaveValue("90");
  await expect(
    page.getByLabel("Preparation timer seconds", { exact: true }),
  ).toHaveValue("120");
  await expect(
    page.getByLabel("Require No Fail for every map", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Maximum replays per map", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Start countdown seconds", { exact: true }),
  ).toHaveValue("");
  const save = page.getByRole("button", {
    name: "Save round referee policy",
    exact: true,
  });
  await save.click();
  expect(writes).toHaveLength(0);
  await page
    .getByLabel("Room size (separate from players per team)", { exact: true })
    .fill("16");
  await save.click();
  await expect(page.getByRole("status")).toHaveText(
    "Round referee policy saved.",
  );
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    expectedRevision: 0,
    policy: {
      commands: {
        roomSize: 16,
        noFail: true,
        banSeconds: 60,
        pickSeconds: 90,
        prepareSeconds: 120,
        startSeconds: null,
      },
      banCategoryRules: { allowRepeats: false, repeatExceptions: ["NM", "FM"] },
    },
  });
  const policy = writes[0].policy as {
    steps: { kind: string; tiedAt: number | null }[];
    maxReplaysPerMap?: number;
  };
  expect(policy.steps.map((step) => step.kind).slice(0, 6)).toEqual([
    "ban",
    "ban",
    "pick",
    "pick",
    "ban",
    "ban",
  ]);
  expect(policy.steps).toHaveLength(15);
  expect(policy.steps.at(-1)?.tiedAt).toBe(5);
  expect(policy).not.toHaveProperty("maxReplaysPerMap");
});

test("keeps steps compact and preserves restrictions while reordering", async ({
  page,
}, testInfo) => {
  let saved: Record<string, unknown> | null = null;
  await page.route(route, async (request) => {
    saved = request.request().postDataJSON();
    await request.fulfill({ json: { revision: 1, policy: saved!.policy } });
  });
  await page.goto("/round-referee-policy");
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  const sequence = page.getByRole("list", {
    name: "Finite Ban / Pick sequence",
    exact: true,
  });
  const rows = sequence.locator(":scope > li");
  await expect(rows).toHaveCount(15);
  await sequence.screenshot({ path: testInfo.outputPath("compact-steps.png") });
  expect((await rows.first().boundingBox())!.height).toBeLessThan(180);
  await expect(sequence.locator("select[multiple]")).toHaveCount(0);
  const row = rows.first();
  await row.getByText("Step limits (optional)", { exact: true }).click();
  await expect(
    row.getByRole("button", { name: "TB", exact: true }),
  ).toHaveCount(0);
  await row.getByRole("button", { name: "HD", exact: true }).click();
  await row
    .getByText("Allowed pool entries (optional)", { exact: false })
    .click();
  await row.getByLabel("Find a pool map", { exact: true }).fill("HD2");
  await row.getByRole("checkbox", { name: /HD2/ }).check();
  await page
    .getByRole("button", { name: "Move step 1 down", exact: true })
    .click();
  await expect(
    rows.nth(1).getByLabel("Find a pool map", { exact: true }),
  ).toHaveValue("HD2");
  await expect(page.getByLabel("Step 2 action", { exact: true })).toHaveValue(
    "ban:firstBan",
  );
  await page
    .getByLabel("Room size (separate from players per team)", { exact: true })
    .fill("16");
  await page
    .getByRole("button", { name: "Save round referee policy", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Round referee policy saved.",
  );
  const steps = (
    saved!.policy as { steps: { categories: string[]; entryIds: string[] }[] }
  ).steps;
  expect(steps[0].categories).toEqual([]);
  expect(steps[1].categories).toEqual(["HD"]);
  expect(steps[1].entryIds).toHaveLength(1);
});

test("supports the repeat Ban option and preserves legacy rules when unchanged", async ({
  page,
}) => {
  const writes: { policy: Record<string, unknown> }[] = [];
  await page.route(route, async (request) => {
    const body = request.request().postDataJSON();
    writes.push(body);
    await request.fulfill({
      json: { revision: 4 + writes.length, policy: body.policy },
    });
  });
  await page.goto("/round-referee-policy?saved");
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  const allow = page.getByLabel(
    "Allow each team to Ban the same Mod more than once",
    { exact: true },
  );
  await expect(allow).toBeChecked();
  await page
    .getByRole("button", { name: "Save round referee policy", exact: true })
    .click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(writes[0].policy).not.toHaveProperty("banCategoryRules");
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  await page
    .getByLabel(
      "Only NM and FM may be banned more than once by the same team",
      { exact: true },
    )
    .check();
  await expect(allow).not.toBeChecked();
  await page
    .getByRole("button", { name: "Save round referee policy", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].policy.banCategoryRules).toEqual({
    allowRepeats: false,
    repeatExceptions: ["NM", "FM"],
  });
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  await allow.check();
  await expect(
    page.getByLabel(
      "Only NM and FM may be banned more than once by the same team",
      { exact: true },
    ),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Save round referee policy", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(3);
  expect(writes[2].policy.banCategoryRules).toEqual({
    allowRepeats: true,
    repeatExceptions: [],
  });
});
test("preserves saved settings and keeps the draft on a revision conflict", async ({
  page,
}) => {
  await page.route(route, (request) =>
    request.fulfill({
      status: 409,
      json: {
        error: "The round referee policy changed. Refresh before saving.",
      },
    }),
  );
  await page.goto("/round-referee-policy?saved");
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  await expect(
    page.getByLabel("Ban timer seconds", { exact: true }),
  ).toHaveValue("35");
  await expect(
    page.getByLabel("Require No Fail for every map", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Maximum replays per map", { exact: true }),
  ).toHaveValue("3");
  await page.getByLabel("Ban timer seconds", { exact: true }).fill("61");
  await page
    .getByRole("button", { name: "Save round referee policy", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "The round referee policy changed. Refresh before saving.",
  );
  await expect(
    page.getByLabel("Ban timer seconds", { exact: true }),
  ).toHaveValue("61");
});
test("offers BO13 defaults and disables mutations in read-only mode", async ({
  page,
}) => {
  await page.goto("/round-referee-policy?bo13&readonly");
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  await expect(
    page.getByLabel("Both teams must have this score before TB", {
      exact: true,
    }),
  ).toHaveValue("6");
  await expect(
    page.getByRole("button", {
      name: "Save round referee policy",
      exact: true,
    }),
  ).toBeDisabled();
});

for (const [locale, catalog] of [
  ["en", en],
  ["zh-Hans", hans],
  ["zh-Hant", hant],
] as const) {
  test(`keeps ${locale} rules readable in both themes`, async ({
    page,
    isMobile,
  }, testInfo) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const key = Object.entries(en.ui).find(
      ([, value]) => value === "Configure round referee policy",
    )![0] as keyof typeof en.ui;
    for (const theme of ["light", "dark"]) {
      await page.goto(`/round-referee-policy?locale=${locale}&theme=${theme}`);
      await page.getByText(catalog.ui[key], { exact: true }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await expect(page.getByRole("button").last()).toBeVisible();
      if (theme === "dark")
        await page.screenshot({
          path: testInfo.outputPath(`${locale}-${theme}.png`),
        });
    }
    expect(errors).toEqual([]);
  });
}

test("updates BO and the unsaved S11 sequence together without NM override controls", async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  await page.route(route, async (request) => {
    const body = request.request().postDataJSON();
    writes.push(body);
    await request.fulfill({
      json: {
        revision: 1,
        policy: body.policy,
        series: { type: "first_to", wins: 7 },
        roundVersion: 1,
      },
    });
  });
  await page.goto("/round-referee-policy");
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  await page.getByLabel("Best of (BO)", { exact: true }).fill("13");
  await expect(
    page
      .getByRole("list", { name: "Finite Ban / Pick sequence", exact: true })
      .locator(":scope > li"),
  ).toHaveCount(17);
  await expect(
    page.getByLabel("Both teams must have this score before TB", {
      exact: true,
    }),
  ).toHaveValue("6");
  await expect(
    page.getByLabel("Mods for NM (space separated; empty clears Mods)", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByLabel("NM · Freemod", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("Room size (separate from players per team)", { exact: true })
    .fill("16");
  await page
    .getByRole("button", { name: "Save round referee policy", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Round referee policy saved.",
  );
  expect(writes[0]).toMatchObject({
    seriesChange: { bestOf: 13, expectedRoundVersion: 0 },
    policy: {
      commands: { categoryMods: { NM: { mods: [], freemod: false } } },
    },
  });
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  await expect(page.getByLabel("Best of (BO)", { exact: true })).toHaveValue(
    "13",
  );
});
test("restores NF and standard Mods only after explicit choice and keeps custom steps", async ({
  page,
}) => {
  let write!: {
    policy: {
      commands: {
        noFail: boolean;
        categoryMods: Record<string, { mods: string[]; freemod: boolean }>;
      };
      steps: unknown[];
    };
  };
  await page.route(route, async (request) => {
    write = request.request().postDataJSON();
    await request.fulfill({ json: { revision: 5, policy: write.policy } });
  });
  await page.goto("/round-referee-policy?saved&nm-override");
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  await page.getByText("Saved custom Mod settings", { exact: true }).click();
  await page
    .getByLabel("Restore NF and standard category Mods on save", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save round referee policy", exact: true })
    .click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(write.policy.commands.noFail).toBe(true);
  expect(write.policy.commands.categoryMods.NM).toEqual({
    mods: [],
    freemod: false,
  });
  expect(write.policy.commands.categoryMods.HD).toEqual({
    mods: ["HD"],
    freemod: false,
  });
  expect(write.policy.steps).toHaveLength(15);
  expect(write).not.toHaveProperty("seriesChange");
});
test("does not convert unconfigured or fixed-map scoring into BO", async ({
  page,
}) => {
  for (const mode of ["no-scoring", "fixed"]) {
    await page.goto(`/round-referee-policy?saved&${mode}`);
    await page
      .getByText("Configure round referee policy", { exact: true })
      .click();
    await expect(
      page.getByLabel("Best of (BO)", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "Configure scoring rules", exact: true }),
    ).toHaveAttribute("href", "/admin/tournaments/synthetic/matches");
  }
});

test("preserves saved custom exceptions and edited steps when BO changes", async ({
  page,
}) => {
  let saved: { policy: { banCategoryRules: unknown } };
  await page.route(route, async (request) => {
    saved = request.request().postDataJSON();
    await request.fulfill({ json: { revision: 5, policy: saved.policy } });
  });
  await page.goto("/round-referee-policy?saved&custom-ban");
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save round referee policy", exact: true })
    .click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(saved!.policy.banCategoryRules).toEqual({
    allowRepeats: false,
    repeatExceptions: ["HD"],
  });
  await page.goto("/round-referee-policy");
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  const sequence = page.getByRole("list", {
    name: "Finite Ban / Pick sequence",
    exact: true,
  });
  const first = sequence.locator(":scope > li").first();
  await first.getByText("Step limits (optional)", { exact: true }).click();
  await first.getByRole("button", { name: "HD", exact: true }).click();
  await page.getByLabel("Best of (BO)", { exact: true }).fill("13");
  await expect(sequence.locator(":scope > li")).toHaveCount(15);
  await expect(
    first.getByRole("button", { name: "HD", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("preserves saved custom Mods during an unrelated save without showing category inputs", async ({
  page,
}) => {
  let written!: {
    policy: {
      commands: { noFail: boolean; categoryMods: Record<string, unknown> };
    };
  };
  await page.route(route, async (r) => {
    written = r.request().postDataJSON();
    await r.fulfill({ json: { revision: 5, policy: written.policy } });
  });
  await page.goto("/round-referee-policy?saved&nm-override");
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  await expect(
    page.getByText("Saved custom Mod settings", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('input[placeholder="HD"]')).toHaveCount(0);
  await page.getByLabel("Ban timer seconds", { exact: true }).fill("42");
  await page
    .getByRole("button", { name: "Save round referee policy", exact: true })
    .click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(written.policy.commands.noFail).toBe(false);
  expect(written.policy.commands.categoryMods.NM).toEqual({
    mods: ["HD"],
    freemod: true,
  });
});

test("defaults to NF and all standard category Mods without an S11 template", async ({
  page,
}) => {
  let written!: {
    policy: {
      commands: { noFail: boolean; categoryMods: Record<string, unknown> };
    };
  };
  await page.route(route, async (r) => {
    written = r.request().postDataJSON();
    await r.fulfill({ json: { revision: 1, policy: written.policy } });
  });
  await page.goto("/round-referee-policy?other-season");
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await page
    .getByLabel("Room size (separate from players per team)", { exact: true })
    .fill("8");
  await expect(
    page.getByText("Saved custom Mod settings", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('input[placeholder="HD"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Save round referee policy", exact: true })
    .click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(written.policy.commands.noFail).toBe(true);
  expect(written.policy.commands.categoryMods).toEqual({
    NM: { mods: [], freemod: false },
    HD: { mods: ["HD"], freemod: false },
    HR: { mods: ["HR"], freemod: false },
    DT: { mods: ["DT"], freemod: false },
    FM: { mods: [], freemod: true },
    TB: { mods: [], freemod: true },
  });
});
