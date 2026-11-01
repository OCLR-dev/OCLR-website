import { test, expect, type Page } from "@playwright/test";
import { bpSyncSource } from "../../src/lib/referee-sync";
import { workspace, id } from "./referee-panel-data";
import { validateRefereeAction } from "../../src/lib/referee-model";
const api = "**/api/admin/tournaments/synthetic/matches/*/referee";
async function setup(
  page: Page,
  options: {
    connected?: boolean;
    failure?: "lost" | "conflict" | "syncLost";
    delay?: boolean;
  } = {},
) {
  let current = workspace();
  let syncLost = false;
  const writes: Record<string, unknown>[] = [],
    queues: Record<string, unknown>[] = [],
    autos: string[] = [];
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
  await page.route(`${api}/mp`, (r) =>
    r.fulfill({ json: { binding: null, workspace: current } }),
  );
  await page.route(`${api}/reconciliation`, (r) =>
    r.fulfill({
      status: 409,
      json: { error: "The action could not be completed." },
    }),
  );
  await page.route(`${api}/irc`, async (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      if (body.action === "sync_selection") {
        if (!options.connected) {
          await r.fulfill({
            status: 409,
            json: { error: "Connect the local IRC app to this fixture first." },
          });
          return;
        }
        if (!autos.includes(body.eventId)) {
          autos.push(body.eventId);
          const source = bpSyncSource(current, body.eventId)!;
          commands.push({
            id: id(2000 + commands.length),
            requestKey: body.eventId,
            text: source.text,
            target: "#mp_123",
            status: "queued",
            recordError: null,
            createdAt: new Date().toISOString(),
          });
        }
        if (options.failure === "syncLost" && !syncLost) {
          syncLost = true;
          await r.abort("failed");
          return;
        }
      } else {
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
              bpSync: true,
              lastSeenAt: new Date().toISOString(),
            }
          : null,
        messages: [],
        commands,
        workspace: current,
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
  return { writes, queues, autos, commands, current: () => current };
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
  await expect(page.getByLabel("IRC command", { exact: true })).toHaveValue("");
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
  await expect.poll(() => state.autos.length).toBe(1);
  await expect(
    page.getByText("Queued for local IRC", { exact: true }),
  ).toBeVisible();
  expect(state.queues).toHaveLength(0);
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
  await expect(page.getByLabel("IRC command", { exact: true })).toHaveValue("");
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
  await expect(
    page.getByText("[OCLR BP #2] BAN NM1 | Blue | https://osu.ppy.sh/b/10001", {
      exact: true,
    }),
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
          text(
            "BP saved. IRC sync is pending. Check the connection and retry safely.",
          ),
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

test("withdraw stays outside collapsed details and score floats only within BP", async ({
  page,
}, info) => {
  const state = await setup(page, { connected: true });
  await page.goto("/referee-panel");
  const summary = records(page),
    undo = summary.getByRole("button", {
      name: "Withdraw last Ban / Pick",
      exact: true,
    });
  await expect(undo).toBeVisible();
  expect(await undo.evaluate((el) => !!el.closest("details:not([open])"))).toBe(
    false,
  );
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
  await expect(undo).toBeEnabled();
  await expect.poll(() => state.autos.length).toBe(1);
  await page.evaluate(() =>
    document.getElementById("referee-pool")!.scrollIntoView(),
  );
  expect(await summary.evaluate((el) => getComputedStyle(el).position)).toBe(
    "sticky",
  );
  const box = await summary.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(95);
  expect(box!.y).toBeLessThanOrEqual(97);
  await summary.screenshot({ path: info.outputPath("scoreboard.png") });
  await undo.click();
  await expect
    .poll(() => state.current().projection.activeSelections.length)
    .toBe(0);
  await expect.poll(() => state.autos.length).toBe(2);
  await expect(undo).toBeDisabled();
  await page.evaluate(() => {
    const post = document.getElementById("referee-post-match")!;
    post.style.minHeight = "1200px";
    post.scrollIntoView();
  });
  const post = await page.locator("#referee-post-match").boundingBox();
  const released = await summary.boundingBox();
  expect(released!.y + released!.height).toBeLessThanOrEqual(post!.y);
});

test("retrying an accepted automatic sync uses the same event and never duplicates BP or its announcement", async ({
  page,
}) => {
  const state = await setup(page, { connected: true, failure: "syncLost" });
  await page.goto("/referee-panel");
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Retry IRC sync", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry IRC sync", exact: true }),
  ).toHaveCount(0);
  expect(state.autos).toHaveLength(1);
  expect(state.commands).toHaveLength(1);
  expect(state.current().projection.activeSelections).toHaveLength(1);
});

test("bound MP sync updates the red-left scoreboard, fences stale IRC reads and opens manual review", async ({
  page,
}) => {
  const state = await setup(page);
  let binding: null | {
    matchId: number;
    revision: number;
    enabled: boolean;
    nextPollAt: string;
    lastCheckedAt: null;
    error: null;
    issues: { gameId: number; beatmapId: number; reason: string }[];
    issueCount: number;
    syncing: boolean;
  } = null;
  let synced: ReturnType<typeof workspace> | null = null,
    syncs = 0,
    ircReads = 0;
  page.on("response", (response) => {
    if (response.url().endsWith("/irc")) ircReads++;
  });
  await page.route(`${api}/mp`, async (r) => {
    const c = r.request().postDataJSON();
    if (c.action === "bind")
      binding = {
        matchId: 880001,
        revision: 1,
        enabled: true,
        nextPollAt: new Date(0).toISOString(),
        lastCheckedAt: null,
        error: null,
        issues: [],
        issueCount: 0,
        syncing: false,
      };
    if (c.action === "sync") {
      syncs++;
      const before = state.current(),
        pick = before.projection.activeSelections.find(
          (s) => s.kind !== "ban",
        )!;
      const win = {
        id: id(7000),
        ordinal: before.events.length + 1,
        actorId: 1,
        createdAt: new Date().toISOString(),
        payload: {
          type: "attempt_resolved" as const,
          pickId: pick.id,
          attemptId: pick.attempts[0].id,
          status: "completed" as const,
          winnerTeamId: before.teams[0].id,
        },
      };
      synced = workspace([
        ...before.events,
        win,
        ...(syncs > 1
          ? [
              {
                ...win,
                id: id(7001),
                ordinal: win.ordinal + 1,
                payload: {
                  ...win.payload,
                  status: "aborted" as const,
                  winnerTeamId: null,
                },
              },
            ]
          : []),
      ]);
      if (syncs > 1) {
        binding!.issues = [
          { gameId: 880001, beatmapId: pick.beatmapId, reason: "replay" },
        ];
        binding!.issueCount = 1;
      }
    }
    await r.fulfill({
      json: { binding, workspace: synced ?? state.current() },
    });
  });
  await page.goto("/referee-panel");
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
  await pool(page)
    .getByRole("button", { name: "Blue team PICK", exact: true })
    .first()
    .click();
  await page.getByText("MP result sync", { exact: true }).click();
  await page
    .getByLabel("MP link", { exact: true })
    .fill("https://osu.ppy.sh/community/matches/880001");
  await page.getByRole("button", { name: "Bind MP link", exact: true }).click();
  await expect.poll(() => syncs).toBeGreaterThan(0);
  await expect(records(page).locator("strong")).toHaveText(["0", "1"]);
  const count = ircReads;
  await expect.poll(() => ircReads).toBeGreaterThan(count);
  if (syncs < 2)
    await expect(records(page).locator("strong")).toHaveText(["0", "1"]);
  await expect(
    page.getByText("Replay or repeated beatmap", { exact: true }),
  ).toBeHidden();
  await page
    .getByText("Manual review required: 1", { exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Replay or repeated beatmap", { exact: false }),
  ).toBeVisible();
  await expect(records(page).locator("strong")).toHaveText(["0", "0"]);
  await page
    .getByRole("link", { name: "Review referee records", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Record win: Blue", exact: true }),
  ).toBeVisible();
});
