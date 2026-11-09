import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, db } from "../../src/db";
import { editionState } from "../../src/db/schema";
import { archiveBracket } from "../../src/lib/archive-bracket";
import { readArchiveProgression } from "../../src/lib/archive-progression";
import { syncArchiveRelations } from "../../src/lib/archive-relation-writes";
import { bracketRouting } from "../../src/lib/bracket-routing";
import { publicBracket } from "../../src/lib/brackets";
import { readApiRoute } from "../../src/lib/read-api";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";

const url = process.env.TEST_DATABASE_URL;
const href = (id: string) => `/tournaments/s10/matches/${id}`;
const origin = "https://oclr.example.test";

describe.skipIf(!url)("saved historical advancement", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("APP_URL", origin);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("loads reviewed matches and edges for all ten seasons", async () => {
    const plans = [];
    for (let season = 1; season <= 10; season++) {
      const plan = await readArchiveProgression(`s${season}`);
      expect(plan).not.toBeNull();
      plans.push([plan!.matches.length, plan!.advancements.length]);
    }
    expect(plans).toEqual([
      [10, 12],
      [10, 12],
      [10, 12],
      [10, 12],
      [10, 12],
      [10, 12],
      [10, 12],
      [14, 16],
      [10, 12],
      [10, 12],
    ]);

    const first = await readArchiveProgression("s1");
    expect(first?.matches.find((m) => m.fixtureId === "es-lf")).toMatchObject({
      teamA: "b",
      teamB: "h",
      winnerSlot: 1,
    });
    expect(first?.advancements).toContainEqual({
      editionSlug: "s1",
      sourceFixtureId: "es-lf",
      outcome: "winner",
      targetFixtureId: "es-gf",
      targetSlot: 1,
    });
  });

  it("shows only the verified paths of a published archive", async () => {
    const archive = historicalArchiveSchema.parse(
      JSON.parse(readFileSync("docs/imports/s10-archive.json", "utf8")),
    );
    const historical = {
      ...edition,
      slug: "s10",
      status: "completed",
      registration: null,
      archive,
    };
    await seedEditions([{ ...historical, published: false }]);
    await db().transaction((tx) => syncArchiveRelations(tx, "s10"));
    expect(await publicBracket("s10")).toBeNull();

    await seedEditions([historical]);
    await db().transaction((tx) => syncArchiveRelations(tx, "s10"));
    const [before] = await db()
      .select()
      .from(editionState)
      .where(eq(editionState.slug, "s10"));
    const bracket = await publicBracket("s10");
    const response = await readApiRoute(
      new Request(`${origin}/api/v1/tournaments/s10/bracket`),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(
      JSON.parse(JSON.stringify(bracket)),
    );
    expect(bracket?.groups).toHaveLength(1);
    const path = bracket!.groups[0];
    expect(path.showAdvancement).toBe(true);
    expect(path.rounds.flatMap((round) => round.matches)).toHaveLength(10);
    expect(bracketRouting(path).edges).toHaveLength(12);
    expect(bracketRouting(path).edges).toContainEqual(
      expect.objectContaining({
        sourceId: "match-27",
        targetId: "match-29",
        kind: "loser",
      }),
    );
    expect(
      await db()
        .select()
        .from(editionState)
        .where(eq(editionState.slug, "s10")),
    ).toEqual([before]);

    const changed = {
      ...archive,
      matches: archive.matches.map((m) =>
        m.id === "match-30"
          ? { ...m, score: [m.score![1], m.score![0]] as [number, number] }
          : m,
      ),
    };
    const plan = await readArchiveProgression("s10");
    const fallback = archiveBracket(changed, href, plan)!.groups[0];
    expect(bracketRouting(fallback).edges).toEqual([]);
    expect(fallback.rounds.flatMap((round) => round.matches)).toHaveLength(10);
    await seedEditions([{ ...historical, archive: changed }]);
    await db().transaction((tx) => syncArchiveRelations(tx, "s10"));
    expect(await publicBracket("s10")).toBeNull();
  });
});
