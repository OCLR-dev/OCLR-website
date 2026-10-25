import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { collectionPage } from "../../src/lib/read-api";
import { readApiSpecification } from "../../src/lib/read-api-openapi";
import { readOperations, readSchemas } from "../../src/lib/read-api-operations";
import { editionSchema } from "../../src/lib/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import {
  historicalTournamentOverview,
  historicalPlayerModel,
} from "../../src/lib/public-read-models";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { profileResponse } from "../fixtures/osu-profile";
import { projectSavedPlayerProfile } from "../../src/lib/player-profiles";
import { informationPreview } from "../../src/lib/tournament-information";

afterEach(() => vi.unstubAllEnvs());
describe("versioned read contract", () => {
  it("keeps the checked-in OpenAPI document generated from runtime schemas and issue-linked operations", () => {
    const specification = readApiSpecification();
    expect(
      JSON.parse(readFileSync("docs/read-api.openapi.json", "utf8")),
    ).toEqual(JSON.parse(JSON.stringify(specification)));
    expect(specification.openapi).toBe("3.1.0");
    expect(new Set(readOperations.map((operation) => operation.id)).size).toBe(
      readOperations.length,
    );
    for (const operation of readOperations) {
      expect(operation.issues).toContain(269);
      expect(readSchemas[operation.schema]).toBeDefined();
      expect(specification.paths[`/api/v1${operation.path}`]).toBeDefined();
    }
  });
  it("returns every item through bounded stable pages, rejects duplicate versions and detects changes", () => {
    const records = Array.from({ length: 137 }, (_, id) => ({ id }));
    const first = collectionPage(
      records,
      new URLSearchParams({ pageSize: "50" }),
    );
    const version = first.meta!.pagination!.collectionVersion;
    const second = collectionPage(
      records,
      new URLSearchParams({ page: "2", pageSize: "50", version }),
    );
    const last = collectionPage(
      records,
      new URLSearchParams({ page: "3", pageSize: "50", version }),
    );
    expect([...first.data, ...second.data, ...last.data]).toEqual(records);
    expect(last.meta!.pagination!.nextPage).toBeNull();
    expect(() =>
      collectionPage(records, new URLSearchParams({ page: "2" })),
    ).toThrow();
    expect(() =>
      collectionPage(
        [...records, { id: 200 }],
        new URLSearchParams({ page: "2", version }),
      ),
    ).toThrow();
    for (const pageSize of ["0", "101", "-1", "NaN"])
      expect(() =>
        collectionPage(records, new URLSearchParams({ pageSize })),
      ).toThrow();
  });
  it("uses historical identities, Captain/Tier 0 and authoritative counts without present-day profile data", () => {
    const historic = editionSchema.parse({
      ...edition,
      slug: historicalArchive.editionSlug,
      status: "completed",
      registration: null,
      archive: historicalArchive,
    });
    const source = {
      kind: "historical_archive" as const,
      revision: 2,
      updatedAt: null,
      capturedOn: historicalArchive.capturedOn,
    };
    const model = historicalPlayerModel(historic, historicalArchive, source);
    expect(model.map((player) => player.osuId)).toEqual(
      historicalArchive.players.map((player) => player.osuId),
    );
    expect(model[0]).toMatchObject({
      tier: 0,
      tierLabel: "Captain",
      role: "captain",
      statistics: { pp: null, state: "not_recorded" },
    });
    expect(
      historicalTournamentOverview(historic, historicalArchive).counts.players,
    ).toBe(model.length);
  });
  it("whitelists saved profiles, keeps valid PP zero and rejects wrong identities/rulesets", () => {
    const profile = normalizeOsuProfile(
      {
        ...profileResponse,
        statistics: { ...profileResponse.statistics, global_rank: null, pp: 0 },
      },
      profileResponse.id,
      "osu",
    );
    const snapshot = {
      profile: { ...profile, privateContact: "forbidden" },
      stale: true,
      notice: null,
    };
    const projected = projectSavedPlayerProfile(
      snapshot,
      profile.osuId,
      "osu",
    )!;
    expect(projected.profile.statistics.pp).toBe(0);
    expect(projected.profile).not.toHaveProperty("privateContact");
    expect(
      projectSavedPlayerProfile(snapshot, profile.osuId + 1, "osu"),
    ).toBeNull();
    expect(
      projectSavedPlayerProfile(snapshot, profile.osuId, "mania"),
    ).toBeNull();
  });
  it("only selects the explicit development preview outside production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(informationPreview("dev-s11")).toBeNull();
    vi.stubEnv("NODE_ENV", "development");
    expect(informationPreview("dev-s11")).not.toBeNull();
    expect(informationPreview("s11")).toBeNull();
  });
});
