import { test, expect, type Page } from "@playwright/test";
import { workspace, id } from "./referee-panel-data";
import { validateRefereeAction } from "../../src/lib/referee-model";
const api = "**/api/admin/tournaments/synthetic/matches/*/referee";
async function setup(
  page: Page,
  options: {
    connected?: boolean;
    failure?: "lost" | "conflict";
    delay?: boolean;
  } = {},
) {
  let current = workspace();
  const initial = workspace();
  const writes: Record<string, unknown>[] = [],
    queues: Record<string, unknown>[] = [];
  const receipts = new Map<string, { eventId: string; requestKey: string }>();
  const commands: {
    id: string;
    requestKey: string;
    text: string;
    target: string;
    status: string;
    recordError: null;
    createdAt: string;
  }[] = [];
  await page.route(`${api}/reconciliation`, (r) =>
    r.fulfill({
      status: 409,
      json: { error: "The action could not be completed." },
    }),
  );
  await page.route(`${api}/irc`, async (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      queues.push(body);
      commands.push({
        id: id(500),
        requestKey: body.requestKey,
        text: body.text,
        target: "#mp_123",
        status: "queued",
        recordError: null,
        createdAt: new Date().toISOString(),
      });
    }
    await r.fulfill({
      json: {
        connection: options.connected
          ? {
              id: id(400),
              roomId: 123,
              ircUsername: "SyntheticRef",
              status: "connected",
              connected: true,
              lastSeenAt: new Date().toISOString(),
            }
          : null,
        messages: [],
        commands,
        workspace: initial,
      },
    });
  });
  await page.route(api, async (r) => {
    if (r.request().method() !== "PATCH") {
      await r.fulfill({ json: current });
      return;
    }
    const body = r.request().postDataJSON();
    writes.push(body);
    if (options.delay) await new Promise((resolve) => setTimeout(resolve, 150));
    if (options.failure === "conflict") {
      await r.fulfill({
        status: 409,
        json: {
          error: "The referee workspace changed. Refresh before saving.",
        },
      });
      return;
    }
    let receipt = receipts.get(body.requestKey);
    if (!receipt) {
      const payload = validateRefereeAction(
        {
          ...current.session!.basis,
          orders: current.session!,
          events: current.events,
        },
        body,
      );
      const event = {
        id: id(1000 + current.events.length),
        ordinal: current.events.length + 1,
        actorId: 1,
        createdAt: new Date().toISOString(),
        payload,
      };
      current = workspace([...current.events, event]);
      receipt = { eventId: event.id, requestKey: body.requestKey };
      receipts.set(body.requestKey, receipt);
    }
    if (options.failure === "lost" && writes.length === 1) {
      await r.abort("failed");
      return;
    }
    await r.fulfill({ json: { receipt, workspace: current } });
  });
  return { writes, queues, commands, current: () => current };
}
function pool(page: Page) {
  return page.getByRole("region", { name: "Round mappool", exact: true });
}
function records(page: Page) {
  return page.getByRole("region", { name: "Referee records", exact: true });
}
test("records Ban and Pick without an IRC connection or queue request", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/referee-panel");
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
  await expect(records(page)).toContainText("BAN NM1");
  await expect(page.getByLabel("IRC command", { exact: true })).toHaveValue(
    "!mp map 10001 0",
  );
  await expect(
    page.getByRole("button", { name: "Send to local IRC", exact: true }),
  ).toBeDisabled();
  await pool(page)
    .getByRole("button", { name: "Blue team PICK", exact: true })
    .first()
    .click();
  await expect(records(page)).toContainText("PICK NM2");
  expect(state.current().projection.activeSelections).toHaveLength(2);
  expect(state.writes.map((w) => w.action)).toEqual([
    "record_selection",
    "record_selection",
  ]);
  expect(state.queues).toHaveLength(0);
});
test("keeps queued commands and late IRC receipts independent from already recorded BP", async ({
  page,
}) => {
  const state = await setup(page, { connected: true });
  await page.goto("/referee-panel");
  await expect(page.getByText("IRC connected", { exact: true })).toBeVisible();
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
  await expect(records(page)).toContainText("BAN NM1");
  await page
    .getByRole("button", { name: "Send to local IRC", exact: true })
    .click();
  await expect(
    page.getByText("Queued for local IRC", { exact: true }),
  ).toBeVisible();
  expect(state.queues[0]).not.toHaveProperty("selection");
  await pool(page)
    .getByRole("button", { name: "Blue team PICK", exact: true })
    .first()
    .click();
  await expect(records(page)).toContainText("PICK NM2");
  state.commands[0].status = "confirmed";
  await expect(
    page.getByText("Confirmed by IRC", { exact: true }),
  ).toBeVisible();
  await expect(records(page)).toContainText("BAN NM1");
  await expect(records(page)).toContainText("PICK NM2");
  expect(state.writes).toHaveLength(2);
  expect(state.current().projection.activeSelections).toHaveLength(2);
});
test("shows a conflict without preparing a command or advancing BP", async ({
  page,
}) => {
  const state = await setup(page, { failure: "conflict" });
  await page.goto("/referee-panel");
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("The referee workspace changed. Refresh before saving.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(records(page)).not.toContainText("BAN NM1");
  await expect(page.getByLabel("IRC command", { exact: true })).toHaveValue("");
  expect(state.current().projection.activeSelections).toHaveLength(0);
  expect(state.queues).toHaveLength(0);
});
test("retries a lost save response with the same key and one selection", async ({
  page,
}) => {
  const state = await setup(page, { failure: "lost" });
  await page.goto("/referee-panel");
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Retry same request", exact: true })
    .click();
  await expect(records(page)).toContainText("BAN NM1");
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0]).toEqual(state.writes[1]);
  expect(state.current().projection.activeSelections).toHaveLength(1);
  await expect(page.getByLabel("IRC command", { exact: true })).toHaveValue(
    "!mp map 10001 0",
  );
});
test("blocks a second rapid click while the record is saving", async ({
  page,
}) => {
  const state = await setup(page, { delay: true });
  await page.goto("/referee-panel");
  const button = pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first();
  await button.evaluate((el: HTMLButtonElement) => {
    el.click();
    el.click();
  });
  await expect(records(page)).toContainText("BAN NM1");
  expect(state.writes).toHaveLength(1);
});
test("simulation records on click and simulated sending does not record twice", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/referee-panel?simulation");
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(records(page)).toContainText("BAN NM1");
  await page
    .getByRole("button", { name: "Simulate send", exact: true })
    .click();
  await expect(
    page.getByText("Simulation confirmed", { exact: false }),
  ).toBeVisible();
  await expect(records(page)).toContainText("BAN NM1");
  await expect(
    pool(page)
      .getByRole("button", { name: "Blue team PICK", exact: true })
      .first(),
  ).toBeEnabled();
  expect(state.writes).toHaveLength(0);
  expect(state.queues).toHaveLength(0);
});
test("read-only users cannot record", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/referee-panel?readonly");
  await expect(
    pool(page)
      .getByRole("button", { name: "Blue team BAN", exact: true })
      .first(),
  ).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});

for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
  test(`records with localized feedback in ${locale} in both themes`, async ({
    page,
    isMobile,
  }, info) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
    const en = (
      await import("../../messages/en.json", { with: { type: "json" } })
    ).default;
    const catalog =
      locale === "zh-Hans"
        ? (
            await import("../../messages/zh-Hans.json", {
              with: { type: "json" },
            })
          ).default
        : locale === "zh-Hant"
          ? (
              await import("../../messages/zh-Hant.json", {
                with: { type: "json" },
              })
            ).default
          : en;
    const text = (source: string) =>
      catalog.ui[
        Object.entries(en.ui).find(
          ([, v]) => v === source,
        )![0] as keyof typeof en.ui
      ];
    for (const theme of ["light", "dark"]) {
      await setup(page);
      await page.goto(`/referee-panel?locale=${locale}&theme=${theme}`);
      const maps = page.getByRole("region", {
        name: text("Round mappool"),
        exact: true,
      });
      await maps
        .getByRole("button", { name: `${text("Blue team")} BAN`, exact: true })
        .first()
        .click();
      await expect(
        page.getByText(
          text("Recorded: {value0}").replace("{value0}", "BAN · Blue · NM1"),
          { exact: true },
        ),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (theme === "dark")
        await maps.screenshot({
          path: info.outputPath(`${locale}-recorded.png`),
        });
    }
  });
}
