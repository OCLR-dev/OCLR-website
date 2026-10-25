import type { AppTranslator } from "@/i18n/translate";

export type WikiArticle = {
  slug: string;
  title: string;
  category: string;
  intro: string;
  sections: {
    id: string;
    title: string;
    paragraphs?: (string | (string | { label: string; href: string })[])[];
    items?: string[];
    table?: { headers: string[]; rows: string[][] };
  }[];
  source?: { title: string; author: string; date: string; href: string };
};

export function wikiArticles(tr: AppTranslator): WikiArticle[] {
  return [
    {
      slug: "introduction",
      title: "认识 OCLR",
      category: "赛事入门",
      intro:
        "osu! Chinese League Rookie（OCLR）是一项面向中文 osu! 社区的新秀团体赛事。选手通过个人报名与队长选秀组成队伍，在共同训练和比赛中认识队友、积累经验，体验团队竞技的乐趣。",
      sections: [
        {
          id: "about",
          title: "OCLR 是什么",
          paragraphs: [
            "个人成绩之外，团体赛还有另一种乐趣：有人擅长稳定发挥，有人善于处理复杂节奏，也有人能在关键时刻接下自己熟悉的图。OCLR 希望让不同能力与风格的选手都能在队伍中找到位置。",
            "比赛围绕选秀、训练、选图与正式对局展开。队长负责协调阵容，队员共同准备图池；一次胜利往往来自几个人的配合，而不仅是某一位选手的高分。",
          ],
        },
        {
          id: "journey",
          title: "从报名到上场",
          items: [
            tr(
              "Read the current tournament's {informationPage} for registration dates, eligibility and the schedule.",
              { informationPage: tr("Information page") },
            ),
            "完成个人报名，加入赛事 QQ 群或 Discord，留意名单与阶段更新。",
            "选秀后与队友建立联系，沟通可参赛时间和擅长的图型。",
            "围绕已公布图池进行训练，安排选图、禁图与上场阵容。",
            "按约定时间进入比赛房间，配合裁判完成对局。",
          ],
        },
        {
          id: "roles",
          title: "队伍里的不同角色",
          table: {
            headers: ["角色", "在队伍中的作用"],
            rows: [
              ["Captain", "组织训练、沟通赛程、协调选图与出场安排。"],
              ["队员", "根据自己的特长准备图池，与队友协作完成比赛。"],
              [
                "后排选手",
                "通过适合自己的图型与出场机会，为队伍提供稳定贡献。",
              ],
            ],
          },
        },
        {
          id: "prepare",
          title: "第一次参赛，可以先做什么",
          paragraphs: [
            "先把自己能够稳定发挥的图型、常用 Mods 和可参赛时间告诉队长。练图时记录容易失误的位置，比单纯追求一次最高分更方便队伍判断阵容。",
            "比赛中遇到问题，及时向裁判和队长说明情况。尊重对手、遵守约定时间、保持沟通，也是团队比赛的一部分。",
          ],
        },
        {
          id: "community",
          title: "找到赛事社区",
          paragraphs: [
            "QQ群 926872640",
            [
              "Discord：",
              { label: "OCL Series", href: "https://discord.gg/graS4RJHjM" },
              tr(
                ". The community shares tournament announcements, team discussions and multiplayer sessions. Open {informationPage} in the header for this season's registration and stages.",
                { informationPage: tr("Information page") },
              ),
            ],
          ],
        },
      ],
    },
    {
      slug: "ex",
      title: "EX 模式与后排选手",
      category: "赛制知识",
      intro:
        "EX 是一种面向后排选手的比赛安排。EX 图的难度相对同一图池中的其他图更低，同时限制队长与 T1 的上场人数，让更多队员有机会承担比赛中的关键任务。",
      sections: [
        {
          id: "purpose",
          title: "为什么设置 EX",
          paragraphs: [
            "常规图池中，队伍容易把出场机会集中在较强的选手身上。EX 通过较低的谱面难度和阵容限制，让后排选手也能参与比分争夺，成为队伍准备阵容时需要认真考虑的一环。",
            "难度降低不代表不需要训练。EX 更看重把熟悉的谱面打稳、减少失误，以及队友之间的整体发挥。",
          ],
        },
        {
          id: "lineup",
          title: "上场人数限制",
          paragraphs: [
            "一张 EX 图的上场阵容中，Captain 与 T1 选手合计最多一人。这里的“一人”是两类选手共享的名额，不是队长和 T1 各有一个名额。",
            "队长上场时，T1 选手不能同时上场；一名 T1 上场时，队长及其他 T1 选手不能同时上场。其余上场位置由队长与 T1 以外的选手组成。",
          ],
          table: {
            headers: ["阵容组合", "是否符合限制"],
            rows: [
              ["一名 Captain ＋ 后排选手", "符合"],
              ["一名 T1 ＋ 后排选手", "符合"],
              ["全部由后排选手组成", "符合"],
              ["Captain ＋ 一名 T1", "不符合：合计两人"],
              ["两名 T1 同时上场", "不符合：合计两人"],
            ],
          },
        },
        {
          id: "maps",
          title: "EX 图有什么不同",
          paragraphs: [
            "EX 图相对于同池其他图更容易上手，目的是给后排选手留下能够练习、能够发挥的空间。这是图池内部的相对难度安排，并不对应一个固定的星数范围。",
            "EX 的阵容限制不会改变选手本身的身份或 Tier。Captain 仍然是 Captain，选手的 Tier 也不会因为参加 EX 而调整。",
          ],
        },
        {
          id: "practice",
          title: "怎样准备 EX",
          items: [
            "先核对上场阵容，确认 Captain 与 T1 合计不超过一人。",
            "优先练习容易断连或失误的段落，让各位上场选手都有稳定完成的把握。",
            "队长与队员一起比较稳定性，不只看偶尔出现的最高分。",
            "在比赛前沟通换人与出场安排，避免临场才发现阵容不符合限制。",
          ],
        },
      ],
    },
    {
      slug: "latency",
      title: "osu! 延迟优化阅读指南",
      category: "游玩与设备",
      intro:
        "《手把手教你降低 osu 延迟》是差异不减肥了于 2022 年发布的社区经验文章，围绕画面、输入与音频延迟，按调整深度分为三个部分。",
      sections: [
        {
          id: "basics",
          title: "基础：游戏设置与设备",
          paragraphs: [
            "基础部分讨论鼠标加速、全屏显示、刷新率、显卡设置、音频输出和数位板驱动，关注帧率、稳定性与操作反馈。",
          ],
        },
        {
          id: "advanced",
          title: "进阶：系统与外设",
          paragraphs: [
            "进阶部分涉及键盘触发、USB 连接、设备中断、系统服务与处理器频率。作者也提到，部分调整可能影响日常使用或系统稳定性。",
          ],
        },
        {
          id: "further",
          title: "进一步：改变游玩环境",
          paragraphs: [
            "最后一部分讨论高刷新率显示器、音频库、Linux、外部按键音效及低分辨率皮肤等方案。",
          ],
        },
        {
          id: "reading",
          title: "阅读原文",
          paragraphs: [
            "文章的测试与设置以作者当时的设备、系统和客户端为背景。具体步骤、配图及经验说明见原文。",
          ],
        },
      ],
      source: {
        title: "手把手教你降低osu延迟",
        author: "差异不减肥了",
        date: "2022-03-24",
        href: "https://www.bilibili.com/opus/640958207556059142",
      },
    },
  ];
}

export function wikiHref(slug: string) {
  return slug === "introduction" ? "/wiki" : `/wiki/${slug}`;
}
