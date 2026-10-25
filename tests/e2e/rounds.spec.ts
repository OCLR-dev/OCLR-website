import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  tournamentRounds,
  mappools,
  mappoolEvents,
  staffRoles,
} from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { seedSession } from "./session";
import { seedBrowserEditions } from "./setup";
import { openTournamentTool } from "./navigation";
const origin = "http://127.0.0.1:3100",
  path = "/admin/tournaments/test-cup/rounds",
  api = "/api/admin/tournaments/test-cup/mappools";
const headers = { origin };
test.describe("independent round management and safe deletion", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.beforeEach(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
  });
  test.afterEach(seedBrowserEditions);
  test.afterAll(closeDb);
  test("creates, edits and safely deletes rounds independently of mappools", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await openTournamentTool(page, "test-cup", "Rounds", isMobile);
    await expect(
      page.getByRole("heading", { name: "Round management", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb", exact: true }),
    ).toContainText("Rounds");
    const stageTabs = page.getByRole("tablist", {
      name: "Competition stage",
    });
    await expect(stageTabs).toHaveAttribute("data-appearance", "line");
    await expect(stageTabs).toHaveCSS("border-radius", "0px");
    await expect(
      stageTabs.getByRole("tab", { name: "Group Stage", exact: true }),
    ).toHaveCSS("border-radius", "0px");
    await expect(
      page.getByText("No rounds in this stage.", { exact: true }),
    ).toBeVisible();
    async function create(name: string, order: string) {
      await page
        .getByRole("button", { name: "+ New round", exact: true })
        .click();
      await expect(page.getByLabel("Round order", { exact: true })).toHaveValue(
        order,
      );
      await expect(
        page.getByRole("button", { name: "Create round", exact: true }),
      ).toBeDisabled();
      await page.getByLabel("Round name", { exact: true }).fill(name);
      await page
        .getByRole("button", { name: "Create round", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    }
    await create("Temporary group", "1");
    const list = page.getByRole("list", { name: "Rounds", exact: true });
    await list
      .getByRole("button", { name: "Delete round", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Temporary group");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await db().select().from(tournamentRounds)).toHaveLength(1);
    expect(
      (await db().select().from(mappoolEvents)).map((event) => event.action),
    ).toEqual(["round_create"]);
    await list
      .getByRole("button", { name: "Delete round", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page.getByText("No rounds in this stage.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("list", { name: "Rounds", exact: true }),
    ).toHaveCount(0);
    expect(
      (await db().select().from(mappoolEvents))
        .map((event) => event.action)
        .sort(),
    ).toEqual(["round_create", "round_delete"]);
    const groupTab = page.getByRole("tab", {
      name: "Group Stage",
      exact: true,
    });
    await groupTab.focus();
    await groupTab.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Knockout Stage", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await create("Final", "1");
    await create("Reserve", "2");
    const final = list.getByRole("listitem").filter({
      has: page.getByRole("heading", { name: "Final", exact: true }),
    });
    await final
      .getByRole("button", { name: "Edit round", exact: true })
      .click();
    await page.getByLabel("Round name", { exact: true }).fill("Final renamed");
    await page.getByLabel("Round order", { exact: true }).fill("3");
    await page.getByRole("button", { name: "Save round", exact: true }).click();
    await expect(
      list.getByRole("heading", { name: "Final renamed", exact: true }),
    ).toBeVisible();
    const round = (await db().select().from(tournamentRounds)).find(
      (r) => r.name === "Final renamed",
    )!;
    expect(
      (await db().select().from(tournamentRounds)).find(
        (r) => r.name === "Reserve",
      )?.position,
    ).toBe(2);
    expect(
      (
        await context.request.post(api, {
          headers,
          data: {
            action: "pool_create",
            roundId: round.id,
            name: "Preserved pool",
            confirmed: true,
          },
        })
      ).status(),
    ).toBe(200);
    await list
      .getByRole("listitem")
      .filter({
        has: page.getByRole("heading", { name: "Final renamed", exact: true }),
      })
      .getByRole("button", { name: "Delete round", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("contains mappools");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await db().select().from(mappools)).toHaveLength(1);
    await page.goto("/admin/tournaments/test-cup/mappools");
    await expect(
      page.getByRole("button", { name: "+ New round", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Edit round", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Manage rounds", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Group Stage", exact: true }).click();
    await expect(
      page.getByText(
        "Create rounds in Round management before adding mappools.",
        { exact: false },
      ),
    ).toBeVisible();
    await page
      .getByRole("tab", { name: "Knockout Stage", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Final renamed", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Preserved pool", exact: false }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Manage rounds", exact: true })
      .click();
    await expect(page.getByLabel("Round name", { exact: true })).toHaveValue(
      "Final renamed",
    );
    const scheduling = await (
      await context.request.get("/api/admin/tournaments/test-cup/matches")
    ).json();
    expect(
      scheduling.rounds.some(
        (candidate: { round: { id: string; name: string } }) =>
          candidate.round.id === round.id &&
          candidate.round.name === "Final renamed",
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("round-workspace.png"),
      fullPage: true,
    });
  });
  test("enforces scoped roles, stale deletes, revocation and API authorization", async ({
    page,
    context,
    browser,
    isMobile,
  }) => {
    const admin = isMobile ? 70001 : 60001,
      mapper = isMobile ? 1290102 : 1290101,
      referee = mapper + 10,
      captain = mapper + 20;
    const adminCookie = await seedSession(admin),
      mapperCookie = await seedSession(mapper),
      refCookie = await seedSession(referee),
      captainCookie = await seedSession(captain);
    await db()
      .insert(staffRoles)
      .values([
        {
          userId: mapper,
          role: "mappooler",
          editionSlug: "test-cup",
          grantedBy: admin,
        },
        {
          userId: referee,
          role: "referee",
          editionSlug: "test-cup",
          grantedBy: admin,
        },
      ]);
    await context.addCookies([adminCookie]);
    const created = await (
      await context.request.post(api, {
        headers,
        data: {
          action: "round_create",
          stage: "group",
          name: "Stale target",
          position: 1,
          confirmed: true,
        },
      })
    ).json();
    const round = created.rounds[0];
    await context.addCookies([mapperCookie]);
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Round management", exact: true }),
    ).toBeVisible();
    expect((await page.goto("/admin/tournaments/s11/rounds"))?.status()).toBe(
      404,
    );
    await page.goto(path);
    await page
      .getByRole("button", { name: "Delete round", exact: true })
      .click();
    await context.addCookies([adminCookie]);
    expect(
      (
        await context.request.post(api, {
          headers,
          data: {
            action: "round_edit",
            roundId: round.id,
            expectedVersion: 0,
            name: "External edit",
            position: 1,
            confirmed: true,
          },
        })
      ).status(),
    ).toBe(200);
    await context.addCookies([mapperCookie]);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "round changed",
    );
    expect((await db().select().from(tournamentRounds))[0].name).toBe(
      "External edit",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await db()
      .update(staffRoles)
      .set({ revokedAt: new Date() })
      .where(eq(staffRoles.userId, mapper));
    expect(
      (
        await context.request.post(api, {
          headers,
          data: {
            action: "round_delete",
            roundId: round.id,
            expectedVersion: 1,
            confirmed: true,
          },
        })
      ).status(),
    ).toBe(403);
    for (const cookie of [refCookie, captainCookie]) {
      await context.addCookies([cookie]);
      expect((await page.goto(path))?.status()).toBe(404);
      expect(
        (
          await context.request.post(api, {
            headers,
            data: {
              action: "round_delete",
              roundId: round.id,
              expectedVersion: 1,
              confirmed: true,
            },
          })
        ).status(),
      ).toBe(403);
    }
    const guest = await browser.newContext();
    try {
      expect(
        (
          await guest.request.post(origin + api, {
            headers,
            data: {
              action: "round_delete",
              roundId: round.id,
              expectedVersion: 1,
              confirmed: true,
            },
          })
        ).status(),
      ).toBe(401);
    } finally {
      await guest.close();
    }
    expect(
      (await db().select().from(mappoolEvents)).filter(
        (event) => event.action === "round_delete",
      ),
    ).toHaveLength(0);
  });
  test("keeps round forms, confirmations and navigation usable across appearances and locales", async ({
    page,
    context,
    isMobile,
  }, info) => {
    test.setTimeout(120000);
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    expect(
      (
        await context.request.post(api, {
          headers,
          data: {
            action: "round_create",
            stage: "group",
            name: "Synthetic 輪次 · " + "長名稱LongName".repeat(5),
            position: 1,
            confirmed: true,
          },
        })
      ).status(),
    ).toBe(200);
    for (const locale of ["en", "zh-Hans", "zh-Hant"])
      for (const theme of ["light", "dark"])
        for (const appearance of ["default", "cute-pastel"]) {
          await context.addCookies(
            [
              ["oclr-locale", locale],
              ["oclr-theme", theme],
              ["oclr-appearance", appearance],
            ].map(([name, value]) => ({ name, value, url: origin })),
          );
          await page.setViewportSize({
            width: isMobile ? 390 : 1440,
            height: 900,
          });
          await page.goto(path);
          const row = page
            .locator("ul[aria-label] > li")
            .filter({ has: page.getByRole("heading", { name: /^Synthetic/ }) });
          await row.getByRole("button").first().click();
          await expect(row.locator("input[type=number]")).toHaveValue("1");
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await row.getByRole("button").nth(1).click();
          await expect(page.getByRole("dialog")).toContainText("Synthetic");
          if (locale === "en")
            expect(
              (
                await new AxeBuilder({ page })
                  .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                  .analyze()
              ).violations,
            ).toEqual([]);
          await page.screenshot({
            path: info.outputPath(`${locale}-${theme}-${appearance}.png`),
            fullPage: true,
          });
          await page.keyboard.press("Escape");
        }
  });
});
