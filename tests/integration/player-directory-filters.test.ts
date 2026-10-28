import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { captains } from "../../src/db/schema";
import { publicPlayerDirectoryModel } from "../../src/lib/public-read-models";
import {
  directoryOptions,
  directoryState,
  publicDirectoryPlayer,
  selectDirectoryPlayers,
} from "../../src/lib/player-directory";
import { seedDirectoryFilters } from "../fixtures/player-directory-filters";
import { assertTestDatabase } from "../database";
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
import { osuApi } from "../../src/lib/osu-api";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "directory filtering over publication-checked saved data",
  () => {
    let fixture: Awaited<ReturnType<typeof seedDirectoryFilters>>;
    beforeAll(async () => {
      assertTestDatabase(process.env.TEST_DATABASE_URL);
      vi.stubEnv("DATABASE_URL", process.env.TEST_DATABASE_URL);
      fixture = await seedDirectoryFilters(false);
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    it("counts only public UIDs, keeps authorized aliases/overlapping roles, and never calls the provider", async () => {
      const saved = await publicPlayerDirectoryModel(fixture.slug);
      const players = saved.rows.map((p) => publicDirectoryPlayer(p));
      expect(players).toHaveLength(30);
      expect(new Set(players.map((p) => p.id)).size).toBe(30);
      expect(players.find((p) => p.id === fixture.base + 1)).toMatchObject({
        aliases: expect.arrayContaining(["Known Public Alias"]),
        roles: ["player", "coach"],
        rank: 2,
        pp: 2000,
      });
      expect(JSON.stringify(players)).not.toMatch(/PRIVATE_/);
      expect(directoryOptions(players).teams).toHaveLength(1);
      expect(directoryOptions(players).freeAgent).toBe(false);
      const result = selectDirectoryPlayers(
        players,
        directoryState(
          new URLSearchParams({
            q: "Known Public Alias",
            team: fixture.teamId,
            role: "coach",
            sort: "pp-desc",
          }),
        ),
      );
      expect(result.map((p) => p.id)).toEqual([fixture.base + 1]);
      expect(
        selectDirectoryPlayers(
          players,
          directoryState(new URLSearchParams("ppMin=0&ppMax=0")),
        ).map((p) => p.id),
      ).toEqual([fixture.base + 3]);
      expect(osuApi).not.toHaveBeenCalled();
    });
    it("keeps historical statistics unavailable and removes team options when publication is withdrawn", async () => {
      const history = (
        await publicPlayerDirectoryModel(fixture.history)
      ).rows.map((p) => publicDirectoryPlayer(p));
      expect(directoryOptions(history)).toMatchObject({
        rank: false,
        pp: false,
        freeAgent: true,
      });
      expect(
        selectDirectoryPlayers(
          history,
          directoryState(new URLSearchParams("team=free_agent")),
        ).map((p) => p.id),
      ).toEqual([91006]);
      await db()
        .update(captains)
        .set({ published: false })
        .where(eq(captains.userId, fixture.base));
      const players = (await publicPlayerDirectoryModel(fixture.slug)).rows.map(
        (p) => publicDirectoryPlayer(p),
      );
      expect(players).toHaveLength(30);
      expect(directoryOptions(players).teams).toEqual([]);
      expect(directoryOptions(players).roles).not.toContain("captain");
      expect(directoryOptions(players).roles).not.toContain("coach");
      expect(osuApi).not.toHaveBeenCalled();
    });
  },
);
