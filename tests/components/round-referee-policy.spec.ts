import { test, expect } from "@playwright/test";
const route = "**/api/admin/tournaments/synthetic/rounds/*/referee-policy";

test("offers edition group navigation only for group rounds", async ({ page }) => {
  await page.goto("/round-referee-policy");
  const link = page.getByRole("link", {
    name: "Configure groups in team management",
    exact: true,
  });
  await expect(link).toHaveAttribute("href", "/admin/tournaments/synthetic/teams#groups");
  await link.focus();
  await expect(link).toBeFocused();
  await page.goto("/round-referee-policy?exhibition");
  await expect(link).toHaveCount(0);
  await expect(page.getByLabel("Game mode", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Points for a win", { exact: true })).toHaveCount(0);
});

test("changing group points preserves the approved failed-score policy", async ({
  page,
}, testInfo) => {
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/matches",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    },
  );
  for (const policy of ["zero", "include"]) {
    await page.goto(
      `/round-referee-policy${policy === "zero" ? "?failed-zero" : ""}`,
    );
    if (policy === "zero") {
      const scoring = page.getByRole("heading", { name: "Configure approved scoring rules", exact: true }).locator("..");
      const ranking = page.getByRole("heading", { name: "Configure approved group ranking rules", exact: true }).locator("..");
      const scoreBox = (await scoring.boundingBox())!;
      const rankingBox = (await ranking.boundingBox())!;
      expect(rankingBox.y).toBeGreaterThanOrEqual(scoreBox.y + scoreBox.height);
      expect(Math.abs(rankingBox.x - scoreBox.x)).toBeLessThan(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator("#competition").screenshot({ path: testInfo.outputPath("single-column-rules.png") });
    }
    await page.getByLabel("Points for a win", { exact: true }).fill("4");
    await page
      .getByRole("button", { name: "Save approved round rules", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(writes.at(-1)).toMatchObject({
      action: "round_rules",
      expectedVersion: 0,
      scoringRules: {
        failedScorePolicy: policy,
        tiedMapPolicy: "require_replay",
        allowSubstitutions: true,
      },
      standingsRules: { winPoints: 4 },
    });
  }
  expect(writes).toHaveLength(2);
});
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

test("opens compact referee rules with the keyboard at the workflow viewport", async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/round-referee-policy?locale=en&theme=light");
  const disclosure = page.locator("summary").filter({
    hasText: "Configure round referee policy",
  });
  await disclosure.focus();
  await disclosure.press("Enter");
  await expect(
    page.getByLabel("Ban timer seconds", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("uses one BO input, derives wins, and reloads synchronized BP and TB after saving", async ({
  page,
}) => {
  let requestBody!: {
    expectedRefereePolicyRevision: number;
    scoringRules: { series: { wins: number } };
  };
  await page.route("**/api/admin/tournaments/synthetic/matches", async (r) => {
    requestBody = r.request().postDataJSON();
    await r.fulfill({ json: { ok: true } });
  });
  await page.route("**/synthetic-round-state", (r) =>
    r.fulfill({
      json: {
        wins: 7,
        roundVersion: 1,
        policyRevision: 5,
        policy: {
          steps: [
            "ban",
            "ban",
            "pick",
            "pick",
            "ban",
            "ban",
            ...Array(10).fill("pick"),
            "tb",
          ].map((kind, i) => ({
            kind,
            actor:
              kind === "tb"
                ? "neutral"
                : kind === "ban"
                  ? i % 2
                    ? "secondBan"
                    : "firstBan"
                  : i % 2
                    ? "secondPick"
                    : "firstPick",
            categories: kind === "tb" ? ["TB"] : [],
            entryIds: [],
            avoidRepeatCategory: false,
            tiedAt: kind === "tb" ? 6 : null,
          })),
          commands: null,
        },
      },
    }),
  );
  await page.goto("/round-referee-policy?saved&linked");
  const bo = page.getByLabel("Best of (BO)", { exact: true });
  await expect(bo).toHaveCount(1);
  await expect(bo).toHaveValue("11");
  const required = page.getByLabel("Map wins required", { exact: true });
  await expect(required).toHaveAttribute("readonly", "");
  await bo.fill("13");
  await expect(required).toHaveValue("7");
  await page
    .getByRole("button", { name: "Save approved round rules", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(bo).toHaveValue("13");
  await expect.poll(() => requestBody?.scoringRules.series.wins).toBe(7);
  expect(requestBody.expectedRefereePolicyRevision).toBe(4);
  await page
    .getByText("Configure round referee policy", { exact: true })
    .click();
  await expect(
    page
      .getByRole("list", { name: "Finite Ban / Pick sequence", exact: true })
      .locator(":scope > li"),
  ).toHaveCount(17);
  const tb = page.getByLabel("Both teams must have this score before TB", {
    exact: true,
  });
  await expect(tb).toHaveValue("6");
  await expect(tb).toHaveAttribute("readonly", "");
  await expect(bo).toHaveCount(1);
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
    await expect(page.getByLabel("Best of (BO)", { exact: true })).toHaveCount(
      1,
    );
    await expect(
      page.getByLabel("Map wins required", { exact: true }),
    ).toHaveAttribute("readonly", "");
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
