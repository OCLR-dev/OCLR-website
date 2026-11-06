import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  editionState,
  mappoolCandidates,
  mappoolEvents,
  staffRoles,
} from "../../src/db/schema";
import { selectionCommand } from "../../src/lib/mappool-workbench";
import {
  canonicalSkillsets,
  skillsetGroups,
  skillsetTags,
  skillsetLabels,
} from "../../src/lib/mappool-skillsets";
vi.mock("../../src/db", () => ({ db: () => database }));
vi.mock("../../src/lib/content", () => ({
  getEdition: async () => ({ slug }),
}));
const slug = "synthetic-skillsets-test";
const id = "00000000-0000-4000-8000-000000000001";
const actor = { osuId: 735001, username: "Synthetic Tester" };
const state = {
  grants: [{ role: "tester", editionSlug: slug as string | null }],
  candidate: {
    id,
    editionSlug: slug,
    skillsetTags: [] as string[],
    skillsetVersion: 1,
  },
  events: [] as Record<string, unknown>[],
  archived: false,
  missing: false,
  revoke: false,
  grantReads: 0,
};
function rows(table: unknown) {
  if (table === staffRoles)
    return state.revoke && ++state.grantReads > 1 ? [] : state.grants;
  if (table === editionState)
    return [
      {
        configured: true,
        archive: state.archived,
        configuration: { archive: state.archived ? {} : undefined },
      },
    ];
  if (table === mappoolCandidates)
    return state.missing ? [] : [{ ...state.candidate }];
  throw Error("Unexpected skillset read");
}
function select() {
  let table: unknown;
  const q = {
    from(value: unknown) {
      table = value;
      return q;
    },
    where() {
      return q;
    },
    for: async () => rows(table),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(rows(table)).then(resolve, reject),
  };
  return q;
}
// Actual service/auth flow, synthetic DB adapter; SQL locks are integration-only.
const database = {
  select,
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(database),
  update: (table: unknown) => ({
    set: (value: Record<string, unknown>) => ({
      where: async () => {
        if (table !== mappoolCandidates)
          throw Error("Unexpected skillset update");
        Object.assign(state.candidate, value);
      },
    }),
  }),
  insert: (table: unknown) => ({
    values: async (value: Record<string, unknown>) => {
      if (table !== mappoolEvents) throw Error("Unexpected skillset event");
      state.events.push(value);
    },
  }),
};
const command = (tags: string[] = ["tech", "jump"], expectedVersion = 1) => ({
  action: "skillsets",
  candidateId: id,
  tags,
  expectedVersion,
});
beforeEach(() => {
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://synthetic:synthetic@127.0.0.1:1/oclr_test_skillsets",
  );
  vi.stubEnv("OCLR_DATA_SOURCE", "database");
  vi.stubEnv("ADMIN_OSU_IDS", "");
  state.grants = [{ role: "tester", editionSlug: slug }];
  state.candidate = {
    id,
    editionSlug: slug,
    skillsetTags: [],
    skillsetVersion: 1,
  };
  state.events = [];
  state.archived = false;
  state.missing = false;
  state.revoke = false;
  state.grantReads = 0;
});
afterEach(() => vi.unstubAllEnvs());
describe("candidate skillsets", () => {
  it("defines 29 unique choices in six groups with stable display order", () => {
    expect(skillsetGroups).toHaveLength(6);
    expect(skillsetTags).toHaveLength(29);
    expect(new Set(skillsetTags).size).toBe(29);
    expect(Object.keys(skillsetLabels).sort()).toEqual(
      [...skillsetTags].sort(),
    );
    expect(canonicalSkillsets(["tech", "jump", "jump"])).toEqual([
      "jump",
      "tech",
    ]);
  });
  for (const role of ["tester", "replayer", "mappooler"])
    it(`${role} can save and clear with versioned audit`, async () => {
      state.grants[0].role = role;
      await selectionCommand(actor, slug, command());
      expect(state.candidate).toMatchObject({
        skillsetTags: ["jump", "tech"],
        skillsetVersion: 2,
      });
      expect(state.events[0]).toMatchObject({
        editionSlug: slug,
        actorId: actor.osuId,
        action: "candidate_skillsets",
        before: { tags: [], version: 1 },
        after: { tags: ["jump", "tech"], version: 2 },
      });
      await selectionCommand(actor, slug, command([], 2));
      expect(state.candidate.skillsetTags).toEqual([]);
      expect(state.candidate.skillsetVersion).toBe(3);
    });
  it("does not write or increment versions for an unchanged set", async () => {
    state.candidate.skillsetTags = ["jump", "tech"];
    await selectionCommand(actor, slug, command());
    expect(state.events).toEqual([]);
    expect(state.candidate.skillsetVersion).toBe(1);
  });
  it("rejects stale writes without replacing newer tags", async () => {
    await selectionCommand(actor, slug, command());
    await expect(
      selectionCommand(actor, slug, command(["stream"])),
    ).rejects.toMatchObject({ status: 409 });
    expect(state.candidate.skillsetTags).toEqual(["jump", "tech"]);
    expect(state.events).toHaveLength(1);
  });
  it("validates allowed choices, duplicates, limits, versions and command shape", async () => {
    for (const input of [
      command(["unknown"]),
      command(["jump", "jump"]),
      command(Array(30).fill("jump")),
      command([], 0),
      command([], 1.5),
      { ...command(), candidateId: "invalid" },
      { ...command(), extra: true },
    ])
      await expect(selectionCommand(actor, slug, input)).rejects.toMatchObject({
        status: 400,
      });
    expect(state.events).toHaveLength(0);
    await selectionCommand(actor, slug, command([...skillsetTags]));
    expect(state.candidate.skillsetTags).toHaveLength(29);
  });
  it("denies read-only and unrelated-edition grants", async () => {
    state.grants = [{ role: "developer", editionSlug: null }];
    await expect(
      selectionCommand(actor, slug, command()),
    ).rejects.toMatchObject({ status: 403 });
    state.grants = [{ role: "tester", editionSlug: "other" }];
    await expect(
      selectionCommand(actor, slug, command()),
    ).rejects.toMatchObject({ status: 403 });
    expect(state.events).toEqual([]);
  });
  it("rechecks revoked grants under the edition lock", async () => {
    state.revoke = true;
    await expect(
      selectionCommand(actor, slug, command()),
    ).rejects.toMatchObject({ status: 403 });
    expect(state.events).toEqual([]);
  });
  it("protects archives and missing candidates", async () => {
    state.archived = true;
    await expect(
      selectionCommand(actor, slug, command()),
    ).rejects.toMatchObject({ status: 409 });
    state.archived = false;
    state.missing = true;
    await expect(
      selectionCommand(actor, slug, command()),
    ).rejects.toMatchObject({ status: 404 });
    expect(state.events).toEqual([]);
  });
});
