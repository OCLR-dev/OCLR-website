import { describe, expect, it, vi } from "vitest";
import {
  copyRefereeCommand,
  defaultRefereeRoomName,
  emptyRefereeSettings,
  refereeCommandPolicySchema,
  refereeCommands,
  refereeSettingsSchema,
  type RefereeCommandInput,
} from "../../src/lib/referee-commands";

import { standardRefereeCategoryMods } from "../../src/lib/referee-defaults";

describe("default referee room name", () => {
  const teams = [{ name: "knd" }, { name: "bhou" }];
  it.each(["11", "s11", "S11"])("formats season %s", (season) => {
    const roomName = defaultRefereeRoomName(season, teams);
    expect(roomName).toBe("OCLR S11: (knd) vs (bhou)");
    expect(
      refereeCommands({
        ...input,
        settings: { ...input.settings, roomName },
      }).find((command) => command.kind === "make")?.text,
    ).toBe("!mp make OCLR S11: (knd) vs (bhou)");
  });
  it("uses the configured season and requires both teams", () => {
    expect(defaultRefereeRoomName("12", teams)).toBe(
      "OCLR S12: (knd) vs (bhou)",
    );
    expect(defaultRefereeRoomName(null, teams)).toBe("OCLR: (knd) vs (bhou)");
    expect(defaultRefereeRoomName("11", teams.slice(0, 1))).toBe("");
  });
});

const input: RefereeCommandInput = {
  settings: {
    ...emptyRefereeSettings,
    roomName: "TEST: A vs B",
    streamerUsername: "Caster Name",
    timerSeconds: 90,
    startSeconds: 7,
  },
  policy: {
    roomSize: 16,
    noFail: true,
    banSeconds: 60,
    pickSeconds: 90,
    prepareSeconds: 120,
    startSeconds: 7,
    categoryMods: {
      NM: { mods: [], freemod: false },
      HD: { mods: ["HD"], freemod: false },
      HR: { mods: ["HR"], freemod: false },
      DT: { mods: ["DT"], freemod: false },
      FM: { mods: [], freemod: true },
      TB: { mods: ["HD"], freemod: true },
    },
  },
  rules: {
    version: "test",
    mode: "osu",
    teamType: "team-vs",
    scoringType: "scorev2",
    aggregation: "sum",
    playersPerTeam: 2,
    series: { type: "first_to", wins: 2 },
    allowSubstitutions: false,
    allowShortHanded: false,
    failedScorePolicy: "include",
    tiedMapPolicy: "require_replay",
  },
  teams: [
    { id: "a", name: "A", captainId: 123, captainUsername: "Captain A" },
    { id: "b", name: "B", captainId: 456, captainUsername: "Captain B" },
  ],
  selectedMap: { beatmapId: 789, category: "HD" },
};
const command = (value: RefereeCommandInput, kind: string) =>
  refereeCommands(value).find((c) => c.id === kind)?.text;
describe("referee command generation", () => {
  it("invites all twelve roster players by saved username, not only captains or starters", () => {
    const teams = input.teams.map((team, index) => ({
      ...team,
      members: Array.from({ length: 6 }, (_, n) => ({
        osuId: 9000 + index * 10 + n,
        username: `Player ${index}-${n}`,
      })),
    }));
    const invites = refereeCommands({ ...input, teams }).filter(
      (c) => c.kind === "invite",
    );
    expect(invites).toHaveLength(12);
    expect(invites.map((c) => c.text)).toEqual(
      teams.flatMap((t) =>
        t.members.map((m) => `!mp invite ${m.username.replace(/\s+/g, "_")}`),
      ),
    );
    expect(invites.at(-1)?.playerName).toBe("Player 1-5");
    expect(
      refereeCommands({
        ...input,
        teams: teams.map((t) => ({ ...t, members: [] })),
      }).filter((c) => c.kind === "invite"),
    ).toHaveLength(0);
  });
  it.each(["", " ", "Player\n!mp abort", "Player\tName"])(
    "rejects unsafe invitation names %j",
    (username) => {
      expect(
        command(
          {
            ...input,
            teams: [{ ...input.teams[0], captainUsername: username }],
          },
          "invite:a",
        ),
      ).toBeNull();
    },
  );
  it("blocks ruleset-specific Mods in incompatible rooms", () => {
    for (const mods of [["FI"], ["MR"], ["4K"]] as const) {
      const policy = {
        ...input.policy!,
        categoryMods: { HD: { mods: [...mods], freemod: false } },
      };
      expect(command({ ...input, policy }, "mods")).toBeNull();
      expect(
        command(
          { ...input, policy, rules: { ...input.rules!, mode: "mania" } },
          "mods",
        ),
      ).toBe(`!mp mods NF ${mods[0]}`);
    }
    const policy = {
      ...input.policy!,
      categoryMods: { HD: { mods: ["SO"] as const, freemod: false } },
    };
    expect(
      command(
        {
          ...input,
          policy: {
            ...policy,
            categoryMods: { HD: { ...policy.categoryMods.HD, mods: ["SO"] } },
          },
          rules: { ...input.rules!, mode: "taiko" },
        },
        "mods",
      ),
    ).toBeNull();
    expect(command({ ...input, rules: null }, "mods")).toBeNull();
  });
  it("treats inherited object property names as unconfigured categories", () => {
    expect(
      command(
        { ...input, selectedMap: { beatmapId: 789, category: "toString" } },
        "mods",
      ),
    ).toBeNull();
  });
  it("generates all nine command kinds from explicit saved identities and policy", () => {
    expect(refereeCommands(input).map((c) => c.text)).toEqual([
      "!mp make TEST: A vs B",
      "!mp set 2 3 16",
      "!mp addref Caster_Name",
      "!mp invite Captain_A",
      "!mp invite Captain_B",
      "!mp timer 90",
      "!mp map 789 0",
      "!mp mods NF HD",
      "!mp start 7",
      "!mp abort",
    ]);
    expect(new Set(refereeCommands(input).map((c) => c.kind)).size).toBe(9);
  });
  it.each([
    ["NM", "NF"],
    ["HD", "NF HD"],
    ["HR", "NF HR"],
    ["DT", "NF DT"],
    ["FM", "NF Freemod"],
    ["TB", "NF HD Freemod"],
  ])("combines explicit %s policy with NF", (category, expected) => {
    expect(
      command({ ...input, selectedMap: { beatmapId: 789, category } }, "mods"),
    ).toBe(`!mp mods ${expected}`);
  });
  it.each([
    ["NM", "NF"],
    ["HD", "NF HD"],
    ["HR", "NF HR"],
    ["DT", "NF DT"],
    ["FM", "NF Freemod"],
    ["TB", "NF Freemod"],
  ])("generates the standard %s command with NF", (category, expected) => {
    expect(
      command(
        {
          ...input,
          policy: {
            ...input.policy!,
            noFail: true,
            categoryMods: standardRefereeCategoryMods(),
          },
          selectedMap: { beatmapId: 789, category },
        },
        "mods",
      ),
    ).toBe(`!mp mods ${expected}`);
  });
  it("clears previous mods with None when NM explicitly disables NF", () => {
    expect(
      command(
        {
          ...input,
          policy: { ...input.policy!, noFail: false },
          selectedMap: { beatmapId: 789, category: "NM" },
        },
        "mods",
      ),
    ).toBe("!mp mods None");
  });
  it.each([
    ["osu", 0],
    ["taiko", 1],
    ["fruits", 2],
    ["mania", 3],
  ] as const)("uses the saved %s ruleset", (mode, number) => {
    expect(command({ ...input, rules: { ...input.rules!, mode } }, "map")).toBe(
      `!mp map 789 ${number}`,
    );
  });
  it("does not infer a UID from a captain name or substitute players per team for slots", () => {
    const missing = {
      ...input,
      policy: null,
      settings: { ...input.settings, roomSize: null },
      teams: [{ ...input.teams[0], captainId: null, captainUsername: "123" }],
    };
    expect(command(missing, "invite:a")).toBeNull();
    expect(command(missing, "set")).toBeNull();
    expect(command(missing, "mods")).toBeNull();
  });
  it("rejects missing map, missing rules, unknown category and invalid IDs", () => {
    expect(command({ ...input, selectedMap: null }, "map")).toBeNull();
    expect(command({ ...input, rules: null }, "map")).toBeNull();
    expect(
      command(
        { ...input, selectedMap: { beatmapId: 0, category: "HD" } },
        "map",
      ),
    ).toBeNull();
    expect(
      command(
        { ...input, selectedMap: { beatmapId: 789, category: "EX" } },
        "mods",
      ),
    ).toBeNull();
    expect(
      command(
        {
          ...input,
          teams: [
            { ...input.teams[0], captainId: Number.MAX_SAFE_INTEGER + 1 },
          ],
        },
        "invite:a",
      ),
    ).toBeNull();
  });
  it.each([
    "ok\n!mp abort",
    "ok\r!mp abort",
    "ok\tname",
    "ok\u0000name",
    "ok\u2028!mp abort",
    "ok\u202ename",
  ])("rejects control characters before trimming %j", (roomName) => {
    expect(
      refereeSettingsSchema.safeParse({ ...input.settings, roomName }).success,
    ).toBe(false);
    expect(
      command({ ...input, settings: { ...input.settings, roomName } }, "make"),
    ).toBeNull();
    expect(
      command(
        {
          ...input,
          settings: { ...input.settings, streamerUsername: roomName },
        },
        "addref",
      ),
    ).toBeNull();
  });
  it("preserves visible Unicode room names and converts username spaces only in commands", () => {
    expect(
      command(
        {
          ...input,
          settings: {
            ...input.settings,
            roomName: "测试：星河 vs 暮光",
            streamerUsername: "A  B",
          },
        },
        "make",
      ),
    ).toBe("!mp make 测试：星河 vs 暮光");
    expect(
      command(
        { ...input, settings: { ...input.settings, streamerUsername: "A  B" } },
        "addref",
      ),
    ).toBe("!mp addref A_B");
    expect(input.settings.streamerUsername).toBe("Caster Name");
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid seconds %s",
    (timerSeconds) => {
      expect(
        refereeSettingsSchema.safeParse({ ...input.settings, timerSeconds })
          .success,
      ).toBe(false);
      expect(
        command(
          { ...input, settings: { ...input.settings, timerSeconds } },
          "timer",
        ),
      ).toBeNull();
    },
  );
  it("does not tie start countdown to timer changes", () => {
    expect(
      command(
        { ...input, settings: { ...input.settings, timerSeconds: 120 } },
        "start",
      ),
    ).toBe("!mp start 7");
  });
  it("validates room bounds and contradictory mod policies", () => {
    for (const roomSize of [0, 17, 1.5])
      expect(
        refereeSettingsSchema.safeParse({ ...input.settings, roomSize })
          .success,
      ).toBe(false);
    for (const mods of [
      ["DT", "HT"],
      ["EZ", "HR"],
      ["DT", "NC"],
      ["HD", "HD"],
      ["4K", "7K"],
      ["SD"],
    ])
      expect(
        refereeCommandPolicySchema.safeParse({
          ...input.policy,
          categoryMods: { HD: { mods, freemod: false } },
        }).success,
      ).toBe(false);
  });
  it("copy helper reports success only after the actual clipboard resolves", async () => {
    let resolve!: () => void;
    const writeText = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const pending = copyRefereeCommand("!mp abort", { writeText });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolve();
    expect(await pending).toBe("copied");
    expect(writeText).toHaveBeenCalledExactlyOnceWith("!mp abort");
  });
  it("falls back to manual copy on missing, rejected or unsafe clipboard commands", async () => {
    expect(await copyRefereeCommand("!mp abort")).toBe("manual");
    expect(
      await copyRefereeCommand("!mp abort", {
        writeText: async () => {
          throw new Error("denied");
        },
      }),
    ).toBe("manual");
    const writeText = vi.fn();
    expect(
      await copyRefereeCommand("!mp start 7\n!mp abort", { writeText }),
    ).toBe("manual");
    expect(writeText).not.toHaveBeenCalled();
  });
});
