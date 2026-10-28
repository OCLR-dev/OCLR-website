import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db, closeDb } from "../../src/db";
import { registrations } from "../../src/db/schema";
import { publicPlayer } from "../../src/lib/players";
import { playerParticipationHistory } from "../../src/lib/player-history";
import { readApiRoute } from "../../src/lib/read-api";
import { seedPlayerHistory, historyUid } from "../fixtures/player-history";
vi.mock("../../src/lib/osu-api", () => ({ osuApi: vi.fn() }));
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)(
  "UID participation history and saved remote contract",
  () => {
    beforeAll(() => {
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("APP_URL", "https://oclr.example.test");
    });
    beforeEach(seedPlayerHistory);
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });
    it("shows every published historical season without any native registration and keeps earlier teams", async () => {
      expect(await db().select().from(registrations)).toEqual([]);
      const history = await playerParticipationHistory(historyUid);
      expect(history.map((r) => r.editionSlug)).toEqual([
        "history-ten",
        "history-five",
        "history-three",
      ]);
      expect(history[0].experiences.map((p) => p.team?.id)).toEqual([
        "alpha",
        "beta",
      ]);
      expect(JSON.stringify(history)).not.toContain("PRIVATE_");
      expect(await playerParticipationHistory(historyUid + 1)).toEqual([]);
    });
    it("deduplicates imported/native registrations against authoritative historical facts", async () => {
      await db()
        .insert(registrations)
        .values({
          userId: historyUid,
          editionSlug: "history-ten",
          status: "accepted",
          rulesVersion: "test-v1",
          answers: { private: "PRIVATE_ANSWER" },
        });
      const rows = await publicPlayer(historyUid, "history-ten");
      expect(rows).toHaveLength(2);
      expect(rows.every((p) => p.participation === "historical")).toBe(true);
      const history = await playerParticipationHistory(historyUid);
      expect(history[0].experiences).toHaveLength(2);
      expect(JSON.stringify(history)).not.toContain("PRIVATE_ANSWER");
    });
    it("projects all historical facts through the existing remote participation resource with no extra fields", async () => {
      const response = await readApiRoute(
        new Request(
          `https://oclr.example.test/api/v1/players/${historyUid}/participations`,
        ),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toEqual(
        JSON.parse(JSON.stringify(await publicPlayer(historyUid))),
      );
      expect(body.data).toHaveLength(6);
      expect(JSON.stringify(body)).not.toContain("PRIVATE_HISTORY_NAME");
      const profile = await readApiRoute(
        new Request(
          `https://oclr.example.test/api/v1/players/${historyUid}/oclr-profile`,
        ),
      );
      expect(profile.status).toBe(200);
      expect((await profile.json()).data.participation).toHaveLength(6);
    });
  },
);
