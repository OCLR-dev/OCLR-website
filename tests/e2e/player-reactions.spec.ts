import { expect, test, type Page } from "@playwright/test";
import { closeDb, db } from "../../src/db";
import { registrations, users } from "../../src/db/schema";
import { createSession } from "../../src/lib/auth/sessions";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";
import { englishStorage } from "../fixtures/preferences";
import { seedSession } from "./session";

test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
test.afterAll(closeDb);

// Picker component tests cover local state. Only a real app and two isolated
// sessions can prove that account selections and totals come from the database.
test("shares player reaction totals across separate browser accounts", async ({
  browser,
  baseURL,
  page: first,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "One browser workflow covers shared count and persistence",
  );
  const slug = "shared-player-reactions-test";
  const target = 119398;
  const path = `/tournaments/${slug}/players`;
  const endpoint = `/api/tournaments/${slug}/players/${target}/reactions`;
  const firstCookie = await seedSession(119396);
  const secondCookie = await seedSession(119397);
  const otherLogin = await createSession(119396);
  await seedEditions([{ ...edition, slug }]);
  await db()
    .insert(users)
    .values({ osuId: target, username: "Synthetic Reaction Target" })
    .onConflictDoNothing();
  await db()
    .insert(registrations)
    .values({
      editionSlug: slug,
      userId: target,
      status: "accepted",
      configurationVersion: 0,
      answers: {},
    })
    .onConflictDoNothing();

  const secondContext = await browser.newContext({
    baseURL,
    storageState: englishStorage,
  });
  const freshContext = await browser.newContext({
    baseURL,
    storageState: englishStorage,
  });
  const second = await secondContext.newPage();
  const fresh = await freshContext.newPage();
  const badge = (page: Page) => page.locator(".player-reaction");
  const count = (page: Page) => badge(page).locator(".reaction-count");
  async function add(page: Page) {
    await page
      .getByRole("button", { name: "Add reaction", exact: true })
      .click();
    await page.locator('[data-reaction-id="qq-13"]').click();
  }

  try {
    const unsigned = await freshContext.request.put(endpoint, {
      headers: { Origin: baseURL! },
      data: { id: "qq-13", selected: true },
    });
    expect(unsigned.status()).toBe(401);
    await first.context().addCookies([firstCookie]);
    await secondContext.addCookies([secondCookie]);
    await first.addInitScript(
      ({ slug, target }) => {
        localStorage.setItem(`oclr-reactions:${slug}:${target}`, '["qq-13"]');
      },
      { slug, target },
    );
    await Promise.all([first.goto(path), second.goto(path)]);
    await expect(badge(first)).toHaveCount(0);
    await expect(badge(second)).toHaveCount(0);

    await add(first);
    await expect(count(first)).toHaveText("1");
    await expect(badge(first)).toHaveAttribute("aria-pressed", "true");
    await second.reload();
    await expect(count(second)).toHaveText("1");
    await expect(badge(second)).toHaveAttribute("aria-pressed", "false");

    await badge(second).click();
    await expect(count(second)).toHaveText("2");
    await expect(badge(second)).toHaveAttribute("aria-pressed", "true");
    await first.reload();
    await expect(count(first)).toHaveText("2");
    await expect(badge(first)).toHaveAttribute("aria-pressed", "true");

    await fresh.goto(path);
    await expect(count(fresh)).toHaveText("2");
    await expect(badge(fresh)).not.toHaveRole("button");
    await freshContext.addCookies([{ ...firstCookie, value: otherLogin.token }]);
    await fresh.reload();
    await expect(badge(fresh)).toHaveAttribute("aria-pressed", "true");

    await first.route(`**${endpoint}`, (route) => route.abort(), { times: 1 });
    await badge(first).click();
    const retry = first.getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toBeVisible();
    await expect(count(first)).toHaveText("2");
    await expect(badge(first)).toHaveAttribute("aria-pressed", "true");
    await retry.click();
    await expect(count(first)).toHaveText("1");
    await expect(badge(first)).toHaveAttribute("aria-pressed", "false");
    await second.reload();
    await expect(count(second)).toHaveText("1");
    await expect(badge(second)).toHaveAttribute("aria-pressed", "true");
    await badge(second).click();
    await expect(badge(second)).toHaveCount(0);
    await first.reload();
    await expect(badge(first)).toHaveCount(0);
  } finally {
    await secondContext.close();
    await freshContext.close();
  }
});
