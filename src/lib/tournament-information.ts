import { remoteMode } from "./data-source";
export type TournamentInformation = {
  name: string;
  intro: string;
  banner: string | null;
  timeZone: string;
  schedule: { event: string; date: string }[];
  prizes: { placing: string; reward: string }[];
  organization: { role: string; members: { name: string; href?: string }[] }[];
  links: { label: string; href: string }[];
  teams: { name: string; captain: string; members: string[]; href?: string }[];
  pools: {
    name: string;
    href?: string;
    groups: { category: string; maps: { title: string; href?: string }[] }[];
  }[];
  rules: { heading: string; paragraphs: string[] }[];
};

export function informationPreview(slug: string): TournamentInformation | null {
  if (
    remoteMode() ||
    process.env.NODE_ENV === "production" ||
    slug !== "dev-s11"
  )
    return null;
  const base = `/tournaments/${slug}`;
  return {
    name: "OCLR S11",
    intro:
      "osu! Chinese League Rookie（OCLR）是面向中文 osu! 社区的新秀团体赛事。第十一届比赛采用个人报名、队长选秀的组队方式，选手将与新队友共同经历瑞士轮和淘汰赛，争夺本届冠军。",
    banner: "/oclr-s11-website-background.webp",
    timeZone: "Asia/Shanghai · UTC+8",
    schedule: [
      { event: "报名阶段", date: "2026.11.01 — 2026.11.23 23:59" },
      { event: "选手名单公布", date: "2026.11.25" },
      { event: "队长选秀", date: "2026.11.28 20:00" },
      { event: "瑞士轮", date: "2026.12.05 — 2026.12.14" },
      { event: "八强赛", date: "2026.12.19 — 2026.12.20" },
      { event: "半决赛", date: "2026.12.26 — 2026.12.27" },
      { event: "决赛", date: "2027.01.02 — 2027.01.03" },
      { event: "总决赛", date: "2027.01.09 — 2027.01.10" },
    ],
    prizes: [
      {
        placing: "冠军",
        reward: "人民币 2,000 元、每位队员 6 个月 osu!supporter、冠军纪念卡",
      },
      {
        placing: "亚军",
        reward: "人民币 1,000 元、每位队员 3 个月 osu!supporter、亚军纪念卡",
      },
      {
        placing: "季军",
        reward: "人民币 500 元、每位队员 1 个月 osu!supporter、季军纪念卡",
      },
    ],
    organization: [
      {
        role: "赛事主办",
        members: [{ name: "AsterRain" }, { name: "TsukiNote" }],
      },
      {
        role: "选图团队",
        members: [
          { name: "LumiArc" },
          { name: "MizunoBeat" },
          { name: "SoraPalette" },
        ],
      },
      {
        role: "测图团队",
        members: [
          { name: "KumoStep" },
          { name: "NagiTempo" },
          { name: "YoruFlow" },
        ],
      },
      {
        role: "裁判团队",
        members: [
          { name: "HaruSignal" },
          { name: "FuyuRhythm" },
          { name: "EchoLane" },
        ],
      },
      {
        role: "直播与解说",
        members: [{ name: "RinCanvas" }, { name: "AoiPulse" }],
      },
      {
        role: "视觉设计",
        members: [{ name: "StellaInk" }, { name: "MomoHue" }],
      },
    ],
    links: [
      { label: "选手报名", href: `${base}/register` },
      {
        label: "QQ群 926872640",
        href: "https://qm.qq.com/q/sqIoPulwUo",
      },
      {
        label: "Discord · OCL Series",
        href: "https://discord.gg/graS4RJHjM",
      },
      { label: "选秀直播间", href: `${base}/draft` },
      { label: "赛事对阵", href: `${base}/bracket` },
      { label: "比赛结果", href: `${base}/results` },
    ],
    teams: [
      {
        name: "星河列车",
        captain: "HoshinoRay",
        members: [
          "YukiSoda",
          "MikanStep",
          "NatsuChord",
          "RuriLoop",
          "KazeMint",
        ],
      },
      {
        name: "月光奏鸣曲",
        captain: "LunaKey",
        members: ["HaruPetal", "ShiroBPM", "AmeGlass", "MoriEcho", "TokiBlue"],
      },
      {
        name: "薄荷汽水",
        captain: "MintSignal",
        members: ["SuzuArc", "KiriBeat", "YumeDrop", "FuyuLight", "NagiCloud"],
      },
      {
        name: "极昼航线",
        captain: "AuroraNote",
        members: ["RinOrbit", "AoCanvas", "SoraLily", "MioTempo", "YoruWave"],
      },
      {
        name: "暮色回响",
        captain: "DuskChord",
        members: ["KokoRain", "ReiBloom", "NekoTune", "MizuLeaf", "HinaSky"],
      },
      {
        name: "樱色频率",
        captain: "SakuraPulse",
        members: ["UmiGlow", "KuroStep", "RikaSnow", "YuiRipple", "NanaStar"],
      },
      {
        name: "白昼流星",
        captain: "DaybreakArc",
        members: ["SayaBell", "HakuWind", "MomoNova", "IroDream", "TsubakiInk"],
      },
      {
        name: "云端来信",
        captain: "CloudLetter",
        members: ["RaiSong", "ChiyoBeat", "NoriSun", "EnaMoon", "AkiraMist"],
      },
      ...[
        "琉璃海岸",
        "晨曦协奏",
        "远星轨迹",
        "雨后晴空",
        "霓虹旅人",
        "深蓝和弦",
        "雪境回声",
        "花火之约",
      ].map((name, i) => ({
        name,
        captain: [
          "GlassTide",
          "DawnChord",
          "OrbitLine",
          "RainClear",
          "NeonTrail",
          "BlueKey",
          "SnowEcho",
          "FireBloom",
        ][i],
        members: Array.from(
          { length: 5 },
          (_, j) =>
            `${["Tide", "Dawn", "Orbit", "Rain", "Neon", "Azure", "Snow", "Bloom"][i]}${["Note", "Arc", "Beat", "Glow", "Star"][j]}`,
        ),
      })),
    ],
    pools: [
      {
        name: "瑞士轮",
        href: `${base}/mappools`,
        groups: [
          {
            category: "No Mod",
            maps: [
              { title: "Asteria — Summer Orbit [First Light]" },
              { title: "Lumière — Paper Stars [Constellation]" },
              { title: "Mizuno — After the Rain [Ripples]" },
              { title: "Kaleido — Signal Blue [Resonance]" },
            ],
          },
          {
            category: "Hidden",
            maps: [
              { title: "Sora Palette — Moonlit Letter [Luminous]" },
              { title: "Echo Garden — Silent Bloom [Petals]" },
            ],
          },
          {
            category: "Hard Rock",
            maps: [
              { title: "Stella Drive — Skyline [Beyond]" },
              { title: "Nagi — Prism Heart [Refraction]" },
            ],
          },
          {
            category: "Double Time",
            maps: [
              { title: "Mint Circuit — Daybreak Express [Departure]" },
              { title: "Yoru Waves — Chasing Comets [Starlight]" },
            ],
          },
          {
            category: "Free Mod",
            maps: [{ title: "Rin Canvas — Our Tomorrow [Together]" }],
          },
          {
            category: "Tiebreaker",
            maps: [
              {
                title: "Aoi Orchestra — A Sky Full of Wishes [One More Dream]",
              },
            ],
          },
        ],
      },
    ],
    rules: [
      {
        heading: "赛事规则",
        paragraphs: [
          "本届比赛使用 osu! 模式，以四对四团队赛形式进行，计分方式为 ScoreV2。每支队伍由一名 Captain 和通过选秀加入的选手组成。",
          "赛事分为五轮瑞士轮与双败淘汰赛。瑞士轮采用九局五胜制，三胜晋级、三败淘汰。晋级队伍进入胜者组或败者组，淘汰赛采用九局五胜制，总决赛采用十一局六胜制。",
          "选手只能代表一支队伍参赛。比赛期间不得共享账号、代打，或使用任何影响公平竞技的软件与操作。",
          "比赛中出现争议时，由当场裁判记录情况并提交赛事主办方处理。选手应保留相关录像、截图及聊天记录。",
        ],
      },
      {
        heading: "报名与选秀",
        paragraphs: [
          "选手使用自己的 osu! 账号登录赛事网站，填写报名表并确认参赛时间。报名截止时间为 2026 年 11 月 23 日 23:59（UTC+8）。",
          "报名审核通过后，选手进入选秀名单。队长按照选秀顺序选择队员，每次选择完成后更新队伍名单。",
          "选手应加入赛事 QQ 群或 Discord，保持联系方式有效，并及时回应赛事工作人员和队长的通知。",
        ],
      },
      {
        heading: "比赛流程",
        paragraphs: [
          "双方队伍在比赛开始前十五分钟集合，由队长确认出场名单。裁判建立比赛房间并向选手发送邀请。",
          "双方队长通过掷骰决定先后手，依次完成禁图和选图。每张谱面开始前可以更换出场选手。",
          "每张谱面比较双方四名选手的总分，得分更高的队伍获得一分。比分达到赛制要求后结束比赛。",
          "双方进入决胜局时，使用当前轮次的 Tiebreaker 谱面。决胜图不参与常规禁图与选图。",
        ],
      },
      {
        heading: "图池与模组",
        paragraphs: [
          "图池按照 No Mod、Hidden、Hard Rock、Double Time、Free Mod 与 Tiebreaker 分类。选手可在图池页面查看谱面及对应模组。",
          "每轮图池在该轮比赛开始前公布。图池公布后，选手可自由练习，比赛时使用裁判指定的谱面版本。",
          "Free Mod 谱面的模组选择由当轮图池规定，选手在准备阶段向裁判确认自己的模组。",
        ],
      },
      {
        heading: "赛程安排",
        paragraphs: [
          "队长在每周三 23:59 前提交周末可参赛时间。赛事工作人员结合双方时间安排比赛，并在赛程页面公布。",
          "需要调整比赛时间时，双方队长应先达成一致，再向裁判团队提交申请。变更生效后，以赛程页面显示的时间为准。",
          "因连接问题无法继续比赛时，选手应立即通知裁判。裁判根据发生时间、房间记录与双方情况决定后续处理。",
        ],
      },
    ],
  };
}
