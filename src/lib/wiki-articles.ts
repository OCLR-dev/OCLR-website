import type { AppTranslator } from "@/i18n/translate";

// Plain text, or text mixed with links.
export type WikiText = string | (string | { label: string; href: string })[];

export type WikiArticle = {
  slug: string;
  title: string;
  category: string;
  intro: string;
  sections: {
    id: string;
    title: string;
    paragraphs?: WikiText[];
    items?: string[];
    table?: { headers: string[]; rows: WikiText[][] };
    figures?: {
      src: string;
      width: number;
      height: number;
      alt: string;
      caption: string;
    }[];
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
        "osu! Chinese League Rookie（OCLR）是一项面向中文 osu! 社区新秀玩家的团体赛事，迄今为止已成功举办10届。选手通过个人报名与队长选秀组成队伍，在共同训练和比赛中认识队友、积累经验，体验团队竞技的乐趣。",
      sections: [
        {
          id: "journey",
          title: "从报名到上场",
          items: [
            tr(
              "Read the current tournament's {informationPage} for registration dates, eligibility and the schedule.",
              { informationPage: tr("Information page") },
            ),
            "完成个人报名，加入赛事 QQ 群或 Discord，留意名单与阶段更新。",
            "选秀后与队友建立联系，沟通可参赛时间和擅长的谱面类型。",
            "与队友围绕已公布图池进行训练，安排选图、禁图与上场阵容。",
            "按约定时间进入比赛房间，遵循裁判指示完成比赛。",
          ],
        },
        {
          id: "roles",
          title: "队伍里的不同角色",
          table: {
            headers: ["角色", "在队伍中的作用"],
            rows: [
              ["队长", "组织训练，沟通赛程，协调选图、禁图与出场安排。"],
              ["队员", "练习赛图，与队友协作完成比赛。"],
            ],
          },
        },
        {
          id: "prepare",
          title: "第一次参赛，可以先做什么",
          paragraphs: [
            "先把自己能够稳定发挥的谱面类型、擅长的 Mods 和可参赛时间告诉队长。练图时记录容易失误的位置，比单纯追求一次最高分更方便队伍判断阵容。",
            "比赛中遇到问题，请及时向裁判和队长说明情况。尊重对手、遵守约定时间、保持沟通，也是团队比赛的一部分。",
          ],
        },
        {
          id: "community",
          title: "找到赛事社区",
          paragraphs: [
            "QQ群：926872640",
            [
              "Discord：",
              {
                label: "https://discord.gg/graS4RJHjM",
                href: "https://discord.gg/graS4RJHjM",
              },
            ],
            tr(
              "The community shares tournament announcements, team discussions and everyday chat. Open the {informationPage} at the top of the page for this season's registration and stages.",
              { informationPage: tr("Information page") },
            ),
          ],
        },
      ],
    },
    {
      slug: "ex",
      title: tr("EX mode and back-row players"),
      category: tr("Tournament format"),
      intro: tr(
        "In S11, EX is a mode declared when a team picks a map. Neither Captain nor T1 may play, and each team fields one fewer player than in the normal format.",
      ),
      sections: [
        {
          id: "purpose",
          title: tr("S11 rules reference"),
          paragraphs: [
            [
              tr(
                "This article follows the EX section of the S11 rules. Read the full tournament rules here: ",
              ),
              { label: tr("S11 EX rules"), href: "/tournaments/s11#rules-6" },
            ],
          ],
        },
        {
          id: "lineup",
          title: tr("Lineup restrictions"),
          paragraphs: [
            tr(
              "Neither Captain nor T1 may play in EX mode. Each team fields one fewer player: for example, a 4v4 match becomes 3v3. EX mode must still follow the FM rules.",
            ),
          ],
          table: {
            headers: [tr("Lineup"), tr("EX restriction")],
            rows: [
              [tr("Includes Captain"), tr("Not allowed")],
              [tr("Includes T1"), tr("Not allowed")],
              [
                tr("Excludes both Captain and T1"),
                tr(
                  "Also field one fewer player per team and follow the FM rules.",
                ),
              ],
            ],
          },
        },
        {
          id: "maps",
          title: tr("Maps and activation"),
          items: [
            tr(
              "Each team may use EX mode up to twice per match; using it zero times or once is also allowed. EX cannot be used on TB.",
            ),
            tr(
              "Except for TB, EX can be used on any map in the pool. A team must declare EX to the referee immediately when making its own pick.",
            ),
            tr(
              "EX cannot be activated on the opponent's pick or on either team's first pick of the match.",
            ),
          ],
        },
        {
          id: "practice",
          title: tr("Insufficient eligible players"),
          paragraphs: [
            tr(
              "If one team cannot field the players required for EX and the opponent can, the opponent makes one fewer pick (applied in the final round of picks) and automatically receives one win. No EX mode is used for that match.",
            ),
            tr(
              "If a Captain deliberately keeps back-row players from playing to trigger this rule, report it to the organizing committee.",
            ),
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
    liruArticle(tr),
  ];
}

// Official OCLR mascot, designed as a community proposal (#334); Chinese-style outfit added in #442, stickers in #536.
// Images and licence notes in public/mascot/liru/.
const LIRU_DESIGNER = "JerrYamada";
const LIRU_STICKER_SIZES = [512, 256, 128, 64];

// Links to one sticker's files at every size, e.g. 512 · 256 · 128 · 64.
function liruStickerFiles(id: string, format: "png" | "webp"): WikiText {
  return LIRU_STICKER_SIZES.flatMap((size, i) => [
    ...(i ? [" · "] : []),
    {
      label: String(size),
      href: `/mascot/liru/stickers/${format}/liru-${id}-${size}.${format}`,
    },
  ]);
}

function liruArticle(tr: AppTranslator): WikiArticle {
  return {
    slug: "liru",
    title: tr("Liru (LR-chan): the OCLR mascot"),
    category: tr("Community"),
    intro: tr(
      "Liru (LR-chan) is the official mascot of osu! Chinese League Rookie (OCLR), in the spirit of pippi and the other osu! mode mascots. Her design began as a community proposal by {designer}.",
      { designer: LIRU_DESIGNER },
    ),
    sections: [
      {
        id: "profile",
        title: tr("Profile"),
        paragraphs: [
          tr(
            "A first-year university student who has just started playing osu! and is entering OCLR for the first time: a rookie, like the players the tournament is for.",
          ),
          tr(
            "Cheerful and a little clumsy: after a miss she hits retry right away, and after a match she reviews her plays carefully. Her catchphrase is “One more round!”",
          ),
        ],
        figures: [
          {
            src: "/mascot/liru/sheet-main.webp",
            width: 1600,
            height: 1453,
            alt: tr(
              "Liru character sheet: full-body front view, profile, design details and colour palette",
            ),
            caption: tr("Character sheet v1.2.1"),
          },
        ],
      },
      {
        id: "design",
        title: tr("Design elements"),
        paragraphs: [
          tr(
            "Her lavender hair and track jacket echo the site's light purple, with a green sprout as the accent. Her side ponytail, bracelet and red shoe are on her right; the hairclips and badge are on her left.",
          ),
        ],
        figures: [
          {
            src: "/mascot/liru/sheet-turnaround.webp",
            width: 1600,
            height: 1160,
            alt: tr(
              "Liru turnaround: front, side and back views at the same scale",
            ),
            caption: tr("Turnaround"),
          },
        ],
        table: {
          headers: [tr("Element"), tr("Meaning")],
          rows: [
            [tr("Sprout on her ahoge"), tr("A rookie is a new sprout")],
            [
              tr("Side ponytail with a pale lilac scrunchie"),
              tr("The scrunchie echoes osu!'s hit circle"),
            ],
            [
              tr("Green bracelet with six beads"),
              tr("The six mappool categories: NM, HD, HR, DT, FM and TB"),
            ],
            [
              tr("Crossed red and blue hairclips"),
              tr("The red and blue teams of a match"),
            ],
            [
              tr("Red and blue sneakers"),
              tr("Red on her right foot, blue on her left"),
            ],
            [
              tr("Tier badge on her left chest"),
              tr("Shown as T4; can be T1–T4"),
            ],
            [
              tr("Back print LIRU / 11"),
              tr("Her name and the current season number, updated each season"),
            ],
          ],
        },
      },
      {
        id: "expressions",
        title: tr("Expressions"),
        paragraphs: [
          tr(
            "Only her face changes; the hairstyle, sprout, scrunchie and hairclips stay the same.",
          ),
        ],
        figures: [
          {
            src: "/mascot/liru/sheet-expressions.webp",
            width: 1600,
            height: 1227,
            alt: tr(
              "Six Liru expressions: happy, surprised, determined, down after a miss, smug and shy",
            ),
            caption: tr("Expressions"),
          },
        ],
      },
      {
        id: "outfit-chinese",
        title: tr("Outfit: Chinese style"),
        paragraphs: [
          tr(
            "An alternate outfit for Chinese-style and festive artwork. She is quieter in it: eyes open, a light smile, head slightly tilted. The track-jacket design remains her main look.",
          ),
        ],
        figures: [
          {
            src: "/mascot/liru/sheet-outfit-chinese.webp",
            width: 1600,
            height: 1453,
            alt: tr(
              "Liru in her Chinese-style outfit: full-body front view, design details and colour palette",
            ),
            caption: tr("Chinese-style outfit v1.2"),
          },
        ],
        table: {
          headers: [tr("Element"), tr("Description")],
          rows: [
            [
              tr("Sprout, leaf hairclip, white headphones and bead bracelet"),
              tr("Kept from her main design"),
            ],
            [
              tr("Hairpins with a jade tassel"),
              tr("Worn on her left, next to the leaf hairclip"),
            ],
            [
              tr("Fitted mandarin-collar jacket"),
              tr("Short and close-fitting, with jade-green frog buttons"),
            ],
            [
              tr("Open folding fan"),
              tr(
                "Jade-green leaf and lavender edge, with a jade tassel on the handle",
              ),
            ],
            [
              tr("White embroidered ankle boots"),
              tr("Jade-green embroidery; they replace the sneakers"),
            ],
          ],
        },
        items: [
          tr(
            "This outfit drops the side ponytail, the red and blue hairclips, the Tier badge and the back print.",
          ),
          tr(
            "The sprout still grows from the tip of her ahoge, and her hair stays lavender.",
          ),
        ],
      },
      {
        id: "outfit-chinese-palette",
        title: tr("Chinese-style outfit: colour palette"),
        table: {
          headers: [tr("Colour"), tr("Hex value")],
          rows: [
            [tr("Hair colour"), "#D4CFE5"],
            [tr("Sprout"), "#899E5E"],
            [tr("Mandarin-collar jacket"), "#BBB6D3"],
            [tr("Frog buttons"), "#809275"],
            [tr("Pleated skirt"), "#F3F3F3"],
            [tr("Tights"), "#675C68"],
            [tr("Skin tone"), "#FAF1EB"],
            [tr("Embroidered boots"), "#C9CEDA"],
          ],
        },
      },
      {
        id: "stickers",
        title: tr("Stickers"),
        paragraphs: [
          tr(
            "Chibi stickers of Liru in her Chinese-style outfit, free for the website, stream overlays and other interface designs: a pick and a ban marker for the mappool, and one for each mappool category.",
          ),
          [
            tr("File names, sizes and alt text are listed in "),
            {
              label: "manifest.json",
              href: "/mascot/liru/stickers/manifest.json",
            },
            tr("."),
          ],
        ],
        figures: [
          {
            src: "/mascot/liru/sheet-stickers.webp",
            width: 1600,
            height: 509,
            alt: tr(
              "Eight Liru chibi stickers on light and dark backgrounds: pick, ban, NM, HD, HR, DT, FM and TB",
            ),
            caption: tr("Chibi stickers v1.0.0"),
          },
        ],
        table: {
          headers: [tr("Sticker"), tr("Pose"), "PNG", "WebP"],
          rows: (
            [
              ["pick", tr("Holds up a white board with a green check mark")],
              ["ban", tr("Pouts behind a white board with a red cross")],
              ["mod-nm", tr("Sips a cup of tea")],
              ["mod-hd", tr("Gropes her way forward in sunglasses")],
              ["mod-hr", tr("Strikes a rock pose with an electric guitar")],
              ["mod-dt", tr("Dashes forward with speed lines")],
              ["mod-fm", tr("Wonders which card to take")],
              ["mod-tb", tr("Hides half her face behind an open fan")],
            ] as const
          ).map(([id, pose]) => [
            id,
            pose,
            liruStickerFiles(id, "png"),
            liruStickerFiles(id, "webp"),
          ]),
        },
        items: [
          tr(
            "Every sticker sits on the same transparent square canvas with a white rim, so one can replace another in a fixed-size slot. PNG and WebP are provided at 512, 256, 128 and 64 px.",
          ),
          tr(
            "The stickers carry no team colour or text; show the team with the interface's existing red and blue borders.",
          ),
          tr(
            "Scale them proportionally; do not stretch, recolour, crop the rim or flip them horizontally.",
          ),
        ],
      },
      {
        id: "palette",
        title: tr("Colour palette"),
        table: {
          headers: [tr("Colour"), tr("Hex value")],
          rows: [
            [tr("Hair colour"), "#DED1F8"],
            [tr("Hair shadow"), "#8D88C1"],
            [tr("Eye colour"), "#806DC1"],
            [tr("Scrunchie"), "#F4F1FF"],
            [tr("Skin tone"), "#FEF5F6"],
            [tr("Sprout"), "#A4C264"],
            [tr("Bead bracelet"), "#CEF9B7"],
            [tr("Track jacket"), "#E0DCFA"],
            [tr("Ribbed cuffs"), "#7067B6"],
            [tr("T-shirt"), "#FFFFFF"],
            [tr("Pleated skirt"), "#C3CADC"],
            [tr("Team red"), "#E8556A"],
            [tr("Team blue"), "#4C7BE5"],
          ],
        },
      },
      {
        id: "usage",
        title: tr("Usage notes"),
        items: [
          tr(
            "Keep the hair lavender, never pink, so she stays clearly distinct from the official osu! characters.",
          ),
          tr(
            "The sprout grows from the tip of her ahoge. Ponytail on her right, hairclips on her left; red shoe on her right foot, blue on her left.",
          ),
          tr(
            "Update the “11” on her back each season. Do not add osu!, QQ or other trademark graphics.",
          ),
          tr(
            "She is an adult university student; keep all artwork suitable for all ages.",
          ),
        ],
      },
      {
        id: "credits",
        title: tr("Credits and licence"),
        paragraphs: [
          tr(
            "Designed by community member {designer} as a community proposal and later adopted as the official mascot. The artwork was made with AI assistance (Animagine XL 4.0, CreativeML Open RAIL++-M) and retouched afterwards.",
            { designer: LIRU_DESIGNER },
          ),
          [
            tr("The character sheets on this page are licensed under "),
            {
              label: "CC BY 4.0",
              href: "https://creativecommons.org/licenses/by/4.0/",
            },
            tr(
              ": anyone may share and adapt them, including commercially, as long as the designer is credited. Discussion: ",
            ),
            {
              label: "#334",
              href: "https://github.com/OCLR-dev/OCLR-website/issues/334",
            },
          ],
        ],
      },
    ],
  };
}

export function wikiHref(slug: string) {
  return slug === "introduction" ? "/wiki" : `/wiki/${slug}`;
}
