import type { RefereeWorkspace } from "../../src/lib/referee";
import {
  projectReferee,
  type RefereeEvent,
  type RefereePolicy,
} from "../../src/lib/referee-model";
import { emptyRefereeSettings } from "../../src/lib/referee-commands";
export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function workspace(events?: RefereeEvent[]): RefereeWorkspace {
  const maps = Array.from({ length: 5 }, (_, i) => ({
    id: id(100 + i),
    beatmapId: 10001 + i,
    category: i === 4 ? ("TB" as const) : ("NM" as const),
    position: i === 4 ? 1 : i + 1,
    metadata: {
      setId: 1,
      title: `Synthetic ${i + 1}`,
      artist: "Synthetic Artist",
      difficulty: "Synthetic Difficulty",
      mapper: "Synthetic Mapper",
      stars: 4,
      bpm: 180,
      duration: 90,
    },
  }));
  const policy: RefereePolicy = {
    steps: [
      {
        kind: "ban",
        actor: "firstBan",
        categories: [],
        entryIds: [],
        avoidRepeatCategory: false,
        tiedAt: null,
      },
      {
        kind: "pick",
        actor: "firstPick",
        categories: [],
        entryIds: [],
        avoidRepeatCategory: false,
        tiedAt: null,
      },
      {
        kind: "ban",
        actor: "secondBan",
        categories: [],
        entryIds: [],
        avoidRepeatCategory: false,
        tiedAt: null,
      },
      {
        kind: "pick",
        actor: "secondPick",
        categories: [],
        entryIds: [],
        avoidRepeatCategory: false,
        tiedAt: null,
      },
      {
        kind: "tb",
        actor: "neutral",
        categories: ["TB"],
        entryIds: [],
        avoidRepeatCategory: false,
        tiedAt: 1,
      },
    ],
    commands: {
      roomSize: 8,
      noFail: true,
      categoryMods: {
        NM: { mods: [], freemod: false },
        TB: { mods: [], freemod: true },
      },
      banSeconds: 60,
      pickSeconds: 90,
      prepareSeconds: 120,
      startSeconds: 5,
    },
  };
  const series = { type: "first_to" as const, wins: 2 };
  const orders = { firstBanTeamId: id(10), firstPickTeamId: id(10) };
  const history: RefereeEvent[] = events ?? [
    {
      id: id(1),
      ordinal: 1,
      actorId: 1,
      createdAt: "2026-10-31T00:00:00.000Z",
      payload: { type: "order_set", ...orders },
    },
  ];
  const settings = {
    ...emptyRefereeSettings,
    roomName: "OCLR S11: Synthetic",
    roomSize: 8,
    timerSeconds: 120,
    startSeconds: 5,
  };
  const basis = {
    policy,
    teamIds: [id(10), id(11)],
    maps,
    series,
    tiedMapPolicy: "require_replay" as const,
  };
  return {
    fixture: {
      id: id(20),
      label: "Synthetic fixture",
      roundId: id(30),
      status: "scheduled",
      homeTeamId: id(10),
      awayTeamId: id(11),
      version: 1,
    },
    round: { id: id(30), name: "Synthetic round" },
    teams: [
      {
        id: id(10),
        name: "Blue",
        captainId: 1,
        captainUsername: "SyntheticBlue",
        members: [],
      },
      {
        id: id(11),
        name: "Red",
        captainId: 2,
        captainUsername: "SyntheticRed",
        members: [],
      },
    ],
    defaultSettings: settings,
    maps,
    rules: {
      version: "synthetic",
      mode: "osu",
      teamType: "team-vs",
      scoringType: "scorev2",
      aggregation: "sum",
      playersPerTeam: 1,
      series,
      allowSubstitutions: false,
      allowShortHanded: false,
      failedScorePolicy: "include",
      tiedMapPolicy: "require_replay",
    },
    series,
    policy,
    policyRevision: 1,
    session: {
      revision: history.length,
      ...orders,
      settings,
      dependencyFingerprint: "a".repeat(64),
      basis,
    },
    events: history,
    projection: projectReferee({ ...basis, orders, events: history }),
    dependencyFingerprint: "a".repeat(64),
    readiness: [],
    canRecord: true,
    canConfigure: false,
  };
}
