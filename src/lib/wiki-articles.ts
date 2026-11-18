import type { AppTranslator } from "@/i18n/translate";

// Plain text, or text mixed with links.
export type WikiText = string | (string | { label: string; href: string })[];

type WikiFigure = {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
};

type WikiCardRarity = "UR" | "SSR" | "SR" | "R";

export type WikiGalleryFigure = WikiFigure & {
  previewSrc: string;
  rarity: WikiCardRarity;
};

export type WikiArticle = {
  slug: string;
  title: string;
  category: string;
  intro?: string;
  sections: {
    id: string;
    title: string;
    paragraphs?: WikiText[];
    items?: string[];
    table?: { headers: string[]; rows: WikiText[][] };
    figures?: WikiFigure[];
  }[];
  gallery?: WikiGalleryFigure[];
  related?: { slug: string; title: string };
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
    liruGallery(tr),
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
    related: { slug: "liru-gallery", title: tr("Liru Gallery") },
    sections: [
      {
        id: "profile",
        title: tr("Profile"),
        paragraphs: [
          tr("Birthday: October 25"),
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

// Rarity is assigned per artwork and stays the same when the gallery shuffles.
const liruRarities: Partial<Record<string, WikiCardRarity>> = {
  "apricot-lantern": "SR",
  "berry-rose-side-bow": "SR",
  "black-rock": "SR",
  "blackberry-bow-dress": "SR",
  "blue-white-fairy-tale-dress": "SR",
  "burgundy-velvet-dress": "SSR",
  "butterfly-dream-fairy": "UR",
  "cherry-blossom-tea-party": "SR",
  "cream-cocoa-detective": "SR",
  "cream-petal-tea": "SR",
  "dreamy-wave-dress": "SSR",
  "elegant-maid": "SSR",
  "flower-mage": "SSR",
  "forest-green-detective": "SR",
  "forest-green-violinist": "SSR",
  "galaxy-dream": "UR",
  "gothic-lolita": "SSR",
  "indigo-moonlight-dress": "UR",
  "lavender-ballet-dress": "SR",
  "lavender-bridal": "UR",
  "lavender-gown": "SSR",
  "lavender-lolita": "SSR",
  "lavender-tea-caddy": "SR",
  "lemon-garden-dress": "SR",
  "light-armored-knight": "SSR",
  "midnight-moon-dress": "SR",
  "midnight-starflower-dress": "SR",
  "mint-lily-cape": "SR",
  "mint-windup-music-box": "SSR",
  "misty-lilac-bell-cape": "UR",
  "misty-moon-clutch": "SR",
  "moon-cat-cape": "SSR",
  "moonwhite-astrologer": "UR",
  "paper-butterfly-collection": "SR",
  "peach-embroidered-dress": "SR",
  "powder-blue-cape": "SR",
  "purple-punk": "SR",
  "rose-princess": "UR",
  "sea-mist-bottle": "SR",
  "sea-salt-shell-dress": "SR",
  "shrine-maiden": "SSR",
  "snow-bunny-cape": "SR",
  "sprout-fantasy-traveler": "SR",
  "star-candy-mage": "SSR",
  "star-music-box": "SSR",
  "starry-dream-dress": "SSR",
  "starry-evening-reader": "SR",
  "starry-night-gown": "UR",
  "strawberry-tea-party-dress": "SR",
  "wisteria-furisode": "UR",
  "wisteria-messenger": "SR",
};

function liruGallery(tr: AppTranslator): WikiArticle {
  const outfits = [
    [
      "elegant-maid",
      tr("Elegant maid outfit"),
      tr("Liru in a ruffled maid dress, holding a teacup on a tray"),
    ],
    [
      "purple-punk",
      tr("Purple punk streetwear"),
      tr("Liru in a leather jacket, purple plaid skirt and lace-up boots"),
    ],
    [
      "shrine-maiden",
      tr("Red and white shrine maiden outfit"),
      tr("Liru in white robes and red hakama, holding a paper streamer wand"),
    ],
    [
      "lavender-gown",
      tr("Lavender gown"),
      tr(
        "Liru in a floor-length lavender gown with lace and floral embroidery",
      ),
    ],
    [
      "sailor-uniform",
      tr("Sailor uniform"),
      tr("Liru smiles and waves in a navy and white sailor uniform"),
    ],
    [
      "gothic-lolita",
      tr("Gothic Lolita dress"),
      tr("Liru holds up the hem of a black lace dress with purple bows"),
    ],
    [
      "wisteria-furisode",
      tr("Wisteria-patterned furisode"),
      tr(
        "Liru holds out a long sleeve of her lavender wisteria-patterned kimono",
      ),
    ],
    [
      "cat-ear-dress",
      tr("Black and purple cat-ear dress"),
      tr(
        "Liru wears cat ears and a black and purple dress, raising her paw mittens",
      ),
    ],
    [
      "lavender-swimwear",
      tr("Lavender swimsuit"),
      tr("Liru waves in a lavender swimsuit with ruffles, bows and green trim"),
    ],
    [
      "lavender-lolita",
      tr("Lavender Lolita dress"),
      tr(
        "Liru holds out a cream lace skirt trimmed with lavender ribbons and floral embroidery",
      ),
    ],
    [
      "nun-habit",
      tr("Nun's habit"),
      tr("Liru waves in a black and white nun's habit while holding a book"),
    ],
    [
      "lavender-bridal",
      tr("Lavender-accented wedding gown"),
      tr(
        "Liru holds a bouquet in a white lace wedding gown with a lavender sash",
      ),
    ],
    [
      "black-rock",
      tr("Black rock outfit"),
      tr(
        "Liru wears a black leather jacket and pleated skirt with purple-striped socks and lace-up boots.",
      ),
    ],
    [
      "cream-knit",
      tr("Cream knit outfit"),
      tr(
        "Liru wears a cream cable-knit cardigan and sage green skirt, with a brown shoulder bag.",
      ),
    ],
    [
      "navy-academy",
      tr("Navy academy uniform"),
      tr(
        "Liru wears a navy blazer with gold buttons, a plaid skirt and black over-the-knee socks.",
      ),
    ],
    [
      "forest-green-dress",
      tr("Forest green dress"),
      tr(
        "Liru waves in a belted forest green dress with a cream lace collar and gold buttons.",
      ),
    ],
    [
      "citywear",
      tr("City outfit"),
      tr(
        "Liru wears a charcoal jacket, cream turtleneck and gray skirt, with a taupe shoulder bag.",
      ),
    ],
    [
      "burgundy-academy",
      tr("Burgundy academy outfit"),
      tr(
        "Liru wears a burgundy cardigan, plaid skirt and black tights, carrying a brown satchel.",
      ),
    ],
    [
      "lavender-knit",
      tr("Lavender knit set"),
      tr(
        "Liru wears a lavender cable-knit cardigan and matching skirt, with white tights and a round bag.",
      ),
    ],
    [
      "cream-academy",
      tr("Cream academy outfit"),
      tr(
        "Liru wears a cream blazer, green ribbon tie, pleated skirt and white tights.",
      ),
    ],
    [
      "powder-blue-cape",
      tr("Powder blue cape dress"),
      tr(
        "Liru lifts the hem of a powder blue dress with a short cape and white scalloped trim.",
      ),
    ],
    [
      "lavender-bow-academy",
      tr("Lavender bow academy outfit"),
      tr(
        "Liru wears a navy blazer with lavender piping, a matching bow and a purple plaid skirt.",
      ),
    ],
    [
      "sprout-fantasy-traveler",
      tr("Sprout and lavender fantasy traveler"),
      tr(
        "Liru wears a green cape embroidered with leaves and a layered purple skirt, with a brown satchel and lace-up boots.",
      ),
    ],
    [
      "spring-garden-dress",
      tr("Spring garden dress"),
      tr(
        "Liru carries a wicker basket in a cream dress with petal sleeves, a green sash and purple floral embroidery.",
      ),
    ],
    [
      "starry-night-gown",
      tr("Starry night gown"),
      tr(
        "Liru wears a deep purple gown with silver constellations and a cape fastened with a crescent moon.",
      ),
    ],
    [
      "light-armored-knight",
      tr("Light-armored knight"),
      tr(
        "Liru wears white and gold armor with a lavender cape and holds a round shield marked with a sprout.",
      ),
    ],
    [
      "lavender-nautical-outfit",
      tr("Lavender nautical outfit"),
      tr(
        "Liru waves in a white sailor-collar jacket and lavender skirt, wearing a compass pendant.",
      ),
    ],
    [
      "flower-mage",
      tr("Flower mage"),
      tr(
        "Liru wears a green cape embroidered with flowers and holds a wooden staff topped with a purple crystal.",
      ),
    ],
    [
      "dreamy-wave-dress",
      tr("Dreamy wave dress"),
      tr(
        "Liru wears a dress with layers of mint, blue and lavender ruffles and carries a shell-shaped bag.",
      ),
    ],
    [
      "butterfly-dream-fairy",
      tr("Butterfly dream fairy"),
      tr(
        "Liru has translucent butterfly wings and wears a pastel dress decorated with pearls and butterfly clasps.",
      ),
    ],
    [
      "galaxy-dream",
      tr("Galaxy dream"),
      tr(
        "Liru wears a star-embroidered gown with sheer lavender layers, with a small glowing star floating above her palm.",
      ),
    ],
    [
      "music-academy",
      tr("Music academy uniform"),
      tr(
        "Liru waves while holding a music notebook and wearing a lavender sweater vest, pleated skirt, and white tights.",
      ),
    ],
    [
      "snow-bunny-cape",
      tr("Snow bunny cape"),
      tr(
        "Liru wears a pale blue bunny-eared cape with cream trim and holds a white rabbit plush.",
      ),
    ],
    [
      "cherry-blossom-tea-party",
      tr("Cherry blossom tea party dress"),
      tr(
        "Liru holds a ribboned gift box and wears a cream dress with pink trim and cherry blossoms along the hem.",
      ),
    ],
    [
      "lily-of-the-valley-courier",
      tr("Lily of the valley courier"),
      tr(
        "Liru wears a green cape with a lily of the valley clasp and carries a sealed letter and a brown satchel.",
      ),
    ],
    [
      "cherry-milk-tea-uniform",
      tr("Cherry milk tea shop uniform"),
      tr(
        "Liru wears a brown shop uniform and a cream apron with a cherry pocket, and holds a matching cherry mug.",
      ),
    ],
    [
      "butter-yellow-raincoat",
      tr("Butter yellow raincoat"),
      tr(
        "Liru wears a yellow raincoat with a duck motif and blue rain boots, and holds a folded blue umbrella.",
      ),
    ],
    [
      "lemon-soda-dress",
      tr("Lemon soda dress"),
      tr(
        "Liru holds a bottle of lemon soda and wears a pale yellow dress with blue trim and lemon slices along the hem.",
      ),
    ],
    [
      "cloud-dream-pajamas",
      tr("Cloud dream pajamas"),
      tr(
        "Liru hugs a cloud pillow while wearing blue-purple pajamas patterned with clouds and stars and matching slippers.",
      ),
    ],
    [
      "honey-bear-outfit",
      tr("Honey bear outfit"),
      tr(
        "Liru wears a honey-yellow cardigan with bear-shaped pockets and carries a honey jar shoulder bag.",
      ),
    ],
    [
      "bunny-ear-hoodie",
      tr("Bunny ear hoodie"),
      tr(
        "Liru wears a cream hoodie with floppy bunny ears and a carrot zipper pull, paired with light blue shorts.",
      ),
    ],
    [
      "mint-cat-apron",
      tr("Mint cat apron"),
      tr(
        "Liru wears a mint-green apron with a cat-face pocket and a lavender bow over a cream blouse.",
      ),
    ],
    [
      "strawberry-cream-dress",
      tr("Strawberry cream dress"),
      tr(
        "Liru waves in a pink and cream dress with strawberry motifs and carries a strawberry-shaped bag.",
      ),
    ],
    [
      "rose-princess",
      tr("Rose princess"),
      tr(
        "Liru holds a pink rose and wears a layered rose-pink and cream gown with floral embroidery.",
      ),
    ],
    [
      "red-hood-picnic",
      tr("Red hood picnic"),
      tr(
        "Liru wears a red hooded cape with gold embroidery and carries a wicker picnic basket with a red apple.",
      ),
    ],
    [
      "blue-white-fairy-tale-dress",
      tr("Blue and white fairy tale dress"),
      tr(
        "Liru wears a blue dress with a white lace apron, holds a small brass key, and has a pocket watch at her waist.",
      ),
    ],
    [
      "rose-cookie-tea-party",
      tr("Rose cookie tea party"),
      tr(
        "Liru wears a dusty rose dress with cream trim and holds a round cookie tin decorated with a rose.",
      ),
    ],
    [
      "sea-salt-sailor-dress",
      tr("Sea salt sailor dress"),
      tr(
        "Liru wears a cream sailor dress with light blue trim and mint green tights, and carries a shell-shaped bag.",
      ),
    ],
    [
      "apricot-traveler",
      tr("Apricot traveler"),
      tr(
        "Liru waves in an apricot jacket with a paper plane patch and carries a small suitcase decorated with a purple flower.",
      ),
    ],
    [
      "peach-soda-dress",
      tr("Peach soda dress"),
      tr(
        "Liru holds a bottle of peach soda and wears a peach-pink dress with a cream bow and dusty blue tights.",
      ),
    ],
    [
      "matcha-bear-outfit",
      tr("Matcha bear outfit"),
      tr(
        "Liru hugs a teddy bear while wearing a matcha green toggle jacket, a cream skirt, and cocoa brown tights.",
      ),
    ],
    [
      "blueberry-cream-outfit",
      tr("Blueberry cream outfit"),
      tr(
        "Liru carries a jar with a blueberry motif that matches her cream blouse and wears a blue-violet skirt.",
      ),
    ],
    [
      "berry-tulip-bouquet",
      tr("Berry cardigan and tulips"),
      tr(
        "Liru wears a berry-purple cardigan over a cream pinafore and holds a bouquet of pink and purple tulips.",
      ),
    ],
    [
      "starry-dream-dress",
      tr("Starry dream dress"),
      tr(
        "Liru waves in a pale blue dress with stars along the hem and holds a crescent-shaped purse.",
      ),
    ],
    [
      "caramel-pudding-cook",
      tr("Caramel pudding cook"),
      tr(
        "Liru wears a caramel-colored apron and holds up a wooden spoon and a plate of caramel pudding.",
      ),
    ],
    [
      "lavender-library-outfit",
      tr("Lavender library outfit"),
      tr(
        "Liru wears a lavender sweater with a book emblem and a plaid skirt, and holds a book with a flower on the cover.",
      ),
    ],
    [
      "moon-cat-cape",
      tr("Moon cat cape"),
      tr(
        "Liru holds a sleeping white cat and wears a lavender cape with a crescent clasp and a skirt with a moon and cat motif.",
      ),
    ],
    [
      "berry-chocolate-outfit",
      tr("Berry chocolate outfit"),
      tr(
        "Liru waves in a berry-red cardigan with heart-shaped buttons and a chocolate brown pleated skirt.",
      ),
    ],
    [
      "peach-bow-outfit",
      tr("Peach bow outfit"),
      tr(
        "Liru wears a peach-pink jacket over a cream pleated skirt with a large two-tone bow at the waist.",
      ),
    ],
    [
      "star-candy-mage",
      tr("Star candy mage"),
      tr(
        "Liru wears a lilac cape with star charms and carries a star-tipped wand and a spellbook.",
      ),
    ],
    [
      "mint-lily-of-the-valley-dress",
      tr("Mint lily of the valley dress"),
      tr(
        "Liru wears a sleeveless mint green dress with a scalloped hem and holds a bouquet of white lily of the valley flowers.",
      ),
    ],
    [
      "paper-butterfly-collection",
      tr("Paper butterfly collection"),
      tr(
        "Liru wears an apricot pinafore with a butterfly on its pocket and holds a wooden frame displaying three paper butterflies.",
      ),
    ],
    [
      "milk-tea-violinist",
      tr("Milk tea violinist"),
      tr(
        "Liru holds a violin and wears a milk-tea brown vest and skirt with a burgundy ribbon at her collar.",
      ),
    ],
    [
      "blueberry-candy-shop",
      tr("Blueberry candy shop"),
      tr(
        "Liru wears a blue-violet dress and a cream apron with a blueberry motif, and holds a glass jar of wrapped candies.",
      ),
    ],
    [
      "peach-embroidered-dress",
      tr("Peach embroidered dress"),
      tr(
        "Liru holds an embroidery hoop with a peach-colored flower that matches the flowers on her dress.",
      ),
    ],
    [
      "mint-paper-pinwheel",
      tr("Mint paper pinwheel"),
      tr(
        "Liru wears a mint and cream dress, holds a paper pinwheel, and carries a crossbody bag with a matching pinwheel motif.",
      ),
    ],
    [
      "cream-cocoa-detective",
      tr("Cream and cocoa detective"),
      tr(
        "Liru wears a cream cape over a cocoa brown plaid dress and carries a magnifying glass and a notebook with a gold sprout on the cover.",
      ),
    ],
    [
      "star-music-box",
      tr("Star music box"),
      tr(
        "Liru wears a dusty blue dress with gold stars along the hem and holds an open wooden music box with a purple star inside.",
      ),
    ],
    [
      "lemon-garden-dress",
      tr("Lemon garden dress"),
      tr(
        "Liru wears a pale yellow dress with a green sash and carries a wicker basket with white blossoms and a lemon.",
      ),
    ],
    [
      "cherry-red-painter",
      tr("Cherry red painter"),
      tr(
        "Liru wears a cherry red apron with a cherry motif on its pocket and holds a paintbrush and a wooden palette.",
      ),
    ],
    [
      "mint-lily-cape",
      tr("Mint lily cape"),
      tr(
        "Liru wears a mint cape over a cream dress and holds a bouquet of lily of the valley flowers.",
      ),
    ],
    [
      "blackberry-bow-dress",
      tr("Blackberry bow dress"),
      tr(
        "Liru wears a blackberry purple dress with a pink bow and carries a matching handbag.",
      ),
    ],
    [
      "midnight-moon-dress",
      tr("Midnight moon dress"),
      tr(
        "Liru wears a midnight blue dress with crescent decorations and holds a silver moon clasp purse.",
      ),
    ],
    [
      "peach-painter",
      tr("Peach painter"),
      tr(
        "Liru wears a peach apron dress and holds a paintbrush and a pastel palette.",
      ),
    ],
    [
      "slate-academy-shorts",
      tr("Slate academy outfit"),
      tr(
        "Liru wears a slate blue blazer, cream shorts and white socks while holding a book with a sprout on its cover.",
      ),
    ],
    [
      "cream-blossom-dress",
      tr("Cream blossom dress"),
      tr(
        "Liru wears a cream dress with pink trim and carries a blossom handbag with a pearl handle.",
      ),
    ],
    [
      "paper-boat-sailor",
      tr("Paper boat sailor"),
      tr(
        "Liru wears a sailor blouse and navy skirt, holding a folded paper boat in one hand.",
      ),
    ],
    [
      "mint-argyle-academy",
      tr("Mint argyle academy"),
      tr(
        "Liru waves while wearing a mint argyle vest, dark green shorts and ivory ribbed socks.",
      ),
    ],
    [
      "berry-acorn-cape",
      tr("Berry acorn cape"),
      tr(
        "Liru wears a berry red cape fastened with an acorn clasp over a belted cream dress.",
      ),
    ],
    [
      "misty-moon-clutch",
      tr("Misty blue moon dress"),
      tr(
        "Liru wears a misty blue dress with star and moon details and holds a silver crescent purse.",
      ),
    ],
    [
      "berry-knit-shorts",
      tr("Berry knit casual outfit"),
      tr(
        "Liru makes a peace sign while wearing a berry purple sweater, cream shorts and matching ribbed socks.",
      ),
    ],
    [
      "cherry-academy-blazer",
      tr("Cherry academy blazer"),
      tr(
        "Liru wears a cherry red blazer with a lavender bow and holds a cream book against her pleated skirt.",
      ),
    ],
    [
      "sea-mist-bottle",
      tr("Sea mist collector"),
      tr(
        "Liru wears a pale blue cape over a navy dress and holds a glass bottle containing a seashell.",
      ),
    ],
    [
      "cream-petal-tea",
      tr("Cream petal tea dress"),
      tr(
        "Liru holds a floral teacup while wearing a cream petal skirt with a powder blue underskirt and sash.",
      ),
    ],
    [
      "cherry-newspaper",
      tr("Cherry newspaper outfit"),
      tr(
        "Liru carries a rolled newspaper and wears a cherry red shirt with brown pleated shorts.",
      ),
    ],
    [
      "berry-knit-bunny",
      tr("Berry knit bunny"),
      tr(
        "Liru hugs a cream rabbit plush while wearing a berry purple knitted vest and cropped cream trousers.",
      ),
    ],
    [
      "apricot-lantern",
      tr("Apricot lantern traveler"),
      tr(
        "Liru wears an apricot jacket over a cream dress and carries a brass lantern.",
      ),
    ],
    [
      "mint-ice-cream",
      tr("Mint ice cream dress"),
      tr(
        "Liru holds an ice cream cone and wears a mint dress with a scalloped hem and an ice cream pocket motif.",
      ),
    ],
    [
      "wisteria-messenger",
      tr("Wisteria messenger"),
      tr(
        "Liru holds a sealed envelope and wears a lavender dress with a cream cape and a wisteria messenger bag.",
      ),
    ],
    [
      "honey-lemon-picnic",
      tr("Honey lemon picnic"),
      tr(
        "Liru waves in a yellow gingham dress while carrying a wicker basket filled with lemons.",
      ),
    ],
    [
      "powder-blue-pottery",
      tr("Powder blue pottery outfit"),
      tr(
        "Liru wears a powder blue romper with a cream apron and holds a seafoam green cup with a white flower.",
      ),
    ],
    [
      "moonwhite-astrologer",
      tr("Moonwhite astrologer"),
      tr(
        "Liru holds a golden astrolabe and wears a moonwhite robe with gold stars over a lavender dress.",
      ),
    ],
    [
      "berry-rose-side-bow",
      tr("Berry rose side-bow dress"),
      tr(
        "Liru wears a berry rose dress with a cream side bow and carries a flower-shaped handbag.",
      ),
    ],
    [
      "cream-tulip-gardener",
      tr("Cream tulip gardener"),
      tr(
        "Liru wears cream short overalls over a green shirt and holds a pink tulip and watering can.",
      ),
    ],
    [
      "starry-evening-reader",
      tr("Starry evening reader"),
      tr(
        "Liru wears a star blue shirt dress and carries a star-shaped lantern and a book with a crescent moon.",
      ),
    ],
    [
      "strawberry-cream-baker",
      tr("Strawberry cream baker"),
      tr(
        "Liru wears a pink dress with a cream strawberry apron and presents a slice of strawberry cream cake.",
      ),
    ],
    [
      "matcha-camera-traveler",
      tr("Matcha camera traveler"),
      tr(
        "Liru wears a matcha green jacket with cream shorts and carries a camera on a neck strap.",
      ),
    ],
    [
      "sea-salt-summer",
      tr("Sea salt summer outfit"),
      tr(
        "Liru wears a sea salt blue sleeveless top and a long cream skirt, carrying a round woven handbag.",
      ),
    ],
    [
      "caramel-pinafore-scholar",
      tr("Caramel pinafore scholar"),
      tr(
        "Liru wears round glasses and a caramel pinafore over a cream blouse, holding a book with a golden leaf design.",
      ),
    ],
    [
      "pastel-tennis",
      tr("Pastel tennis outfit"),
      tr(
        "Liru wears a pink polo shirt and cream pleated skirt while holding a tennis ball and a mint green racket.",
      ),
    ],
    [
      "lavender-ballet-dress",
      tr("Lavender ballet dress"),
      tr(
        "Liru waves in a lavender ballet-inspired dress with a cream waist bow and a layered tulle skirt.",
      ),
    ],
    [
      "cherry-denim",
      tr("Cherry denim day"),
      tr(
        "Liru wears a red shirt and denim short overalls with a cherry pocket motif, holding a cream instant camera.",
      ),
    ],
    [
      "cream-knit-fox",
      tr("Cream knit fox"),
      tr(
        "Liru wears a cream cable-knit dress and brown ankle boots while hugging a small fox plush.",
      ),
    ],
    [
      "forest-green-violinist",
      tr("Forest green violinist"),
      tr(
        "Liru wears a forest green dress with a cream bow and holds a violin and bow.",
      ),
    ],
    [
      "cream-berry-messenger",
      tr("Cream and berry blue messenger"),
      tr(
        "Liru holds a sealed letter and carries a cream and berry blue messenger bag.",
      ),
    ],
    [
      "apricot-marigold-gardener",
      tr("Apricot marigold gardener"),
      tr(
        "Liru wears apricot overalls and green boots while holding a potted marigold.",
      ),
    ],
    [
      "berry-vintage-photographer",
      tr("Berry red vintage photographer"),
      tr("Liru wears a berry red corduroy jacket and holds a vintage camera."),
    ],
    [
      "sea-salt-shell-dress",
      tr("Sea salt shell dress"),
      tr(
        "Liru waves in a sea salt blue dress and carries a shell-shaped handbag with a pearl handle.",
      ),
    ],
    [
      "lavender-tea-caddy",
      tr("Lavender tea caddy"),
      tr(
        "Liru wears a cream top with lavender frog closures and holds a tea caddy with a lavender motif.",
      ),
    ],
    [
      "midnight-starflower-dress",
      tr("Midnight starflower dress"),
      tr(
        "Liru waves in a midnight blue dress with pale starflowers and carries a matching round handbag.",
      ),
    ],
    [
      "cream-plaid-traveler",
      tr("Cream plaid traveler"),
      tr(
        "Liru reads a map while wearing a cream plaid cape with an acorn clasp.",
      ),
    ],
    [
      "butterfly-hoop-embroidery",
      tr("Butterfly hoop embroidery"),
      tr(
        "Liru wears a peach dress and cream apron and holds an embroidery hoop with a purple butterfly.",
      ),
    ],
    [
      "burgundy-velvet-dress",
      tr("Burgundy velvet dress"),
      tr(
        "Liru wears a burgundy velvet dress with a black belt and holds a cream clutch.",
      ),
    ],
    [
      "mist-blue-bow-umbrella",
      tr("Misty blue bow and umbrella"),
      tr(
        "Liru wears a misty blue jacket with a cream bow and holds a folded umbrella.",
      ),
    ],
    [
      "cream-daisy-pinafore",
      tr("Cream daisy pinafore"),
      tr(
        "Liru holds a daisy bouquet in a cream pinafore with daisy embroidery and a sage blouse.",
      ),
    ],
    [
      "cocoa-rose-bookshop",
      tr("Cocoa rose bookshop"),
      tr(
        "Liru adjusts her round glasses and holds two books, wearing a cocoa brown pinafore over a rose blouse.",
      ),
    ],
    [
      "mint-windup-music-box",
      tr("Mint windup music box"),
      tr(
        "Liru wears a mint dress trimmed with music notes and holds a windup music box.",
      ),
    ],
    [
      "cherry-soda-sailor",
      tr("Cherry soda sailor"),
      tr(
        "Liru makes a peace sign in a cherry-trimmed sailor dress and holds a bottle of pink soda.",
      ),
    ],
    [
      "misty-lilac-bell-cape",
      tr("Misty lilac bell cape"),
      tr(
        "Liru wears a misty lilac cape with gold bells at its bow and carries a ribbon-tied scroll.",
      ),
    ],
    [
      "forest-green-detective",
      tr("Forest green detective"),
      tr(
        "Liru wears a forest green belted coat and carries a magnifying glass and a notebook.",
      ),
    ],
    [
      "honey-apricot-bow-dress",
      tr("Honey apricot bow dress"),
      tr(
        "Liru wears a honey apricot dress with a large bow and carries a heart-shaped handbag.",
      ),
    ],
    [
      "indigo-moonlight-dress",
      tr("Indigo moonlight dress"),
      tr(
        "Liru waves in an indigo dress with silver stars and holds a book decorated with a crescent moon.",
      ),
    ],
    [
      "strawberry-tea-party-dress",
      tr("Strawberry tea party dress"),
      tr(
        "Liru holds a strawberry teacup and saucer while wearing a cream tiered dress with berry embroidery.",
      ),
    ],
    [
      "rose-milk-tea-academy",
      tr("Rose milk tea academy outfit"),
      tr(
        "Liru wears a rose pink toggle jacket and carries a takeaway cup and a brown handbag.",
      ),
    ],
  ];
  return {
    slug: "liru-gallery",
    title: tr("Liru Gallery"),
    category: tr("Community"),
    sections: [],
    gallery: outfits.map(([id, caption, alt]) => ({
      src: `/mascot/liru/gallery/${id}.webp`,
      previewSrc: `/mascot/liru/gallery/${id}-640.webp`,
      width: 1024,
      height: 1536,
      rarity: liruRarities[id] ?? "R",
      alt,
      caption,
    })),
  };
}

export function wikiHref(slug: string) {
  return slug === "introduction" ? "/wiki" : `/wiki/${slug}`;
}
