import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeDb, db } from "../../src/db";
import { staffRoles } from "../../src/db/schema";
import { createSession, readSessionContext } from "../../src/lib/auth/sessions";
import { createDeveloperToken } from "../../src/lib/developer-api";
import { seedPlayerHistory, historyUid } from "../fixtures/player-history";
import { waitForRemoteRateWindow } from "../fixtures/remote-rate-window";
const local = "http://127.0.0.1:31470";
test.afterAll(closeDb);
test("reads all subject history through the saved remote contract without a frontend DB", async ({
  page,
  context,
}) => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.APP_URL = "http://127.0.0.1:3100";
  process.env.OCLR_DEVELOPER_ORIGINS = local;
  await seedPlayerHistory();
  await db()
    .insert(staffRoles)
    .values({ userId: historyUid, role: "developer", grantedBy: historyUid });
  const session = (await readSessionContext(
    (await createSession(historyUid)).token,
  ))!;
  const credential = await createDeveloperToken(session, {
    origin: local,
    scopes: ["identity:read", "tournaments:read"],
  });
  await waitForRemoteRateWindow(page);
  expect(
    (
      await context.request.post("/api/remote/connection", {
        headers: { Origin: local },
        data: { mode: "developer", token: credential.token },
      })
    ).status(),
  ).toBe(201);
  await context.route("https://a.ppy.sh/**", (route) => route.abort());
  await page.goto("/dashboard");
  const history = page.locator("#participation-history");
  await expect(history.locator("h3")).toHaveText([
    "Synthetic season 10",
    "Synthetic season 5",
    "Synthetic season 3",
  ]);
  await expect(
    history.getByText("Later historical name", { exact: true }),
  ).toHaveCount(2);
  await expect(history).not.toContainText("PRIVATE_");
  await expect(page.locator("#registrations")).toContainText(
    "You have no applications yet",
  );
  const other = await readSessionContext(
    (await createSession(historyUid + 1)).token,
  );
  await db()
    .insert(staffRoles)
    .values({
      userId: historyUid + 1,
      role: "developer",
      grantedBy: historyUid,
    });
  const next = await createDeveloperToken(other!, {
    origin: local,
    scopes: ["identity:read", "tournaments:read"],
  });
  expect(
    (
      await context.request.post("/api/remote/connection", {
        headers: { Origin: local },
        data: { mode: "developer", token: next.token },
      })
    ).status(),
  ).toBe(201);
  await page.reload();
  await expect(history).toContainText(
    "No historical participation is recorded yet.",
  );
  const monitor = process.env.OCLR_TEST_NO_DB_ATTEMPTS;
  expect(monitor).toBeTruthy();
  expect(readFileSync(monitor!, "utf8")).toBe("");
});
