import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { closeDb } from "../../src/db";
import { seedSession } from "./session";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import { historicalSourceDetails } from "../fixtures/historical-source-details";
import { captureResponsiveLayout } from "./responsive";

test.describe("historical archive browser workflow", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  test.setTimeout(120000);
  test.afterAll(async () => closeDb());
  test("confirms a historical substitute with unknown Tier and literal source", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const slug = `substitute-test-${isMobile ? "mobile" : "desktop"}-${Date.now()}`;
    await seedEditions([
      {
        ...edition,
        slug,
        name: "Synthetic substitute archive",
        published: true,
        status: "completed",
        registration: null,
        archive: {
          ...historicalArchive,
          editionSlug: slug,
          formatVersion: 2,
          draftMode: "final-tiers",
          picks: [],
        },
      },
    ]);
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await page.goto(`/admin/tournaments/${slug}/archive`);
    await page
      .locator("summary")
      .filter({ hasText: /^Confirm historical substitute$/ })
      .click();
    const form = page
      .locator("details")
      .filter({ has: page.getByLabel("Historical username", { exact: true }) });
    await expect(
      form.getByRole("button", {
        name: "Confirm historical substitute",
        exact: true,
      }),
    ).toBeDisabled();
    await form
      .getByLabel("Historical username", { exact: true })
      .fill("Synthetic substitute");
    await form.getByLabel("osu! ID", { exact: true }).fill("91991");
    await form.getByLabel("Team", { exact: true }).selectOption("alpha");
    await form.getByLabel("Roster source", { exact: true }).fill("TEAM!L42");
    await form
      .getByLabel("Identity confirmation source", { exact: true })
      .fill("Synthetic organizer approval");
    for (const theme of ["light", "dark"]) {
      await context.addCookies([
        { name: "oclr-theme", value: theme, domain: "127.0.0.1", path: "/" },
      ]);
      // Reopen the form after each independently rendered theme.
      await page.reload();
      await page
        .locator("summary")
        .filter({ hasText: /^Confirm historical substitute$/ })
        .click();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page.screenshot({
        path: info.outputPath(`substitute-${theme}.png`),
        fullPage: true,
      });
    }
    await form
      .getByLabel("Historical username", { exact: true })
      .fill("Synthetic substitute");
    await form.getByLabel("osu! ID", { exact: true }).fill("91991");
    await form.getByLabel("Team", { exact: true }).selectOption("alpha");
    await form.getByLabel("Roster source", { exact: true }).fill("TEAM!L42");
    await form
      .getByLabel("Identity confirmation source", { exact: true })
      .fill("Synthetic organizer approval");
    await form
      .getByRole("button", {
        name: "Confirm historical substitute",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("91991");
    await expect(dialog).toContainText("revalidated unchanged");
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    const saved = (
      await (await context.request.get(`/api/admin/tournaments/${slug}`)).json()
    ).edition;
    expect(saved.archive.players.at(-1)).toEqual({
      osuId: 91991,
      username: "Synthetic substitute",
      teamId: "alpha",
      role: "player",
      tier: null,
      source: "TEAM!L42",
    });
    expect(saved.archive.rosterReplacements).toBeUndefined();
    expect(saved.archive.matches).toEqual(historicalArchive.matches);
    await context.clearCookies();
    await page.goto(`/tournaments/${slug}/players/91991`);
    await expect(
      page.getByRole("heading", { name: "Synthetic substitute", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('a[href="https://osu.ppy.sh/users/91991"]'),
    ).toBeVisible();
  });
  test("resolves a published unknown identity without reimporting competition history", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const slug = `identity-test-${isMobile ? "mobile" : "desktop"}-${Date.now()}`;
    const archive = historicalSourceDetails(slug);
    await seedEditions([
      {
        ...edition,
        slug,
        name: "Synthetic identity archive",
        published: true,
        status: "completed",
        registration: null,
        archive,
      },
    ]);
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await page.goto(`/admin/tournaments/${slug}/archive`);
    await expect(
      page.getByRole("button", {
        name: "Resolve archive identity",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("textbox", { name: "osu! ID", exact: true })
      .fill("91991");
    await page
      .getByRole("textbox", {
        name: "Identity confirmation source",
        exact: true,
      })
      .fill("Synthetic organizer confirmation");
    for (const theme of ["light", "dark"]) {
      await context.addCookies([
        { name: "oclr-theme", value: theme, domain: "127.0.0.1", path: "/" },
      ]);
      await page.reload();
      await page
        .getByRole("textbox", { name: "osu! ID", exact: true })
        .fill("91991");
      await page
        .getByRole("textbox", {
          name: "Identity confirmation source",
          exact: true,
        })
        .fill("Synthetic organizer confirmation");
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page
        .getByRole("textbox", {
          name: "Identity confirmation source",
          exact: true,
        })
        .blur();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath(`identity-${theme}.png`),
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "Resolve archive identity", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Synthetic unknown captain → 91991");
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Resolve archive identity",
        exact: true,
      }),
    ).toHaveCount(0);
    const saved = (
      await (await context.request.get(`/api/admin/tournaments/${slug}`)).json()
    ).edition;
    expect(saved.published).toBe(true);
    expect(saved.archive.matches).toEqual(archive.matches);
    expect(
      saved.archive.players.find((p: { osuId: number }) => p.osuId === 91991),
    ).toMatchObject({
      username: "Synthetic unknown captain",
      teamId: "beta",
      role: "captain",
      tier: 0,
    });
    await context.clearCookies();
    await page.goto(`/tournaments/${slug}/players`);
    await expect(
      page.locator(`a[href="/tournaments/${slug}/players/91991"]`).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Synthetic organizer confirmation", { exact: true }),
    ).toHaveCount(0);
  });
  test("approves a historical draw without selecting a winning team", async ({
    page,
    context,
    isMobile,
  }) => {
    const slug = `draw-test-${isMobile ? "mobile" : "desktop"}-${Date.now()}`;
    const archive = historicalSourceDetails(slug);
    archive.matches = [archive.matches[0]];
    archive.matches[0].review!.workingScore = [5, 5];
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await seedEditions([
      {
        ...edition,
        slug,
        name: "Synthetic draw archive",
        published: false,
        status: "completed",
        registration: null,
        archive,
      },
    ]);
    await page.goto(`/admin/tournaments/${slug}/archive`);
    await page
      .getByRole("button", { name: "Approve reviewed matches", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await (
              await context.request.get(`/api/admin/tournaments/${slug}`)
            ).json()
          ).edition.archive.matches[0].review.status,
      )
      .toBe("approved");
    const saved = await (
      await context.request.get(`/api/admin/tournaments/${slug}`)
    ).json();
    expect(saved.edition.published).toBe(false);
    expect(saved.edition.archive.matches[0].score).toEqual([5, 5]);
    await page.goto(
      `/admin/tournaments/${slug}/archive/preview?section=match&id=${archive.matches[0].id}`,
    );
    await expect(page.locator('[data-winner="true"]')).toHaveCount(0);
    await page.goto(`/admin/tournaments/${slug}/settings`);
    await page.getByRole("tab", { name: "Publication", exact: true }).click();
    await page
      .getByRole("button", { name: "Publish tournament", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await (
              await context.request.get(`/api/admin/tournaments/${slug}`)
            ).json()
          ).edition.published,
      )
      .toBe(true);
    await context.clearCookies();
    for (const section of ["schedule", "bracket"]) {
      await page.goto(`/tournaments/${slug}/${section}`);
      await expect(page.locator('[data-winner="true"]')).toHaveCount(0);
      if (section === "schedule")
        await expect(page.locator(".event-score")).toContainText("5 : 5");
    }
  });
  for (const season of [3, 4])
    test(`shows S${season} original artwork and the saved four rule sections publicly`, async ({
      page,
      context,
      isMobile,
      baseURL,
    }, info) => {
      const slug = `s${season}-content-${isMobile ? "mobile" : "desktop"}-test`;
      const sections = JSON.parse(
        readFileSync(`docs/imports/s${season}-rules.json`, "utf8"),
      ).map((s: { title: string; content: string }) => ({
        heading: s.title,
        body: s.content,
      }));
      await seedEditions([
        {
          ...edition,
          slug,
          name: `S${season} public content verification`,
          season: String(season),
          status: "completed",
          published: true,
          registration: null,
          branding: { logo: null, keyVisual: null, background: null },
          archive: {
            ...historicalArchive,
            formatVersion: 2,
            editionSlug: slug,
            sourceUrl:
              season === 3
                ? "https://docs.google.com/spreadsheets/d/1o4asx7nZQTAWwNjK_TyB_aq2ZWD471BHAxcdLp-TPAo"
                : "https://docs.google.com/spreadsheets/d/1QqF8leIqov2l3loi92hFHu82HEuplb9Iau2zPNUcySk",
            sourceFacts: [
              {
                category: "review",
                label: "Private source",
                text: "Synthetic private appendix sentinel",
                source: "Synthetic evidence",
              },
            ],
          },
          rules: {
            version: `Synthetic S${season} saved version`,
            sections,
          },
        },
      ]);
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          { name: "oclr-theme", value: theme, url: baseURL! },
        ]);
        await page.goto("/tournaments");
        const card = page
          .locator(".edition-card")
          .filter({ has: page.locator(`a[href="/tournaments/${slug}"]`) });
        await card.scrollIntoViewIfNeeded();
        await expect(card.locator("img")).toHaveAttribute(
          "src",
          `/archive/s${season}/key-visual.avif`,
        );
        const width = season === 3 ? 995 : 1728;
        const height = season === 3 ? 621 : 1080;
        await expect(card.locator("img")).toHaveJSProperty(
          "naturalWidth",
          width,
        );
        await expect(card.locator("img")).toHaveAttribute(
          "width",
          String(width),
        );
        await expect(card.locator("img")).toHaveAttribute(
          "height",
          String(height),
        );
        await page.goto(`/tournaments/${slug}`);
        const visual = page.locator(".archive-key-visual img");
        await expect(visual).toHaveJSProperty("naturalWidth", width);
        await expect(visual).toHaveAttribute("height", String(height));
        await expect(
          page.getByText("Synthetic private appendix sentinel", {
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(page.locator(".rules-article > section")).toHaveCount(4);
        expect(
          (
            await page
              .locator(
                ".rules-article > section h2, .rules-article > section h3",
              )
              .allTextContents()
          ).map((text) => text.replace(/^\d{2}/, "")),
        ).toEqual(sections.map((s: { heading: string }) => s.heading));
        for (let i = 0; i < sections.length; i++)
          expect(
            (
              await page
                .locator(".rules-article > section")
                .nth(i)
                .locator(".preserve-lines")
                .textContent()
            )?.trim(),
          ).toBe(sections[i].body);
        const pdf = await page.request.get(`/archive/s${season}/rules.pdf`);
        expect(pdf.ok()).toBe(true);
        expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
        await captureResponsiveLayout(
          page,
          info,
          `s${season}-content-${theme}`,
        );
        await page.screenshot({
          path: info.outputPath(`s${season}-content-${theme}.png`),
          fullPage: true,
        });
      }
    });
  test("shows S6 source artwork in the directory and its configured rule sections", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const slug = `s6-rules-${isMobile ? "mobile" : "desktop"}-test-${Date.now()}`;
    const archive = historicalArchiveSchema.parse({
      ...JSON.parse(
        readFileSync("docs/imports/s6-confirmed-archive.json", "utf8"),
      ),
      editionSlug: slug,
    });
    const rules = JSON.parse(
      readFileSync("docs/imports/s6-configured-rules.json", "utf8"),
    );
    const summary =
      "osu! Chinese League Rookie — Season 6. 2021 年歷史賽事歸檔。";
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await context.addCookies([
      { name: "oclr-theme", value: "dark", domain: "127.0.0.1", path: "/" },
      {
        name: "oclr-appearance",
        value: "default",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    await seedEditions([
      {
        ...edition,
        slug,
        name: "S6 card and rules verification",
        season: "6",
        summary,
        branding: { logo: null, keyVisual: null, background: null },
        status: "completed",
        registration: null,
        published: true,
        archive,
        rules,
      },
    ]);
    await page.goto(`/admin/tournaments/${slug}/archive`);
    await page
      .getByRole("button", { name: "Approve reviewed matches", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Approve reviewed matches",
        exact: true,
      }),
    ).toHaveCount(0);
    const approved = await (
      await context.request.get(`/api/admin/tournaments/${slug}`)
    ).json();
    expect(approved.edition.published).toBe(true);
    expect(approved.edition.rules).toEqual(rules);
    expect(
      approved.edition.archive.matches.filter(
        (m: { score: unknown }) => m.score,
      ),
    ).toHaveLength(33);
    expect(
      approved.edition.archive.matches.flatMap(
        (m: { review: { games: unknown[] } }) => m.review.games,
      ),
    ).toEqual(archive.matches.flatMap((m) => m.review!.games));
    await page.locator("[data-archive-appendix] > summary").click();
    await expect(page.locator("[data-archive-appendix]")).toContainText("348");
    await page.goto("/tournaments");
    const card = page.locator(".edition-card").filter({
      has: page.locator(`a[href="/tournaments/${slug}"]`),
    });
    await expect(card.locator("img")).toHaveAttribute(
      "src",
      "/archive/s6/key-visual.jpg",
    );
    await expect(card.locator("img")).toHaveAttribute("width", "1920");
    await expect(card.locator("img")).toHaveAttribute("height", "1080");
    await expect(card).toContainText(summary);
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator("img")).toHaveJSProperty("naturalWidth", 1920);
    await card.screenshot({
      path: info.outputPath("s6-directory-card.png"),
      animations: "disabled",
    });
    await card
      .getByRole("link", { name: "View tournament", exact: true })
      .click();
    await expect(page.locator(".rules-article > section")).toHaveCount(4);
    for (const section of rules.sections)
      await expect(page.locator(".rules-article")).toContainText(section.body);
    await expect(page.locator(".rules-article")).toContainText(
      "【已废止的原提案；原规则文档中已划除】",
    );
    await captureResponsiveLayout(page, info, "s6-configured-rules");
    await expect(
      page.getByRole("heading", { name: "Review source records" }),
    ).toHaveCount(0);
    await page.goto(`/tournaments/${slug}/schedule`);
    await expect(
      page.getByText("No recorded matches.", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".event-matches tbody tr")).toHaveCount(33);
    await expect(
      page.locator('.event-matches tr[data-recorded="true"]'),
    ).toHaveCount(33);
    await expect(page.locator("#row-mp-84398168")).toContainText("3 : 5");
    await expect(page.locator("#row-mp-85503945")).toContainText("2 : 6");
    await expect(page.locator("#row-mp-85503945")).toContainText(
      "MP room opened",
    );
    await expect(page.locator("#row-mp-85503945")).not.toContainText(
      "Unconfirmed records",
    );
    await page
      .getByRole("heading", { name: "Match information", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath("s6-public-schedule-viewport.png"),
      animations: "disabled",
    });
    await captureResponsiveLayout(page, info, "s6-public-schedule");
    await page.goto(`/tournaments/${slug}/results`);
    await expect(page).toHaveURL(new RegExp(`/schedule\\?status=recorded$`));
    await expect(page.locator(".event-matches tbody tr")).toHaveCount(33);
    await page.goto(`/tournaments/${slug}/matches/mp-85503945`);
    await expect(page.locator(".archive-score-team strong")).toHaveText([
      "2",
      "6",
    ]);
    await expect(
      page.getByRole("heading", { name: "Review source records" }),
    ).toHaveCount(0);
    await expect(
      page.locator('.archive-score-team[data-winner="true"]'),
    ).toHaveCount(1);
    await expect(
      page.getByText("All import fields", { exact: true }),
    ).toHaveCount(0);
    const guest = await context.browser()!.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(
      `${new URL(page.url()).origin}/tournaments/${slug}/schedule`,
    );
    await expect(guestPage.locator(".event-matches tbody tr")).toHaveCount(33);
    await guest.close();
    await page.goto(`/admin/tournaments/${slug}/settings`);
    await expect(
      page
        .getByLabel("Square logo")
        .locator('option[value="/archive/s6/key-visual.jpg"]'),
    ).toHaveCount(1);
    await expect(
      page
        .getByLabel("Key visual")
        .locator('option[value="/archive/s6/key-visual.jpg"]'),
    ).toHaveCount(1);
  });
  test("imports the complete S6 review package privately without resolving pending interpretations", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const slug = `s6-${isMobile ? "mobile" : "desktop"}-test-${Date.now()}`;
    const archive = historicalArchiveSchema.parse({
      ...JSON.parse(readFileSync("docs/imports/s6-archive.json", "utf8")),
      editionSlug: slug,
    });
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await seedEditions([
      {
        ...edition,
        slug,
        name: "S6 private import verification",
        season: "6",
        published: false,
        status: "completed",
        registration: null,
      },
    ]);
    await page.goto(`/admin/tournaments/${slug}/archive`);
    await page.getByLabel("Archive JSON file", { exact: true }).setInputFiles({
      name: "s6-archive.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(archive, null, 2)),
    });
    await page
      .getByRole("button", { name: "Validate and review archive" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review source records" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save archive draft", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Archive draft saved");
    const saved = await (
      await context.request.get(`/api/admin/tournaments/${slug}`)
    ).json();
    expect(saved.edition.published).toBe(false);
    expect(saved.edition.archive).toEqual(archive);
    await page.goto(
      `/admin/tournaments/${slug}/archive/preview?section=match&id=mp-84398168`,
    );
    await expect(
      page.getByText("Unconfirmed records · 3 : 5", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Review source records" }),
    ).toHaveCount(0);
    await page.goto(
      `/admin/tournaments/${slug}/archive/preview?section=match&id=mp-85503945`,
    );
    await expect(
      page.getByText("Unconfirmed records · 2 : 5", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Review source records" }),
    ).toHaveCount(0);
    await page.goto(`/admin/tournaments/${slug}/archive`);
    await page.locator("[data-archive-appendix] > summary").click();
    await expect(page.locator("[data-archive-appendix]")).toContainText(
      "實際可能為 2:6，待確認",
    );
    await captureResponsiveLayout(page, info, "s6-pending-results");
    await page.goto(`/admin/tournaments/${slug}/archive/preview?section=teams`);
    await expect(page.getByText("Fushimi Rio", { exact: true })).toBeVisible();
    await expect(page.getByText("VICE", { exact: true })).toHaveCount(12);
    expect(
      await page.locator('a[href*="8425774"],a[href*="14947596"]').count(),
    ).toBe(0);
    await page.goto(
      `/admin/tournaments/${slug}/archive/preview?section=pool&id=es`,
    );
    await expect(page.locator(".archive-map-item")).toHaveCount(19);
    await expect(page.locator(".map-open-button").first()).toHaveText(
      "Not recorded",
    );
    const guest = await context.browser()!.newContext();
    expect(
      (
        await guest.request.get(
          `${new URL(page.url()).origin}/tournaments/${slug}`,
        )
      ).status(),
    ).toBe(404);
    await guest.close();
  });
  test("preserves unknown identities, replacement evidence and pending scores in a private draft", async ({
    page,
    context,
    isMobile,
  }) => {
    const slug = `source-${isMobile ? "mobile" : "desktop"}-test-${Date.now()}`;
    const archive = historicalSourceDetails(slug);
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await seedEditions([
      {
        ...edition,
        slug,
        name: "Synthetic source archive",
        season: "6",
        published: false,
        status: "completed",
        registration: null,
      },
    ]);
    await page.goto(`/admin/tournaments/${slug}/archive`);
    await page.getByLabel("Archive JSON file", { exact: true }).setInputFiles({
      name: "source-archive.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(archive)),
    });
    await page
      .getByRole("button", { name: "Validate and review archive" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review source records" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save archive draft", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Archive draft saved");
    const saved = await (
      await context.request.get(`/api/admin/tournaments/${slug}`)
    ).json();
    expect(saved.edition.published).toBe(false);
    expect(saved.edition.archive).toEqual(archive);
    await page.goto(`/admin/tournaments/${slug}/archive/preview`);
    await expect(
      page.getByText("Private archive preview", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Synthetic raw qualifier", { exact: true }),
    ).toHaveCount(0);
    await page.goto(`/admin/tournaments/${slug}/archive/preview?section=teams`);
    await expect(
      page.getByText("Synthetic unknown captain", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("VICE", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Synthetic replacement history; dates and membership are unknown.",
      ),
    ).toBeVisible();
    expect(
      await page
        .locator('a[href*="91005"],a[href*="91006"],a[href*="null"]')
        .count(),
    ).toBe(0);
    await page.goto(
      `/admin/tournaments/${slug}/archive/preview?section=match&id=${archive.matches[0].id}`,
    );
    await expect(
      page.getByText("Unconfirmed records · 3 : 5", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Synthetic post-match TB hypothesis, awaiting confirmation.",
        { exact: true },
      ),
    ).toHaveCount(0);
    await page.goto(`/admin/tournaments/${slug}/archive`);
    await page.locator("[data-archive-appendix] > summary").click();
    await page.getByText("Synthetic raw qualifier", { exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "1234567", exact: true }),
    ).toBeVisible();
    await expect(page.locator("[data-archive-appendix]")).toContainText(
      "Synthetic post-match TB hypothesis, awaiting confirmation.",
    );
    await page.goto(
      `/admin/tournaments/${slug}/archive/preview?section=mappools`,
    );
    await page
      .getByRole("button", { name: "View NM1: Not recorded", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(
      "Not recorded",
    );
    await page.keyboard.press("Escape");
    const guest = await context.browser()!.newContext();
    expect(
      (
        await guest.request.get(
          `${new URL(page.url()).origin}/tournaments/${slug}`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await guest.request.get(
          `${new URL(page.url()).origin}/admin/tournaments/${slug}/archive/preview`,
          { maxRedirects: 0 },
        )
      ).status(),
    ).not.toBe(200);
    await guest.close();
    await captureResponsiveLayout(
      page,
      test.info(),
      `source-archive-${isMobile ? "mobile" : "desktop"}`,
    );
  });
  test("reviews private import, explicitly publishes, and keeps every detail in its edition", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const slug = `history-${isMobile ? "mobile" : "desktop"}-test-${Date.now()}`;
    const archive = { ...historicalArchive, editionSlug: slug };
    await context.addCookies([await seedSession(isMobile ? 70001 : 60001)]);
    await seedEditions([
      {
        ...edition,
        slug,
        name: "Synthetic historical season",
        season: "9",
        published: false,
        status: "completed",
        registration: null,
      },
    ]);
    const endpoint = `/api/admin/tournaments/${slug}`;
    await page.goto(`/admin/tournaments/${slug}/archive`);
    await page.getByLabel("Archive JSON file", { exact: true }).setInputFiles({
      name: "synthetic-archive.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(archive)),
    });
    await page
      .getByRole("button", { name: "Validate and review archive" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review source records" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save archive draft", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Archive draft saved");
    const saved = await (await context.request.get(endpoint)).json();
    expect(saved.edition.published).toBe(false);
    expect(saved.edition.archive).toEqual(archive);
    await page
      .getByRole("link", { name: "Open saved archive preview" })
      .click();
    await expect(
      page.getByText("Private archive preview", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".historical-archive")).not.toContainText(
      "Sources and coverage",
    );
    await expect(
      page.locator(`.historical-archive a[href="${archive.sourceUrl}"]`),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Staff", exact: true }).click();
    await expect(page).toHaveURL(/archive\/preview\?section=staff$/);
    await expect(page.locator(".archive-staff")).toContainText(
      "Historical Host",
    );
    await expect(page.locator(".archive-staff")).not.toContainText("Staff!A2");
    await page
      .getByRole("link", { name: "Archive overview", exact: true })
      .click();
    await page.getByRole("link", { name: "Teams", exact: true }).last().click();
    await page
      .getByRole("link", { name: "Synthetic Alpha", exact: true })
      .first()
      .click();
    await expect(
      page
        .getByRole("heading", { name: "Synthetic Alpha", exact: true })
        .first(),
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/admin/tournaments/${slug}/archive/preview`),
    );
    await page.goto(
      `/admin/tournaments/${slug}/archive/preview?section=players`,
    );
    await page
      .getByRole("searchbox", { name: "Search players", exact: true })
      .fill("91003");
    await expect(page.locator(".archive-player-card")).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Historical Player", exact: true }),
    ).toHaveAttribute(
      "href",
      `/admin/tournaments/${slug}/archive/preview?section=players&id=91003`,
    );
    await page.goto(
      `/admin/tournaments/${slug}/archive/preview?section=mappools`,
    );
    await expect(page.locator(".archive-map-item")).toHaveCount(2);
    await page
      .getByRole("navigation", { name: "Mappool stages" })
      .getByRole("link")
      .click();
    await expect(page).toHaveURL(
      new RegExp(
        `/admin/tournaments/${slug}/archive/preview\\?section=mappools&id=final`,
      ),
    );
    await expect(page.locator(".archive-map-item")).toHaveCount(2);
    await page.goto(
      `/admin/tournaments/${slug}/archive/preview?section=schedule`,
    );
    await page
      .getByLabel("Match status", { exact: true })
      .selectOption("unconfirmed");
    await expect(page.locator(".event-matches tbody tr")).toHaveCount(1);
    await expect(
      page
        .locator(".event-matches")
        .getByText("Unconfirmed alternative", { exact: true }),
    ).toBeVisible();
    const guest = await context.browser()!.newContext();
    expect(
      (
        await guest.request.get(
          `${new URL(page.url()).origin}/tournaments/${slug}/staff`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await guest.request.get(
          `${new URL(page.url()).origin}/tournaments/${slug}`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await guest.request.get(
          `${new URL(page.url()).origin}/api/admin/tournaments/${slug}`,
        )
      ).ok(),
    ).toBe(false);
    await guest.close();
    const denied = await context.request.post(endpoint, {
      data: {
        action: "publication",
        expectedRevision: 1,
        confirmed: true,
        published: true,
      },
      headers: { Origin: "https://wrong.example" },
    });
    expect(denied.status()).toBe(403);
    await page.goto(`/admin/tournaments/${slug}/settings?tab=publication`);
    await page.getByRole("tab", { name: "Publication", exact: true }).click();
    await page
      .getByRole("button", { name: "Publish tournament", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await context.request.get(endpoint)).json()).edition
            .published,
      )
      .toBe(true);
    await context.clearCookies();
    await context.addCookies([
      { name: "oclr-locale", value: "en", domain: "127.0.0.1", path: "/" },
    ]);
    await page.goto("/tournaments");
    await expect(
      page.getByRole("heading", { name: "Historical seasons" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Current tournaments" }),
    ).toBeVisible();
    await page.goto(`/tournaments/${slug}`);
    if (isMobile)
      await page.getByRole("button", { name: /Tournament menu/ }).click();
    await page
      .getByRole("navigation", { name: "Tournament navigation" })
      .getByRole("link", { name: "Staff", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/tournaments/${slug}/staff$`));
    await expect(
      page.getByRole("heading", { name: "Staff", exact: true }),
    ).toBeVisible();
    if (isMobile)
      await page.getByRole("button", { name: /Tournament menu/ }).click();
    await expect(
      page
        .getByRole("navigation", { name: "Tournament navigation" })
        .getByRole("link", { name: "Staff", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".archive-staff a")).toHaveAttribute(
      "href",
      "https://osu.ppy.sh/users/91005",
    );
    expect(
      (await context.request.get("/tournaments/test-cup/staff")).status(),
    ).toBe(404);
    for (const appearance of ["default", "cute-pastel", "swiss-minimal"]) {
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          {
            name: "oclr-appearance",
            value: appearance,
            domain: "127.0.0.1",
            path: "/",
          },
          { name: "oclr-theme", value: theme, domain: "127.0.0.1", path: "/" },
        ]);
        await page.goto(`/tournaments/${slug}`);
        await expect(
          page.getByRole("heading", {
            name: "Synthetic historical season",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.locator(`.historical-archive a[href="${archive.sourceUrl}"]`),
        ).toHaveCount(0);
        await expect(page.locator(".historical-archive")).not.toContainText(
          "Sources and coverage",
        );
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
      }
    }
    const staffLink = page
      .getByRole("navigation", { name: "Tournament navigation" })
      .getByRole("link", { name: "Staff", exact: true });
    if (isMobile)
      await page.getByRole("button", { name: /Tournament menu/ }).click();
    await expect(staffLink).toHaveAttribute(
      "href",
      `/tournaments/${slug}/staff`,
    );
    await staffLink.click();
    if (isMobile)
      await page.getByRole("button", { name: /Tournament menu/ }).click();
    await expect(staffLink).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".archive-staff")).toContainText(
      "Historical Host",
    );
    await page.goto(`/tournaments/${slug}`);
    await captureResponsiveLayout(page, info, "archive-overview");
    await page.goto(`/tournaments/${slug}/teams/alpha`);
    await expect(page.locator(".historical-archive")).not.toContainText(
      archive.teams[0].source,
    );
    await page
      .getByRole("link", { name: "Historical Player", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/tournaments/${slug}/players/91003$`),
    );
    await expect(page.getByText("Tier 1", { exact: true })).toBeVisible();
    await expect(page.locator(".historical-archive")).not.toContainText(
      archive.players.find((p) => p.osuId === 91003)!.source,
    );
    await page.goto(`/tournaments/${slug}/players`);
    await expect(
      page.locator('.archive-player-card[data-role="coach"]'),
    ).toContainText("Coach");
    await expect(
      page.locator(".archive-player-card img").first(),
    ).toHaveAttribute("src", /a\.ppy\.sh\/91001/);
    await captureResponsiveLayout(page, info, "archive-players");
    await page.goto(`/tournaments/${slug}/results`);
    await expect(page).toHaveURL(new RegExp(`/schedule\\?status=recorded$`));
    await expect(
      page.getByText("Unconfirmed alternative", { exact: true }),
    ).toHaveCount(0);
    await page
      .locator(".event-matches")
      .getByRole("link", { name: "Historical Final", exact: true })
      .click();
    await expect(page.getByRole("link", { name: "MP 1" })).toHaveAttribute(
      "href",
      "https://osu.ppy.sh/community/matches/123456",
    );
    await page.goto(`/tournaments/${slug}/schedule`);
    await expect(page.locator(".event-matches tbody tr")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: /Unconfirmed records/ }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Unconfirmed alternative", { exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Rounds", { exact: true }).selectOption("Final");
    await expect(page.locator(".event-matches tbody tr")).toHaveCount(1);
    await captureResponsiveLayout(page, info, "archive-matches");
    await page.goto(`/tournaments/${slug}/draft`);
    await expect(
      page.getByRole("heading", { name: "Round 1", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".archive-draft-picks li")).toHaveCount(1);
    await captureResponsiveLayout(page, info, "archive-draft");
    await page.goto(`/tournaments/${slug}/bracket`);
    await page.getByRole("button", { name: "Knockout", exact: true }).click();
    await expect(page.locator(".bracket-round")).toHaveCount(1);
    await expect(
      page.locator('.bracket-frame [data-match-id="one"]'),
    ).toBeVisible();
    await expect(
      page.locator('.bracket-frame [data-match-id="alternative"]'),
    ).toHaveCount(0);
    await captureResponsiveLayout(page, info, "archive-bracket");
    await page.goto(`/tournaments/${slug}/mappools/final`);
    await expect(
      page.getByText("Beatmap ID unresolved", { exact: false }),
    ).toBeVisible();
    await expect(page.locator(".archive-map-stats").first()).toContainText(
      "2:03",
    );
    await page.getByRole("tab", { name: "TB", exact: true }).click();
    await expect(page.locator(".archive-map-item")).toHaveCount(1);
    await expect(
      page
        .locator(".archive-map-stats")
        .getByLabel("Not recorded", { exact: true }),
    ).toHaveCount(6);
    await page.getByRole("tab", { name: "All mods", exact: true }).click();
    await captureResponsiveLayout(page, info, "archive-pool");
    for (const path of ["bracket", "draft", "rules", "results/awards"]) {
      expect(
        (
          await page.goto(
            path === "rules"
              ? `/tournaments/${slug}#rules`
              : `/tournaments/${slug}/${path}`,
          )
        )?.status(),
      ).toBe(200);
    }
    for (const path of [
      "teams/missing",
      "players/9999",
      "mappools/missing",
      "matches/missing",
      "matches/alternative",
    ]) {
      expect((await page.goto(`/tournaments/${slug}/${path}`))?.status()).toBe(
        404,
      );
    }
    for (const locale of ["zh-Hans", "zh-Hant"]) {
      await context.addCookies([
        { name: "oclr-locale", value: locale, domain: "127.0.0.1", path: "/" },
      ]);
      await page.goto(`/tournaments/${slug}/players`);
      await expect(
        page.getByText(locale === "zh-Hant" ? "歷史歸檔" : "历史归档", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText("Captain", { exact: true })).toHaveCount(2);
      const search = page.getByRole("searchbox", {
        name: locale === "zh-Hant" ? "搜尋選手" : "搜索选手",
        exact: true,
      });
      await search.fill("91003");
      await expect(page.locator(".archive-player-card")).toHaveCount(1);
      await page.goto(`/tournaments/${slug}/staff`);
      await expect(
        page.getByRole("heading", {
          name: locale === "zh-Hant" ? "工作人員" : "工作人员",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator(".archive-staff")).toContainText(
        "Historical Host",
      );
    }
  });
  test("renders the complete S9 archive across appearances without inventing results", async ({
    page,
    context,
    isMobile,
  }, info) => {
    const slug = `s9-design-${isMobile ? "mobile" : "desktop"}-${Date.now()}`;
    const archive = historicalArchiveSchema.parse({
      ...JSON.parse(readFileSync("docs/imports/s9-archive.json", "utf8")),
      editionSlug: slug,
    });
    await seedEditions([
      {
        ...edition,
        slug,
        name: "S9 archive design verification",
        branding: { ...edition.branding, logo: "/archive/s9/thumbnail.png" },
        season: "9",
        published: true,
        status: "completed",
        registration: null,
        archive,
      },
    ]);
    await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 1000 });
    for (const appearance of ["default", "cute-pastel", "swiss-minimal"])
      for (const theme of ["light", "dark"]) {
        await context.addCookies([
          {
            name: "oclr-appearance",
            value: appearance,
            domain: "127.0.0.1",
            path: "/",
          },
          { name: "oclr-theme", value: theme, domain: "127.0.0.1", path: "/" },
        ]);
        await page.goto("/tournaments");
        const card = page
          .locator(".edition-card")
          .filter({ has: page.locator(`a[href="/tournaments/${slug}"]`) });
        await card.scrollIntoViewIfNeeded();
        const thumbnail = card.locator(".edition-art img");
        await expect(thumbnail).toHaveAttribute(
          "src",
          "/archive/s9/thumbnail.png",
        );
        await expect
          .poll(() =>
            thumbnail.evaluate((img) => (img as HTMLImageElement).naturalWidth),
          )
          .toBe(1920);
        const bounds = await thumbnail.boundingBox();
        expect(bounds!.width / bounds!.height).toBeCloseTo(16 / 9, 2);
        await card.screenshot({
          path: info.outputPath(`s9-thumbnail-${appearance}-${theme}.png`),
        });
        for (const path of [
          "schedule",
          "players",
          "draft",
          "bracket",
          "mappools",
          "staff",
          "rules",
        ]) {
          await page.goto(
            path === "rules"
              ? `/tournaments/${slug}#rules`
              : `/tournaments/${slug}/${path}`,
          );
          if (path === "schedule") {
            await expect(page.locator(".event-matches tbody tr")).toHaveCount(
              22,
            );
            await expect(
              page.getByRole("button", { name: /Unconfirmed records/ }),
            ).toHaveCount(0);
          } else if (path === "rules") {
            await expect(page.locator(".rules-article > section")).toHaveCount(
              8,
            );
            await expect(page.locator(".rules-illustration img")).toHaveCount(
              2,
            );
            await expect(page.locator(".rules-version")).toContainText("v1.2");
            await expect(page.locator(".rules-article")).toContainText(
              "没有总决赛reset！",
            );
            await expect(page.locator(".rules-article")).not.toContainText(
              "Synthetic rules",
            );
            for (const image of await page
              .locator(".rules-illustration img")
              .all()) {
              await image.scrollIntoViewIfNeeded();
              await expect
                .poll(() =>
                  image.evaluate(
                    (img) => (img as HTMLImageElement).naturalWidth,
                  ),
                )
                .toBeGreaterThan(0);
            }
            await page
              .locator(".rules-article h2")
              .first()
              .scrollIntoViewIfNeeded();
          } else if (path === "players") {
            await expect(page.locator(".archive-player-card")).toHaveCount(76);
            await expect(page.locator('[data-role="coach"]')).toHaveCount(8);
            const search = page.getByRole("searchbox", {
              name: "Search players",
              exact: true,
            });
            await search.fill("  VIALVISTAS  ");
            await expect(page.locator(".archive-player-card")).toHaveCount(1);
            await expect(page.locator(".archive-player-card")).toContainText(
              "9697708",
            );
            await search.fill("9697708");
            await expect(page.locator(".archive-player-card")).toHaveCount(1);
            await search.fill(archive.teams[0].name);
            await expect(page.locator(".archive-player-card")).toHaveCount(9);
            await search.fill("missing synthetic identity");
            await expect(page.locator(".archive-player-card")).toHaveCount(0);
            await expect(
              page.getByText("No players match your search.", { exact: true }),
            ).toBeVisible();
            await search.fill("");
            await expect(page.locator(".archive-player-card")).toHaveCount(76);
          } else if (path === "draft") {
            await expect(page.locator(".archive-draft-round")).toHaveCount(7);
            await expect(page.locator(".archive-draft-picks li")).toHaveCount(
              56,
            );
          } else if (path === "staff") {
            await expect(page.locator(".archive-staff section")).toHaveCount(8);
            await expect(
              page.locator(".archive-staff .public-staff-list > li"),
            ).toHaveCount(19);
            for (const person of archive.staff) {
              await expect(
                page
                  .locator(".archive-staff")
                  .getByRole("link", { name: person.username, exact: true }),
              ).toHaveAttribute(
                "href",
                `https://osu.ppy.sh/users/${person.osuId}`,
              );
              await expect(page.locator(".archive-staff")).not.toContainText(
                person.source,
              );
            }
          } else if (path === "mappools") {
            await expect(page.locator(".archive-map-item")).toHaveCount(19);
            await expect(
              page
                .getByRole("navigation", { name: "Mappool stages" })
                .getByRole("link"),
            ).toHaveCount(4);
            await expect(page.locator(".archive-pool-source")).toHaveCount(0);
          } else {
            await page
              .getByRole("button", { name: "Knockout", exact: true })
              .click();
            // Knockout now uses the SVG double-elimination renderer; the old
            // chronological-column DOM is only used by grid/editor views.
            const canvas = page.locator(".bracket-library-scroll");
            await expect(canvas).toBeVisible();
            await expect(canvas.locator(".match-card")).toHaveCount(10);
            for (const match of archive.matches.slice(12)) {
              const card = canvas.locator(`[data-match-id="${match.id}"]`);
              // The source retains an unscored alternative (match-20a).
              // It must not become a fabricated result in the bracket.
              if (!match.score) {
                await expect(card).toHaveCount(0);
                continue;
              }
              await expect(card).toHaveCount(1);
              await expect(card.getByRole("heading")).toHaveText(match.label);
              await expect(
                card.getByRole("link", { name: "Match details", exact: true }),
              ).toHaveAttribute(
                "href",
                `/tournaments/${slug}/matches/${match.id}`,
              );
              await expect(
                card.locator("[data-original-slot='0'] strong"),
              ).toHaveText(String(match.score[0]));
              await expect(
                card.locator("[data-original-slot='1'] strong"),
              ).toHaveText(String(match.score[1]));
            }
            await expect(canvas.locator("svg path").first()).toBeVisible();
            await page.getByText("Connection sources", { exact: true }).click();
            await expect(
              page.locator(".bracket-source-details li"),
            ).toHaveCount(12);
            await expect(
              page.locator(".bracket-source-details .match-source"),
            ).toHaveCount(12);
            const references = page.getByRole("checkbox", {
              name: "Show previous recorded appearances (reference only)",
            });
            await references.uncheck();
            await expect(canvas.locator("svg path").first()).toBeHidden();
            await expect(canvas.locator(".match-card")).toHaveCount(10);
            await references.check();
            await expect(canvas.locator("svg path").first()).toBeVisible();
            await page
              .locator(".archive-competition > .event-tabs button")
              .first()
              .click();
            for (const label of ["A", "B"]) {
              await page
                .getByRole("button", { name: label, exact: true })
                .click();
              const cards = page.locator(".bracket-group-grid .match-card");
              await expect(cards).toHaveCount(6);
              expect(
                (await new AxeBuilder({ page }).analyze()).violations,
              ).toEqual([]);
              await expect(page.locator(".bracket-connectors")).toHaveCount(0);
              const first = await cards.nth(0).boundingBox();
              const second = await cards.nth(1).boundingBox();
              expect(first).not.toBeNull();
              expect(second).not.toBeNull();
              if (isMobile) expect(second!.y).toBeGreaterThan(first!.y);
              else {
                expect(Math.abs(first!.y - second!.y)).toBeLessThan(1);
                expect(second!.x).toBeGreaterThan(first!.x);
              }
              await page.screenshot({
                path: info.outputPath(
                  `${appearance}-${theme}-group-${label}.png`,
                ),
                fullPage: false,
              });
            }
            await page
              .getByRole("button", { name: "Knockout", exact: true })
              .click();
          }
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
            [],
          );
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(isMobile ? 390 : 1440);
          await page.screenshot({
            path: info.outputPath(`${appearance}-${theme}-${path}.png`),
            fullPage: false,
          });
        }
      }
    await page.goto(`/tournaments/${slug}`);
    await expect(page.locator("#rules .rules-article > section")).toHaveCount(
      8,
    );
    await expect(page.locator("#rules .rules-version")).toContainText("v1.2");
    await expect(page.locator("#rules .rules-article")).toContainText(
      "没有总决赛reset！",
    );
    await expect(page.locator("#rules .rules-illustration img")).toHaveCount(2);
    await page.screenshot({
      path: info.outputPath("historical-overview-rules.png"),
      fullPage: true,
    });
    await page.goto(`/tournaments/${slug}/rules`);
    if (isMobile) await page.locator(".rules-mobile-contents summary").click();
    const contents = page.locator(
      isMobile ? ".rules-mobile-contents nav" : ".rules-desktop-contents nav",
    );
    await contents.getByRole("link", { name: "EX模式", exact: true }).click();
    await expect(page.locator(".rules-article h2").last()).toBeInViewport();
    if (isMobile)
      await expect(page.locator(".rules-mobile-contents")).not.toHaveAttribute(
        "open",
        "",
      );
    for (const unplayed of archive.matches.filter((m) => m.score === null)) {
      expect(
        (
          await context.request.get(
            `/tournaments/${slug}/matches/${unplayed.id}`,
          )
        ).status(),
      ).toBe(404);
    }
    await page.goto(`/tournaments/${slug}/mappools`);
    const stageNav = page.getByRole("navigation", { name: "Mappool stages" });
    await expect(
      page.locator(".archive-map-cards .map-browse-card"),
    ).toHaveCount(19);
    const opener = page.locator(".map-open-button").first();
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(
      archive.pools[0].maps[0].title ?? "Not recorded",
    );
    await page.getByRole("button", { name: "Next map", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(
      archive.pools[0].maps[1].title ?? "Not recorded",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();

    for (const pool of archive.pools) {
      await stageNav
        .getByRole("link", {
          name: `${pool.name} ${pool.maps.length}`,
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(new RegExp(`/mappools/${pool.id}$`));
      await page
        .getByRole("button", { name: "Compact table", exact: true })
        .click();
      await page
        .getByLabel(`Sort ${pool.name}`, { exact: true })
        .selectOption("title");
      const titleOrder = [...pool.maps].sort((a, b) =>
        (a.title ?? "").localeCompare(b.title ?? ""),
      );
      await expect(page.locator(".archive-map-identity h3").first()).toHaveText(
        titleOrder[0].title ?? "Not recorded",
      );
      await page
        .getByLabel(`Sort ${pool.name}`, { exact: true })
        .selectOption("slot");
      await expect(page.locator(".archive-map-item")).toHaveCount(19);
      await expect(stageNav.locator('[aria-current="page"]')).toContainText(
        pool.name,
      );
      await expect
        .poll(() =>
          stageNav.locator('[aria-current="page"]').evaluate((el) => {
            const a = el.getBoundingClientRect(),
              b = el.parentElement!.getBoundingClientRect();
            return a.left >= b.left - 1 && a.right <= b.right + 1;
          }),
        )
        .toBe(true);
      await page.getByRole("tab", { name: "TB", exact: true }).click();
      const tb = pool.maps.find((m) => m.slot === "TB1")!;
      await expect(page.locator(".archive-map-item")).toHaveCount(1);
      await expect(
        page.locator(
          '.archive-map-item .beatmap-actions a[href^="https://osu.ppy.sh/"]',
        ),
      ).toHaveAttribute("href", `https://osu.ppy.sh/beatmaps/${tb.beatmapId}`);
      await page.getByRole("tab", { name: "TB", exact: true }).press("Home");
      await expect(
        page.getByRole("tab", { name: "All mods", exact: true }),
      ).toBeFocused();
      await expect(page.locator(".archive-map-item")).toHaveCount(19);
      await page
        .getByRole("tab", { name: "All mods", exact: true })
        .press("ArrowRight");
      await expect(
        page.getByRole("tab", { name: "NM", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      const first = pool.maps[0];
      await page
        .getByRole("searchbox", { name: "Search maps", exact: true })
        .fill(String(first.beatmapId));
      await expect(page.locator(".archive-map-item")).toHaveCount(1);
      await expect(page.locator(".archive-map-identity h3")).toHaveText(
        first.title ?? "Not recorded",
      );
      await expect(
        page.locator(".archive-map-stats dd").first(),
      ).toHaveAttribute("title", String(first.stars));
      await page
        .getByRole("searchbox", { name: "Search maps", exact: true })
        .fill("nonexistent synthetic song");
      await expect(
        page.getByText("No maps match these filters.", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("searchbox", { name: "Search maps", exact: true })
        .fill("");
      await page.getByRole("tab", { name: "All mods", exact: true }).click();
      await expect(page.locator(".historical-archive")).not.toContainText(
        pool.source,
      );
    }
    await page.goBack();
    await expect(stageNav.locator('[aria-current="page"]')).toContainText(
      "FINALS",
    );
    await page.goForward();
    await expect(stageNav.locator('[aria-current="page"]')).toContainText(
      "GRAND FINALS",
    );
    for (const [locale, searchLabel] of [
      ["zh-Hans", "搜索谱面"],
      ["zh-Hant", "搜尋譜面"],
    ]) {
      await context.addCookies([
        { name: "oclr-locale", value: locale, domain: "127.0.0.1", path: "/" },
      ]);
      await page.reload();
      await expect(
        page.getByRole("searchbox", { name: searchLabel, exact: true }),
      ).toBeVisible();
      await expect(page.locator(".archive-map-item")).toHaveCount(19);
      await expect(page.locator(".archive-map-identity h3").first()).toHaveText(
        archive.pools[3].maps[0].title ?? "Not recorded",
      );
    }
  });
});
