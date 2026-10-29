import { describe, expect, it } from "vitest";
import {
  directoryErrors,
  directoryOptions,
  directoryState,
  selectDirectoryPlayers,
  type DirectoryPlayer,
} from "../../src/lib/player-directory";

const alpha = { id: "alpha", name: "Published Alpha" };
const beta = { id: "beta", name: "Published Beta" };
const players: DirectoryPlayer[] = [
  {
    id: 4,
    name: "Bravo",
    teams: [beta],
    roles: ["player"],
    rank: null,
    pp: null,
  },
  {
    id: 3,
    name: "Alpha",
    aliases: ["Former Name"],
    teams: [alpha],
    roles: ["player", "coach"],
    rank: 100,
    pp: 20,
  },
  {
    id: 2,
    name: "alpha",
    teams: [alpha],
    roles: ["captain"],
    rank: 100,
    pp: 20,
  },
  { id: 1, name: "Zulu", teams: [], roles: ["player"], rank: 1000, pp: 0 },
  {
    id: 5,
    name: "Echo",
    teams: [],
    roles: ["free_agent"],
    freeAgent: true,
    rank: 0,
    pp: null,
  },
];
const state = (query = "") => directoryState(new URLSearchParams(query));
const ids = (query: string, source = players) =>
  selectDirectoryPlayers(source, state(query)).map((p) => p.id);

describe("complete public player directory selection", () => {
  it("retains default source order and never paginates", () => {
    expect(ids("")).toEqual([4, 3, 2, 1, 5]);
    const many = Array.from({ length: 101 }, (_, i) => ({
      ...players[0],
      id: i + 1,
    }));
    expect(ids("", many)).toHaveLength(101);
  });
  it("sorts names, raw rank and PP with ascending UID ties and missing values always last", () => {
    expect(ids("sort=name-asc")).toEqual([2, 3, 4, 5, 1]);
    expect(ids("sort=name-desc")).toEqual([1, 5, 4, 2, 3]);
    expect(ids("sort=rank-asc")).toEqual([2, 3, 1, 4, 5]);
    expect(ids("sort=rank-desc")).toEqual([1, 2, 3, 4, 5]);
    expect(ids("sort=pp-asc")).toEqual([1, 2, 3, 4, 5]);
    expect(ids("sort=pp-desc")).toEqual([2, 3, 1, 4, 5]);
  });
  it("combines aliases, public team names, identities and data filters", () => {
    expect(ids("q=FORMER&team=alpha&role=coach")).toEqual([3]);
    expect(ids("q=Published+Alpha")).toEqual([3, 2]);
    expect(ids("q=3")).toEqual([3]);
    expect(ids("team=free_agent")).toEqual([5]);
    expect(ids("team=private-team")).toEqual([]);
  });
  it("ignores removed presence filters in legacy URLs", () => {
    expect(ids("ranked=1&hasPp=1")).toEqual(ids(""));
    expect(directoryErrors(state("ranked=yes&hasPp=invalid"))).toEqual([]);
  });
  it("uses inclusive ranges, includes PP zero, excludes unavailable values", () => {
    expect(ids("rankMin=100&rankMax=100&ppMin=20&ppMax=20")).toEqual([3, 2]);
    expect(ids("ppMin=0&ppMax=0")).toEqual([1]);
    expect(ids("ppMax=20")).toEqual([3, 2, 1]);
    expect(ids("rankMax=1000")).toEqual([3, 2, 1]);
  });
  it.each([
    "rankMin=2&rankMax=1",
    "rankMin=0",
    "rankMax=1.2",
    "ppMin=-1",
    "ppMax=NaN",
    "ppMax=Infinity",
    "ppMin=0x10",
    "ppMin=1e3",
    "sort=bad",
    "group=bad",
  ])("rejects invalid URL input: %s", (query) => {
    expect(directoryErrors(state(query)).length).toBeGreaterThan(0);
    expect(ids(query)).toEqual([]);
  });
  it("merges public historical facts by UID without losing roles, teams or names", () => {
    const source = [
      ...players,
      {
        ...players[1],
        name: "Historical Name",
        roles: ["captain"],
        teams: [beta],
      },
    ];
    expect(ids("role=captain&team=beta&q=Historical", source)).toEqual([3]);
    expect(ids("", source)).toHaveLength(5);
  });
  it("keeps groups together and sorts within each group", () => {
    expect(ids("group=team&sort=pp-asc")).toEqual([4, 2, 3, 1, 5]);
    expect(directoryState(new URLSearchParams(), true).group).toBe("team");
  });
  it("only offers facts found in the complete public source", () => {
    expect(directoryOptions(players).teams).toEqual([beta, alpha]);
    expect(directoryOptions([players[0]])).toMatchObject({
      rank: false,
      pp: false,
      freeAgent: false,
    });
    expect(directoryOptions([players[3]])).toMatchObject({
      rank: true,
      pp: true,
      freeAgent: false,
    });
    expect(directoryOptions([])).toEqual({
      teams: [],
      roles: [],
      rank: false,
      pp: false,
      freeAgent: false,
    });
  });
});
