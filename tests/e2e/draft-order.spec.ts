import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { createSession } from "../../src/lib/auth/sessions";
import { prepareDraft } from "../fixtures/draft";
import { generateTurnSequence } from "../../src/lib/draft-order";
test.describe("reviewed draft order setup", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.afterAll(closeDb);
  test("an unsaved draft preselects Snake without saving or starting it (#280)", async ({
    page,
    context,
    isMobile,
  }) => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ADMIN_OSU_IDS = "110001,120001";
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    const slug = isMobile
      ? "draft-default-mobile-test"
      : "draft-default-desktop-test";
    const fixture = await prepareDraft(
      slug,
      isMobile ? 120001 : 110001,
      2,
      false,
      false,
    );
    const session = await createSession(fixture.staff.osuId);
    await context.addCookies([
      {
        name: "oclr_session",
        value: session.token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const url = `/api/admin/tournaments/${slug}/draft`;
    const snapshot = await (await context.request.get(url)).json();
    expect(snapshot.session).toBeNull();
    const ids = snapshot.teams.map((t: { team: { id: string } }) => t.team.id);
    const names: string[] = snapshot.teams.map(
      (t: { team: { name: string } }) => t.team.name,
    );
    await page.goto(`/admin/tournaments/${slug}/draft`);
    const selector = page.getByRole("combobox", {
      name: "Order mode",
      exact: true,
    });
    await expect(selector).toHaveValue("snake");
    await page.getByLabel("Pick rounds", { exact: true }).fill("2");
    const preview = page.getByRole("region", {
      name: "Full turn sequence preview",
    });
    await expect(preview.locator(":scope > ol > li > ol > li")).toHaveText(
      generateTurnSequence(names, 2, "snake").map((name) => new RegExp(name)),
    );
    await expect(
      page.getByRole("button", { name: "Start draft", exact: true }),
    ).toBeDisabled();
    // Opening and previewing the default must not write a configuration.
    await page.reload();
    await expect(selector).toHaveValue("snake");
    expect((await (await context.request.get(url)).json()).session).toBeNull();
    await page.getByLabel("Pick rounds", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "Save draft configuration", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Start draft", exact: true }),
    ).toBeEnabled();
    const saved = await (await context.request.get(url)).json();
    expect(saved.session.state).toBe("setup");
    expect(saved.session.turnSequence).toEqual(
      generateTurnSequence(ids, 2, "snake"),
    );
    await page.reload();
    await expect(selector).toHaveValue("snake");
  });
  for (const mode of ["snake", "forward"] as const)
    test(`${mode} previews complete turns, preserves custom edits and freezes the saved order`, async ({
      page,
      context,
      isMobile,
    }, info) => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      process.env.ADMIN_OSU_IDS = "110001,120001";
      await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
      const slug = isMobile ? "draft-mobile-test" : "draft-desktop-test";
      const fixture = await prepareDraft(
        slug,
        isMobile ? 120001 : 110001,
        2,
        false,
      );
      const session = await createSession(fixture.staff.osuId);
      await context.addCookies([
        {
          name: "oclr_session",
          value: session.token,
          domain: "127.0.0.1",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const url = `/api/admin/tournaments/${slug}/draft`;
      const snapshot = await (await context.request.get(url)).json();
      const ids = snapshot.teams.map(
        (t: { team: { id: string } }) => t.team.id,
      );
      await page.goto(`/admin/tournaments/${slug}/draft`);
      const selector = page.getByRole("combobox", {
        name: "Order mode",
        exact: true,
      });
      await expect(selector).toHaveValue("custom"); // One round cannot identify a chosen pattern.
      await selector.selectOption(mode);
      await page.getByLabel("Pick rounds", { exact: true }).fill("5");
      await expect(
        page.getByText(
          "Planned turns exceed the current pool. You can save and start; each pick requires an available player.",
          {
            exact: true,
          },
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Save draft configuration",
          exact: true,
        }),
      ).toBeEnabled();
      await page.getByLabel("Pick rounds", { exact: true }).fill("3");
      const preview = page.getByRole("region", {
        name: "Full turn sequence preview",
      });
      await expect(preview.getByText("Round 3", { exact: true })).toBeVisible();
      await expect(preview.locator(":scope > ol > li > ol > li")).toHaveCount(
        6,
      );
      await expect(
        page.getByRole("button", { name: "Start draft", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Save draft configuration", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Start draft", exact: true }),
      ).toBeEnabled();
      let saved = await (await context.request.get(url)).json();
      expect(saved.session.turnSequence).toEqual(
        generateTurnSequence(ids, 3, mode),
      );
      await page.reload();
      await expect(selector).toHaveValue(mode);
      await selector.selectOption("custom");
      await page
        .getByRole("combobox", { name: "Turn 1", exact: true })
        .selectOption(ids[1]);
      await page
        .getByRole("button", { name: "Save draft configuration", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Start draft", exact: true }),
      ).toBeEnabled();
      await page.reload();
      await expect(selector).toHaveValue("custom");
      await expect(
        page.getByRole("combobox", { name: "Turn 1", exact: true }),
      ).toHaveValue(ids[1]);
      await selector.selectOption(mode);
      await page.getByLabel("Pick rounds", { exact: true }).fill("3");
      await page
        .getByRole("button", { name: "Save draft configuration", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Start draft", exact: true }),
      ).toBeEnabled();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath(`draft-order-${mode}.png`),
        fullPage: true,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Start draft", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Pause draft",
          exact: true,
        }),
      ).toBeVisible();
      await expect(selector).toHaveCount(0);
      saved = await (await context.request.get(url)).json();
      expect(saved.session.turnSequence).toEqual(
        generateTurnSequence(ids, 3, mode),
      );
      expect(
        (
          await context.request.post(url, {
            headers: { origin: "http://127.0.0.1:3100" },
            data: {
              expectedVersion: saved.session.version,
              confirmed: true,
              command: {
                action: "configure",
                expectedSetupVersion: saved.edition.setupVersion,
                turnSequence: ids,
              },
            },
          })
        ).status(),
      ).toBe(409);
    });
});
