import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { createSession } from "../../src/lib/auth/sessions";
import { captainDraft } from "../../src/lib/draft-reads";
import type { CaptainBoard } from "../../src/lib/draft-types";
import { prepareDraft } from "../fixtures/draft";
import { assertTestDatabase } from "../database";

test.describe("compact Captain live state", () => {
  test.skip(!process.env.TEST_DATABASE_URL);
  test.beforeAll(() => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ADMIN_OSU_IDS = "110001";
  });
  test.afterAll(closeDb);
  test("authorized rosters and history stay visible across state, size, language and reconnect", async ({
    page,
    context,
    isMobile,
  }) => {
    test.setTimeout(120000);
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    const slug = "captain-compact-test";
    const fixture = await prepareDraft(slug, 110001, 6);
    const session = await createSession(fixture.a.osuId);
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
    await page.route("https://a.ppy.sh/**", (r) => r.abort());
    const initial = (await captainDraft(fixture.a, slug))!;
    let board: CaptainBoard = structuredClone(initial);
    let fail = false;
    await page.route(`**/api/tournaments/${slug}/draft/captain`, (r) =>
      fail ? r.abort() : r.fulfill({ json: board }),
    );
    await page.goto(`/tournaments/${slug}/draft/captain`);
    await expect(
      page.getByRole("heading", { name: "Team rosters", exact: true }),
    ).toBeVisible();
    const history = page.getByRole("region", {
      name: "Published pick history",
      exact: true,
    });
    await expect(history).toContainText("No picks published yet.");
    await expect(
      page.locator(
        ".captain-draft-room details, .captain-draft-room summary, .draft-turn-mark",
      ),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: `Choose ${fixture.players[0].username}`,
        exact: true,
      }),
    ).toBeEnabled();
    const own = initial.rosters.find(
      (r) => r.team.captain.osuId === fixture.a.osuId,
    )!;
    await expect(
      page.getByRole("heading", { name: own.team.name, exact: true }),
    ).toHaveCount(1);
    // Only this authorized endpoint supplies the supplemental overview; its
    // private eligible pool must never be rendered there.
    await expect(page.locator(".captain-draft-overview")).not.toContainText(
      fixture.players[0].username,
    );
    board = { ...board, version: board.version + 1, state: "paused" };
    await expect(page.locator(".captain-draft-turn")).toContainText("Paused");
    await expect(
      page.getByRole("button", {
        name: `Choose ${fixture.players[0].username}`,
        exact: true,
      }),
    ).toBeDisabled();
    board = {
      ...board,
      version: board.version + 1,
      state: "live",
      activeTeam: initial.rosters.find((r) => r.team.id !== own.team.id)!.team,
    };
    await expect(
      page.getByText("Waiting for your turn.", { exact: true }),
    ).toBeVisible();
    board = {
      ...initial,
      version: board.version + 1,
      picks: [
        {
          id: "visible-pick",
          turnIndex: 0,
          team: own.team,
          player: fixture.players[0],
        },
      ],
    };
    await expect(history.locator("li")).toHaveCount(1);
    await expect(history).toContainText(fixture.players[0].username);
    fail = true;
    await expect(page.locator(".connection-state")).toContainText(
      "Reconnecting",
      { timeout: 10000 },
    );
    await expect(history.locator("li")).toHaveCount(1);
    await expect(
      page.getByRole("button", {
        name: `Choose ${fixture.players[0].username}`,
        exact: true,
      }),
    ).toBeDisabled();
    fail = false;
    await expect(page.locator(".connection-state")).toContainText("Connected", {
      timeout: 10000,
    });
    await page.reload();
    await expect(history.locator("li")).toHaveCount(1);

    for (const count of [2, 8, 16]) {
      const other = initial.rosters.find((r) => r.team.id !== own.team.id)!;
      board = {
        ...board,
        version: board.version + 1,
        state: "completed",
        turnCount: count === 2 ? 1 : 48,
        turnIndex: count === 2 ? 1 : 48,
        activeTeam: null,
        rosters: [
          own,
          ...Array.from({ length: count - 1 }, (_, i) => ({
            team: {
              ...other.team,
              id: `synthetic-team-${i}`,
              name: `Team ${i + 2} · long synthetic tournament name`,
              captain: { osuId: 800000 + i, username: `Captain ${i + 2}` },
            },
            players: Array.from({ length: 4 }, (_, n) => ({
              osuId: 900000 + i * 10 + n,
              username: `Published player ${i}-${n}`,
            })),
          })),
        ],
        picks: Array.from({ length: count === 2 ? 1 : 48 }, (_, i) => ({
          id: `pick-${i}`,
          turnIndex: i,
          team: other.team,
          player: { osuId: 950000 + i, username: `Published pick ${i + 1}` },
        })),
      };
      // Each browser project covers all three locales and both site themes.
      for (const [locale, theme] of [
        ["en", "light"],
        ["zh-Hans", "dark"],
        ["zh-Hant", "light"],
      ]) {
        await context.addCookies([
          {
            name: "oclr-locale",
            value: locale,
            domain: "127.0.0.1",
            path: "/",
          },
          { name: "oclr-theme", value: theme, domain: "127.0.0.1", path: "/" },
        ]);
        await page.setViewportSize({
          width: isMobile ? (count === 16 ? 320 : 390) : 1440,
          height: 900,
        });
        await page.reload();
        await expect(page.locator(".captain-roster")).toHaveCount(count - 1);
        await expect(page.locator(".captain-picks li")).toHaveCount(
          board.picks.length,
        );
        await expect(page.locator(".captain-picks li").first()).toContainText(
          `Published pick ${board.picks.length}`,
        );
        await expect(page.locator(".captain-draft-turn .badge")).not.toHaveText(
          "completed",
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await expect(page.locator(".captain-history")).toBeVisible();
        if (board.picks.length > 1) {
          const list = page.locator(".captain-picks");
          expect(
            await list.evaluate((el) => el.scrollHeight > el.clientHeight),
          ).toBe(true);
          await list.focus();
          await list.press("End");
          await expect
            .poll(() => list.evaluate((el) => el.scrollTop))
            .toBeGreaterThan(0);
          await list.press("Home");
          await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(0);
        }
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
          window.scrollTo({ top: 0, behavior: "instant" });
        });
      }
    }
    // Snapshot revocation must clear both picking and all read-only identities.
    await page.unroute(`**/api/tournaments/${slug}/draft/captain`);
    await page.route(`**/api/tournaments/${slug}/draft/captain`, (r) =>
      r.fulfill({ status: 403, json: { error: "forbidden" } }),
    );
    await expect(page.locator(".captain-draft-overview")).toHaveCount(0, {
      timeout: 10000,
    });
    await expect(page.locator(".draft-pick-workspace")).toHaveCount(0);
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
  });
});
