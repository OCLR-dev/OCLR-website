import { expect, test, type Route } from "@playwright/test";
import { id, workspace } from "./referee-panel-data";

const api = "**/api/admin/tournaments/synthetic/matches/*/referee";

for (const scenario of ["disconnect", "queue", "queue-error"] as const) {
  test(`${scenario}: an older poll preserves the successful action and fresh polls still update`, async ({
    page,
  }) => {
    const current = workspace();
    const connection = {
      id: id(400),
      roomId: 123,
      ircUsername: "SyntheticRef",
      status: "connected",
      connected: true,
      bpSync: true,
      lastSeenAt: "2026-11-05T00:00:00Z",
    };
    const snapshot = {
      connection: connection as typeof connection | null,
      messages: [],
      commands: [] as {
        id: string;
        requestKey: string;
        text: string;
        target: string;
        status: string;
        recordError: null;
        createdAt: string;
      }[],
      workspace: current,
    };
    let latest = structuredClone(snapshot);
    let held: Route | undefined;
    let reads = 0;
    const writes: string[] = [];

    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.route(api, (route) => route.fulfill({ json: current }));
    await page.route(`${api}/mp`, (route) =>
      route.fulfill({ json: { binding: null, workspace: current } }),
    );
    await page.route(`${api}/reconciliation`, (route) =>
      route.fulfill({ status: 409, json: { error: "Synthetic" } }),
    );
    await page.route(`${api}/irc`, async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        writes.push(body.action);
        if (body.action === "disconnect") {
          latest = { ...latest, connection: null };
        } else {
          expect(body.action).toBe("queue");
          latest = {
            ...latest,
            commands: [
              {
                id: id(500),
                requestKey: body.requestKey,
                text: body.text,
                target: "#mp_123",
                status: "queued",
                recordError: null,
                createdAt: "2026-11-05T00:00:01Z",
              },
            ],
          };
        }
        await route.fulfill({ json: latest });
      } else if (++reads === 2) {
        held = route;
      } else {
        await route.fulfill({ json: latest });
      }
    });

    await page.goto("/referee-panel?theme=light");
    const panel = page.getByRole("complementary", { name: "IRC console" });
    await expect(
      panel.getByText("IRC connected", { exact: true }),
    ).toBeVisible();
    await page.clock.runFor(2100);
    await expect.poll(() => Boolean(held)).toBe(true);

    if (scenario === "disconnect") {
      await panel.getByRole("button", { name: "Disconnect relay" }).click();
      await expect(
        panel.getByText("IRC not connected", { exact: true }),
      ).toBeVisible();
    } else {
      await panel
        .getByRole("textbox", { name: "IRC command" })
        .fill("!mp timer 60");
      await panel.getByRole("button", { name: "Send to local IRC" }).click();
      await expect(panel.getByText("Queued for local IRC")).toBeVisible();
    }

    if (scenario === "queue-error") {
      await held!.abort("failed");
    } else {
      await held!.fulfill({ json: snapshot });
    }
    // Process the response while keeping the next periodic poll paused.
    await page.clock.runFor(50);

    if (scenario === "disconnect") {
      await expect(
        panel.getByText("IRC not connected", { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByRole("link", { name: "Rejoin room" }),
      ).toHaveCount(0);
    } else {
      await expect(panel.getByText("Queued for local IRC")).toBeVisible();
      await expect(
        panel.getByText("IRC connected", { exact: true }),
      ).toBeVisible();
      await expect(panel.getByRole("alert")).toHaveCount(0);
    }

    latest = { ...latest, connection: { ...connection, roomId: 456 } };
    await page.clock.runFor(2100);
    await expect(
      panel.getByRole("link", { name: "Rejoin room" }),
    ).toHaveAttribute("href", "oclr-irc://join?room=456");
    expect(writes).toEqual([
      scenario === "disconnect" ? "disconnect" : "queue",
    ]);
  });
}

test("close follows authoritative series completion, including later corrections", async ({
  page,
}) => {
  let current = workspace();
  let queued = 0;
  const view = () => ({
    workspace: current,
    messages: [],
    commands: [],
    connection: {
      id: id(400),
      roomId: 123,
      ircUsername: "SyntheticRef",
      status: "connected",
      connected: true,
      bpSync: true,
      lastSeenAt: new Date().toISOString(),
    },
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.route(api, (route) => route.fulfill({ json: current }));
  await page.route(`${api}/mp`, (route) =>
    route.fulfill({ json: { binding: null, workspace: current } }),
  );
  await page.route(`${api}/reconciliation`, (route) =>
    route.fulfill({ status: 409, json: { error: "Synthetic" } }),
  );
  await page.route(`${api}/irc`, (route) => {
    if (route.request().method() === "POST") queued++;
    return route.fulfill({ json: view() });
  });
  await page.goto("/referee-panel?theme=light");
  const panel = page.getByRole("complementary", { name: "IRC console" });
  await expect(panel.getByText("IRC connected", { exact: true })).toBeVisible();
  const close = panel.getByRole("button", { name: "!mp close", exact: true });
  const send = panel.getByRole("button", { name: "Send to local IRC" });
  const input = panel.getByRole("textbox", { name: "IRC command" });
  await expect(close).toBeDisabled();
  await input.fill("!mp close");
  await expect(send).toBeDisabled();
  current = structuredClone(current);
  current.session!.revision++;
  current.projection.complete = true;
  await page.clock.runFor(2100);
  await expect(close).toBeEnabled();
  await close.click();
  await expect(input).toHaveValue("!mp close");
  await expect(send).toBeEnabled();
  // Clicking the shortcut prepares the command; it still needs an explicit send.
  expect(queued).toBe(0);
  current = structuredClone(current);
  current.session!.revision++;
  current.projection.complete = false;
  await page.clock.runFor(2100);
  await expect(close).toBeDisabled();
  await expect(send).toBeDisabled();
  expect(queued).toBe(0);
});
