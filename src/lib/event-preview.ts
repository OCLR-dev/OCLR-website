import type { PublicSlot } from "./competition-read-contracts";
import type { FixtureStatus } from "./fixture-status";
import { informationPreview } from "./tournament-information";
export type EventPlayer = {
  id: number;
  name: string;
  team: string | null;
  captain: boolean;
  rank: number | null;
  pp: number | null;
  bio?: string;
  messages?: { author: string; text: string }[];
  href?: string;
  fetchedAt?: string;
};
export type EventMatch = {
  id: string;
  round: string;
  roundId?: string;
  stage: string;
  sides?: [PublicSlot, PublicSlot];
  label?: string;
  redHref?: string;
  blueHref?: string;
  winner?: 0 | 1 | null;
  forfeit?: boolean;
  recorded?: boolean;
  mps?: string[];
  pool: string;
  poolHref?: string;
  time: string;
  roomOpenedAt?: string;
  red: string;
  blue: string;
  score: [number, number] | null;
  reviewScore?: [number, number] | null;
  status?: FixtureStatus;
  first?: string;
  redBan?: string;
  blueBan?: string;
  mp?: string;
  vod?: string;
  referee?: string;
  streamer?: string;
  sourceRed?: string;
  sourceBlue?: string;
  href?: string;
  record?: string;
};
export function eventPreview(slug: string) {
  const info = informationPreview(slug);
  if (!info) return null;
  const players: EventPlayer[] = info.teams.flatMap((t, i) =>
    [t.captain, ...t.members].map((name, j) => ({
      id: 90000000 + i * 6 + j,
      name,
      team: t.name,
      captain: j === 0,
      rank: 18200 + i * 2700 + j * 318,
      pp: 5320 - i * 93 - j * 37,
      bio: [
        "喜欢读谱和节奏变化，擅长 NM 与 HD。平时晚上在线，期待和大家一起打出好成绩。",
        "主练 HR 和长图，周末可以稳定参加训练。希望在这届比赛认识更多队友。",
        "偏爱高速串和 DT，最近在练习稳定性。一起享受比赛吧！",
      ][j % 3],
      messages: [
        ...(i === 0 && j === 0
          ? [
              {
                author: "MikanStep",
                text: "周六晚上的训练我可以来，先练 NM 吧。",
              },
              {
                author: "NatsuChord",
                text: "我把练习图池整理好了，晚上一起打。",
              },
              { author: "RuriLoop", text: "刚才那张 HD 的读谱好稳！" },
              { author: "KazeMint", text: "周末比赛加油，期待一起上场。" },
            ]
          : []),
        {
          author: t.captain === name ? t.members[0] : t.captain,
          text: [
            "这周的训练一起加油！",
            "上次联机的 HD 发挥很稳。",
            "期待我们下一次配合！",
          ][j % 3],
        },
      ],
    })),
  );
  const names = info.teams.map((t) => t.name);
  const matches: EventMatch[] = [];
  const records = names.map((name, seed) => ({
    name,
    seed,
    wins: 0,
    losses: 0,
    opponents: new Set<string>(),
  }));
  for (let r = 0; r < 5; r++) {
    const active = records
      .filter((t) => t.wins < 3 && t.losses < 3)
      .sort(
        (a, b) => b.wins - a.wins || a.losses - b.losses || a.seed - b.seed,
      );
    let m = 0;
    while (active.length > 1) {
      const red = active.shift()!;
      let index = active.findIndex(
        (t) => t.wins === red.wins && !red.opponents.has(t.name),
      );
      if (index < 0) index = active.findIndex((t) => t.wins === red.wins);
      if (index < 0) index = 0;
      const blue = active.splice(index, 1)[0];
      const redWins = (red.seed + r) % 3 !== 1;
      const score: [number, number] = redWins
        ? [5, (m + r) % 4]
        : [(m + r) % 4, 5];
      matches.push({
        id: `S${r + 1}-${++m}`,
        round: `瑞士轮 · 第 ${r + 1} 轮`,
        stage: "group",
        record: `${red.wins}–${red.losses}`,
        pool: `SW${r + 1}`,
        time: `2026-12-${String(5 + r * 2 + Math.floor((m - 1) / 4)).padStart(2, "0")} ${18 + ((m - 1) % 4)}:00`,
        red: red.name,
        blue: blue.name,
        score,
        first: m % 2 ? "red" : "blue",
        redBan: "HR2 · HD1",
        blueBan: "NM2 · DT2",
        referee: "HaruSignal",
        streamer: "RinCanvas",
        mp: "https://osu.ppy.sh/community/matches/121991376",
        vod: "https://www.bilibili.com/video/BV1EppG6xEC3",
      });
      red.opponents.add(blue.name);
      blue.opponents.add(red.name);
      if (redWins) {
        red.wins++;
        blue.losses++;
      } else {
        blue.wins++;
        red.losses++;
      }
    }
  }
  const qualified = records
    .filter((t) => t.wins === 3)
    .sort((a, b) => a.losses - b.losses || a.seed - b.seed)
    .map((t) => t.name);
  const entrants = qualified.length === 8 ? qualified : names.slice(0, 8);
  const bracket = [
    [
      "W1",
      "胜者组半决赛",
      entrants[0],
      entrants[2],
      "瑞士轮第 1 名",
      "瑞士轮第 4 名",
    ],
    [
      "W2",
      "胜者组半决赛",
      entrants[1],
      entrants[3],
      "瑞士轮第 2 名",
      "瑞士轮第 3 名",
    ],
    [
      "L1",
      "败者组第一轮",
      entrants[4],
      entrants[7],
      "瑞士轮第 5 名",
      "瑞士轮第 8 名",
    ],
    [
      "L2",
      "败者组第一轮",
      entrants[5],
      entrants[6],
      "瑞士轮第 6 名",
      "瑞士轮第 7 名",
    ],
    ["L3", "败者组第二轮", "#W1 败者", "#L1 胜者", "W1", "L1"],
    ["L4", "败者组第二轮", "#W2 败者", "#L2 胜者", "W2", "L2"],
    ["W3", "胜者组决赛", "#W1 胜者", "#W2 胜者", "W1", "W2"],
    ["L5", "败者组半决赛", "#L3 胜者", "#L4 胜者", "L3", "L4"],
    ["L6", "败者组决赛", "#W3 败者", "#L5 胜者", "W3", "L5"],
    ["GF", "总决赛", "#W3 胜者", "#L6 胜者", "W3", "L6"],
    ["GF2", "重置决赛", "#GF 红队", "#GF 蓝队", "GF", "GF"],
  ];
  bracket.forEach(([id, round, red, blue, sourceRed, sourceBlue], i) =>
    matches.push({
      id,
      round,
      stage: "knockout",
      pool: i < 6 ? "PO" : "F",
      time: `2026-12-${19 + Math.floor(i / 2)} ${i % 2 ? "21:00" : "20:00"}`,
      red,
      blue,
      sourceRed,
      sourceBlue,
      score: null,
      referee: "EchoLane",
      streamer: "AoiPulse",
    }),
  );
  return {
    players,
    matches,
    teams: names,
    maps:
      info.pools[0]?.groups.flatMap((g) =>
        g.maps.map((m, i) => ({
          slot: `${({ "No Mod": "NM", Hidden: "HD", "Hard Rock": "HR", "Double Time": "DT", "Free Mod": "FM", Tiebreaker: "TB" } as Record<string, string>)[g.category] ?? g.category}${i + 1}`,
          title: m.title,
        })),
      ) ?? [],
  };
}
