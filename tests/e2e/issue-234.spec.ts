import { test, expect } from "@playwright/test";
import { db, closeDb } from "../../src/db";
import { staffRoles } from "../../src/db/schema";
import { seedSession } from "./session";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
test.afterAll(closeDb);
test("presentation tools are scoped staff controls and OBS remains a released-data output", async ({
  page,
  context,
  isMobile,
}) => {
  const id = isMobile ? 928000 : 927000;
  const slug = `broadcast-${id}-test`;
  const cookie = await seedSession(id);
  await seedEditions([{ ...edition, slug }]);
  await page.goto(`/tournaments/${slug}/draft`);
  await expect(
    page.getByRole("link", { name: "Open presenter view" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open broadcast overlay" }),
  ).toHaveCount(0);
  await page.goto(`/tournaments/${slug}/draft?presenter=1`);
  await expect(page).toHaveURL(/\/login/);
  await context.addCookies([cookie]);
  expect(
    (await page.goto(`/tournaments/${slug}/draft?presenter=1`))?.status(),
  ).toBe(404);
  await db().insert(staffRoles).values({
    userId: id,
    role: "streamer",
    editionSlug: "test-cup",
    grantedBy: id,
  });
  expect(
    (await page.goto(`/tournaments/${slug}/draft?presenter=1`))?.status(),
  ).toBe(404);
  await db()
    .insert(staffRoles)
    .values({ userId: id, role: "streamer", editionSlug: slug, grantedBy: id });
  expect(
    (await page.goto(`/tournaments/${slug}/draft?presenter=1`))?.status(),
  ).toBe(200);
  await expect(page.locator(".site-header")).toBeHidden();
  await page.goto(`/admin/tournaments/${slug}/streaming`);
  await expect(
    page.getByRole("heading", { name: "Streaming tasks" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open presenter view" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open broadcast overlay" }),
  ).toHaveCount(0);
  await db()
    .insert(staffRoles)
    .values({ userId: id, role: "admin", editionSlug: slug, grantedBy: id });
  await page.goto(`/admin/tournaments/${slug}/draft`);
  await expect(
    page.getByRole("link", { name: "Open presenter view" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open broadcast overlay" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "OBS Browser Source / Overlay URL" }),
  ).toHaveValue(new URL(`/tournaments/${slug}/draft/overlay`, page.url()).href);
  await context.clearCookies();
  expect(
    (
      await page.goto(
        `/tournaments/${slug}/draft/overlay?background=transparent`,
      )
    )?.status(),
  ).toBe(200);
  await expect(page.locator("[data-broadcast]")).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-broadcast]")).toBeVisible();
});
