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
  related?: { href: string; title: string };
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
    related: { href: "/gallery", title: tr("Liru Gallery") },
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
  "arcade-streetwear": "R",
  "baseball-fielding": "R",
  "berry-rose-side-bow": "SR",
  "black-rock": "SR",
  "blackberry-bow-dress": "SR",
  "blue-white-fairy-tale-dress": "SR",
  bookbinding: "SR",
  "bubble-walk": "R",
  "burgundy-velvet-dress": "SSR",
  "butterfly-dream-fairy": "UR",
  "candy-balloon": "SR",
  "caramel-pudding": "R",
  "cello-tuning": "SR",
  "cherry-blossom-tea-party": "SR",
  "circus-juggler": "SSR",
  "color-cube": "R",
  "cotton-candy-taste": "R",
  "cream-cocoa-detective": "SR",
  "cream-petal-tea": "SR",
  "dreamy-wave-dress": "SSR",
  "duck-windup": "SR",
  "elegant-maid": "SSR",
  "fern-gardener": "R",
  "flower-mage": "SSR",
  "flower-ribbon": "SR",
  "forest-green-detective": "SR",
  "forest-green-violinist": "SSR",
  "fossil-researcher": "SR",
  "frame-drum": "SSR",
  "galaxy-dream": "UR",
  "gothic-lolita": "SSR",
  "grape-bunny-bag": "R",
  "ice-skates": "SR",
  "indigo-moonlight-dress": "UR",
  "jazz-conductor": "UR",
  "jellyfish-dancer": "UR",
  "kite-reel": "R",
  "lantern-festival": "UR",
  "late-night-radio": "R",
  "lavender-ballet-dress": "SR",
  "lavender-bridal": "UR",
  "lavender-gown": "SSR",
  "lavender-lolita": "SSR",
  "lavender-tea-caddy": "SR",
  "lemon-garden-dress": "SR",
  "lemon-piping": "SR",
  "light-armored-knight": "SSR",
  "midnight-moon-dress": "SR",
  "midnight-starflower-dress": "SR",
  "mint-bunny-picnic": "SR",
  "mint-carousel-dress": "SR",
  "mint-lily-cape": "SR",
  "mint-windup-music-box": "SSR",
  "misty-lilac-bell-cape": "UR",
  "misty-moon-clutch": "SR",
  "moon-cat-cape": "SSR",
  "moonlight-gala": "SSR",
  "moonwhite-astrologer": "UR",
  "morning-yoga": "R",
  "night-train": "SSR",
  "origami-swallow": "R",
  "paper-butterfly-collection": "SR",
  "patchwork-tailor": "SR",
  "peach-carousel-dress": "SR",
  "peach-embroidered-dress": "SR",
  "peach-kitten": "SSR",
  "pinwheel-festival": "R",
  "plum-knit-campus": "R",
  "pool-chalk": "SR",
  "pottery-wheel": "R",
  "powder-blue-cape": "SR",
  "purple-punk": "SR",
  "rose-princess": "UR",
  "sea-mist-bottle": "SR",
  "sea-salt-shell-dress": "SR",
  seaglass: "R",
  "shadow-puppet": "UR",
  "shrine-maiden": "SSR",
  "snow-bunny-cape": "SR",
  "snow-post": "SR",
  "spring-embroidered-maxi-dress": "SSR",
  "sprout-fantasy-traveler": "SR",
  "stained-glass": "SSR",
  "star-candy-mage": "SSR",
  "star-music-box": "SSR",
  "star-note-academy": "UR",
  "starry-dream-dress": "SSR",
  "starry-evening-reader": "SR",
  "starry-night-gown": "UR",
  "starry-pajamas": "R",
  "steam-workshop": "SSR",
  "strawberry-cream-cafe": "SSR",
  "strawberry-heart": "SSR",
  "strawberry-tea-party-dress": "SR",
  "street-photographer": "SR",
  "sunset-astronaut": "UR",
  "surf-wax": "R",
  tarot: "UR",
  "teddy-greeting": "R",
  typewriter: "SR",
  "vinyl-dj": "SSR",
  "violet-carousel-dress": "SR",
  "wicker-weaver": "R",
  "wisteria-furisode": "UR",
  "wisteria-messenger": "SR",
  "woodland-birdcare": "SR",
  accordion: "SR",
  badminton: "R",
  baker: "R",
  bouldering: "R",
  camellia: "SSR",
  chess: "SR",
  cyanotype: "SR",
  equestrian: "SR",
  marine: "R",
  matcha: "SSR",
  mime: "R",
  raincoat: "R",
  roller: "SR",
  stargazer: "SSR",
  "lolita-steampunk": "SSR",
  "lolita-antique-doll": "SR",
  "lolita-desert-princess": "SSR",
  "lolita-blue-porcelain": "SSR",
  "lolita-rose-knight": "SSR",
  "lolita-magic-librarian": "SSR",
  "lolita-moon-vampire": "SSR",
  "lolita-vintage-detective": "SR",
  "lolita-candy-witch": "SR",
  "lolita-deep-sea-mermaid": "UR",
  "lolita-circus": "SSR",
  "lolita-astrologer": "SSR",
  "lolita-military": "SR",
  "peony-stage-dress": "SSR",
  "starlight-crystal-gown": "UR",
  "arcade-techwear": "R",
  "jade-blossom-cape": "UR",
  "campus-knit-notebook": "R",
  "lolita-gothic-rose": "SSR",
  "bamboo-fan-hanfu": "SR",
  "lolita-strawberry-sweet": "SR",
  "lolita-maple-kimono": "SR",
  "lolita-snow-queen": "UR",
  "lolita-forest-lily": "SR",
  "lolita-sailor-shell": "SR",
  "lolita-court-blue-rose": "SSR",
  "lolita-classic-rose": "SR",
  "lolita-daisy-gingham": "R",
  "lolita-mint-tie-sailor": "R",
  "lolita-pink-bow-pinafore": "R",
  "lolita-monochrome-gothic": "R",
  "lolita-burgundy-bow-academy": "R",
  "lolita-sage-pocket-dress": "R",
  "lolita-opera-phantom": "SSR",
  "lolita-spring-flower-goddess": "UR",
  "lolita-rose-music-box": "SSR",
};

export function liruGallery(tr: AppTranslator): {
  title: string;
  gallery: WikiGalleryFigure[];
  collection: WikiGalleryFigure[];
} {
  type Outfit = [id: string, caption: string, alt: string];
  const outfits: Outfit[] = [
    [
      "elegant-maid",
      tr("Elegant maid outfit"),
      tr("Liru carries a teacup in a ruffled maid dress."),
    ],
    [
      "purple-punk",
      tr("Purple punk"),
      tr("Liru wears a leather jacket and purple plaid skirt."),
    ],
    [
      "shrine-maiden",
      tr("Red and white shrine maiden"),
      tr("Liru holds a paper wand in red and white shrine attire."),
    ],
    [
      "lavender-gown",
      tr("Lavender gown"),
      tr("Liru wears an embroidered lavender gown."),
    ],
    [
      "sailor-uniform",
      tr("Sailor uniform"),
      tr("Liru waves in a navy sailor uniform."),
    ],
    [
      "gothic-lolita",
      tr("Gothic Lolita dress"),
      tr("Liru lifts a black lace skirt with purple bows."),
    ],
    [
      "wisteria-furisode",
      tr("Wisteria furisode"),
      tr("Liru spreads the long sleeves of a wisteria kimono."),
    ],
    [
      "cat-ear-dress",
      tr("Cat-ear dress"),
      tr("Liru wears cat ears and raises a paw glove."),
    ],
    [
      "lavender-swimwear",
      tr("Lavender swimsuit"),
      tr("Liru waves in a ruffled lavender swimsuit."),
    ],
    [
      "lavender-lolita",
      tr("Lavender Lolita dress"),
      tr("Liru lifts her lace skirt trimmed with lavender ribbons."),
    ],
    [
      "nun-habit",
      tr("Nun's habit"),
      tr("Liru waves with a book in black and white nun’s attire."),
    ],
    [
      "lavender-bridal",
      tr("Lavender wedding gown"),
      tr("Liru carries a bouquet in a wedding dress with a lavender sash."),
    ],
    [
      "black-rock",
      tr("Black rock outfit"),
      tr("Liru wears a black leather jacket and purple striped socks."),
    ],
    [
      "cream-knit",
      tr("Cream knit"),
      tr("Liru wears a cream cardigan and sage skirt."),
    ],
    [
      "navy-academy",
      tr("Navy academy uniform"),
      tr(
        "Liru wears a navy school blazer with gold buttons and a plaid skirt.",
      ),
    ],
    [
      "forest-green-dress",
      tr("Forest green dress"),
      tr("Liru waves in a forest green dress with a lace collar."),
    ],
    [
      "citywear",
      tr("City outfit"),
      tr("Liru wears a charcoal coat and carries a taupe shoulder bag."),
    ],
    [
      "burgundy-academy",
      tr("Burgundy academy outfit"),
      tr("Liru carries a satchel in a burgundy cardigan."),
    ],
    [
      "lavender-knit",
      tr("Lavender knit set"),
      tr("Liru carries a round bag in a lavender knit set."),
    ],
    [
      "cream-academy",
      tr("Cream academy outfit"),
      tr("Liru wears a cream school uniform with a green bow."),
    ],
    [
      "powder-blue-cape",
      tr("Powder blue cape dress"),
      tr("Liru lifts her powder blue dress with white scalloped trim."),
    ],
    [
      "lavender-bow-academy",
      tr("Lavender bow uniform"),
      tr("Liru wears a navy uniform with a lavender bow."),
    ],
    [
      "sprout-fantasy-traveler",
      tr("Sprout traveler"),
      tr("Liru carries a travel satchel in a green leaf-patterned cape."),
    ],
    [
      "spring-garden-dress",
      tr("Spring garden dress"),
      tr("Liru carries a wicker basket in an embroidered dress."),
    ],
    [
      "starry-night-gown",
      tr("Starry night gown"),
      tr("Liru wears a purple constellation gown with a crescent clasp."),
    ],
    [
      "light-armored-knight",
      tr("Light-armored knight"),
      tr("Liru wears white and gold armor and holds a sprout-emblem shield."),
    ],
    [
      "lavender-nautical-outfit",
      tr("Lavender nautical outfit"),
      tr("Liru waves in a lavender sailor outfit with a compass pendant."),
    ],
    [
      "flower-mage",
      tr("Flower mage"),
      tr("Liru holds a crystal-tipped staff in a flower-embroidered cape."),
    ],
    [
      "dreamy-wave-dress",
      tr("Dreamy wave dress"),
      tr("Liru carries a shell bag in a layered sea-colored dress."),
    ],
    [
      "butterfly-dream-fairy",
      tr("Butterfly dream fairy"),
      tr("Liru spreads translucent butterfly wings in a pearl-trimmed dress."),
    ],
    [
      "galaxy-dream",
      tr("Galaxy dream"),
      tr(
        "Liru wears a lavender star-print gown with a star floating above her palm.",
      ),
    ],
    [
      "music-academy",
      tr("Music academy uniform"),
      tr("Liru waves with a music book in a lavender school uniform."),
    ],
    [
      "snow-bunny-cape",
      tr("Snow bunny cape"),
      tr("Liru hugs a white rabbit plush in a pale blue bunny-ear cape."),
    ],
    [
      "cherry-blossom-tea-party",
      tr("Cherry blossom tea dress"),
      tr("Liru holds a ribbon-tied gift in a cherry blossom dress."),
    ],
    [
      "lily-of-the-valley-courier",
      tr("Lily courier"),
      tr(
        "Liru holds a wax-sealed letter and wears a lily-of-the-valley clasp.",
      ),
    ],
    [
      "cherry-milk-tea-uniform",
      tr("Cherry milk tea server"),
      tr("Liru holds a cherry mug in a matching apron."),
    ],
    [
      "butter-yellow-raincoat",
      tr("Butter yellow raincoat"),
      tr("Liru carries a blue umbrella in a yellow duck-patterned raincoat."),
    ],
    [
      "lemon-soda-dress",
      tr("Lemon soda dress"),
      tr("Liru holds a lemon soda in a pale yellow dress."),
    ],
    [
      "cloud-dream-pajamas",
      tr("Cloud dream pajamas"),
      tr("Liru hugs a cloud pillow in blue-purple pajamas."),
    ],
    [
      "honey-bear-outfit",
      tr("Honey bear outfit"),
      tr("Liru wears a bear-themed cardigan and carries a honey-pot bag."),
    ],
    [
      "bunny-ear-hoodie",
      tr("Bunny ear hoodie"),
      tr("Liru wears a bunny-ear hoodie with a carrot zipper charm."),
    ],
    [
      "mint-cat-apron",
      tr("Mint cat apron"),
      tr("Liru wears a mint apron with a cat-face pocket."),
    ],
    [
      "strawberry-cream-dress",
      tr("Strawberry cream dress"),
      tr("Liru waves in a pink and white dress with a strawberry bag."),
    ],
    [
      "rose-princess",
      tr("Rose princess"),
      tr("Liru holds a pink rose in a rose-embroidered gown."),
    ],
    [
      "red-hood-picnic",
      tr("Red hood picnic"),
      tr("Liru wears a red hood and carries a wicker basket with an apple."),
    ],
    [
      "blue-white-fairy-tale-dress",
      tr("Blue fairy tale dress"),
      tr("Liru holds a brass key in a blue and white dress."),
    ],
    [
      "rose-cookie-tea-party",
      tr("Rose cookie tea party"),
      tr("Liru holds a rose-patterned cookie tin in a dusty pink dress."),
    ],
    [
      "sea-salt-sailor-dress",
      tr("Sea salt sailor dress"),
      tr("Liru carries a shell bag in a white sailor dress with blue trim."),
    ],
    [
      "apricot-traveler",
      tr("Apricot traveler"),
      tr("Liru carries a flower-patterned suitcase in an apricot jacket."),
    ],
    [
      "peach-soda-dress",
      tr("Peach soda dress"),
      tr("Liru holds a peach soda in a peach-pink dress."),
    ],
    [
      "matcha-bear-outfit",
      tr("Matcha bear outfit"),
      tr("Liru hugs a teddy bear in a matcha green toggle coat."),
    ],
    [
      "blueberry-cream-outfit",
      tr("Blueberry cream outfit"),
      tr("Liru wears a blueberry-patterned top and holds a matching jar."),
    ],
    [
      "berry-tulip-bouquet",
      tr("Berry tulips"),
      tr("Liru holds tulips in a berry-purple cardigan."),
    ],
    [
      "starry-dream-dress",
      tr("Starry dream dress"),
      tr("Liru waves in a star-patterned blue dress with a crescent bag."),
    ],
    [
      "caramel-pudding-cook",
      tr("Caramel pudding cook"),
      tr("Liru holds a wooden spoon and a plate of caramel pudding."),
    ],
    [
      "lavender-library-outfit",
      tr("Lavender library outfit"),
      tr(
        "Liru holds a book with a flower on its cover, wearing a lavender sweater.",
      ),
    ],
    [
      "moon-cat-cape",
      tr("Moon cat cape"),
      tr(
        "Liru cradles a sleeping white cat in a lilac cape with a crescent clasp.",
      ),
    ],
    [
      "berry-chocolate-outfit",
      tr("Berry and chocolate"),
      tr("Liru waves in a berry red cardigan and chocolate skirt."),
    ],
    [
      "peach-bow-outfit",
      tr("Peach bow outfit"),
      tr("Liru wears a peach jacket and a two-tone bow at her waist."),
    ],
    [
      "star-candy-mage",
      tr("Star candy mage"),
      tr("Liru holds a star wand and spellbook in a lilac cape."),
    ],
    [
      "mint-lily-of-the-valley-dress",
      tr("Mint lily dress"),
      tr("Liru holds lilies of the valley in a sleeveless mint dress."),
    ],
    [
      "paper-butterfly-collection",
      tr("Framed paper butterflies"),
      tr("Liru holds framed paper butterflies in an apricot pinafore."),
    ],
    [
      "milk-tea-violinist",
      tr("Milk tea violinist"),
      tr("Liru holds a violin in a milky brown vest and skirt."),
    ],
    [
      "blueberry-candy-shop",
      tr("Blueberry candy shop"),
      tr("Liru holds a jar of colorful candies in a blueberry apron."),
    ],
    [
      "peach-embroidered-dress",
      tr("Peach embroidered dress"),
      tr("Liru holds an embroidery hoop with flowers matching her skirt."),
    ],
    [
      "mint-paper-pinwheel",
      tr("Mint paper pinwheel"),
      tr("Liru holds up a paper pinwheel in a mint green dress."),
    ],
    [
      "cream-cocoa-detective",
      tr("Cocoa detective"),
      tr("Liru holds a magnifying glass and notebook in a cream cape."),
    ],
    [
      "star-music-box",
      tr("Star music box"),
      tr("Liru holds an open wooden music box with a purple star inside."),
    ],
    [
      "lemon-garden-dress",
      tr("Lemon garden dress"),
      tr("Liru carries a wicker basket of lemons in a pale yellow dress."),
    ],
    [
      "cherry-red-painter",
      tr("Cherry red painter"),
      tr("Liru holds a brush and palette in a cherry red apron."),
    ],
    [
      "mint-lily-cape",
      tr("Mint lily cape"),
      tr("Liru holds lilies of the valley in a mint shawl."),
    ],
    [
      "blackberry-bow-dress",
      tr("Blackberry bow dress"),
      tr("Liru carries a matching bag in a blackberry dress with a pink bow."),
    ],
    [
      "midnight-moon-dress",
      tr("Midnight crescent dress"),
      tr(
        "Liru wears a midnight blue crescent dress and carries a silver-clasp bag.",
      ),
    ],
    [
      "peach-painter",
      tr("Peach painter"),
      tr("Liru holds a brush and pastel palette in a peach apron."),
    ],
    [
      "slate-academy-shorts",
      tr("Slate academy shorts"),
      tr(
        "Liru holds a book with a sprout on its cover, wearing a slate blue blazer.",
      ),
    ],
    [
      "cream-blossom-dress",
      tr("Cream blossom dress"),
      tr("Liru carries a floral bag with a pearl handle in a cream dress."),
    ],
    [
      "paper-boat-sailor",
      tr("Paper boat sailor"),
      tr("Liru holds a paper boat in a navy sailor outfit."),
    ],
    [
      "mint-argyle-academy",
      tr("Mint argyle academy"),
      tr("Liru waves in a mint argyle vest."),
    ],
    [
      "berry-acorn-cape",
      tr("Berry acorn cape"),
      tr("Liru wears a berry red cape with an acorn clasp."),
    ],
    [
      "misty-moon-clutch",
      tr("Misty blue moon dress"),
      tr("Liru holds a silver crescent bag in a mist blue celestial dress."),
    ],
    [
      "berry-knit-shorts",
      tr("Berry knit casual outfit"),
      tr("Liru makes a peace sign in a berry sweater and cream shorts."),
    ],
    [
      "cherry-academy-blazer",
      tr("Cherry blazer"),
      tr("Liru holds a cream-colored book in a cherry red blazer."),
    ],
    [
      "sea-mist-bottle",
      tr("Sea mist bottle"),
      tr("Liru holds a jar of seashells in a pale blue cape."),
    ],
    [
      "cream-petal-tea",
      tr("Cream petal tea dress"),
      tr("Liru holds a flower teacup in a cream petal skirt."),
    ],
    [
      "cherry-newspaper",
      tr("Cherry newspaper outfit"),
      tr("Liru holds a rolled newspaper in a cherry red shirt."),
    ],
    [
      "berry-knit-bunny",
      tr("Berry knit and bunny"),
      tr("Liru hugs a white rabbit plush in a berry knit vest."),
    ],
    [
      "apricot-lantern",
      tr("Apricot lantern traveler"),
      tr("Liru carries a brass lantern in an apricot coat."),
    ],
    [
      "mint-ice-cream",
      tr("Mint ice cream dress"),
      tr("Liru holds an ice cream cone in a mint green dress."),
    ],
    [
      "wisteria-messenger",
      tr("Wisteria messenger"),
      tr("Liru holds a sealed letter and carries a wisteria messenger bag."),
    ],
    [
      "honey-lemon-picnic",
      tr("Honey lemon picnic"),
      tr("Liru waves with a basket of lemons in a yellow gingham dress."),
    ],
    [
      "powder-blue-pottery",
      tr("Powder blue potter"),
      tr("Liru holds a seafoam floral cup in a powder blue romper."),
    ],
    [
      "moonwhite-astrologer",
      tr("Moonwhite astrologer"),
      tr("Liru holds a golden astrolabe in a star-embroidered robe."),
    ],
    [
      "berry-rose-side-bow",
      tr("Berry rose bow dress"),
      tr("Liru wears a berry rose dress with a cream bow at her hip."),
    ],
    [
      "cream-tulip-gardener",
      tr("Tulip gardener"),
      tr("Liru holds pink tulips and a watering can in cream overalls."),
    ],
    [
      "starry-evening-reader",
      tr("Starry evening reading"),
      tr("Liru holds a star lantern and a book in a star-blue dress."),
    ],
    [
      "strawberry-cream-baker",
      tr("Strawberry cream baker"),
      tr("Liru carries strawberry shortcake in a strawberry apron."),
    ],
    [
      "matcha-camera-traveler",
      tr("Matcha camera traveler"),
      tr("Liru wears a matcha green jacket with a camera around her neck."),
    ],
    [
      "sea-salt-summer",
      tr("Sea salt summer outfit"),
      tr("Liru carries a round woven bag in a sea-salt blue top."),
    ],
    [
      "caramel-pinafore-scholar",
      tr("Caramel pinafore"),
      tr(
        "Liru wears round glasses and holds a book with a gold leaf on its cover.",
      ),
    ],
    [
      "pastel-tennis",
      tr("Pastel tennis outfit"),
      tr("Liru holds a tennis ball and mint racket in a pink polo."),
    ],
    [
      "lavender-ballet-dress",
      tr("Lavender ballet dress"),
      tr("Liru waves in a lavender tulle ballet dress."),
    ],
    [
      "cherry-denim",
      tr("Cherry denim day"),
      tr(
        "Liru holds an instant camera in denim overalls with a cherry pocket.",
      ),
    ],
    [
      "cream-knit-fox",
      tr("Cream knit and fox"),
      tr("Liru hugs a fox plush in a cream knit dress."),
    ],
    [
      "forest-green-violinist",
      tr("Forest green violinist"),
      tr("Liru holds a violin and bow in a forest green dress."),
    ],
    [
      "cream-berry-messenger",
      tr("Cream and blue messenger"),
      tr(
        "Liru holds an envelope and carries a cream and blueberry messenger bag.",
      ),
    ],
    [
      "apricot-marigold-gardener",
      tr("Apricot marigold gardener"),
      tr("Liru holds a potted marigold in apricot overalls."),
    ],
    [
      "berry-vintage-photographer",
      tr("Berry red photographer"),
      tr("Liru holds a vintage camera in a berry red corduroy jacket."),
    ],
    [
      "sea-salt-shell-dress",
      tr("Sea salt shell dress"),
      tr("Liru waves in a sea-salt blue dress with a shell bag."),
    ],
    [
      "lavender-tea-caddy",
      tr("Lavender tea caddy"),
      tr("Liru holds a lavender tea tin in a top with lilac frog buttons."),
    ],
    [
      "midnight-starflower-dress",
      tr("Midnight starflower dress"),
      tr("Liru waves in a midnight blue starflower dress with a round bag."),
    ],
    [
      "cream-plaid-traveler",
      tr("Plaid traveler"),
      tr("Liru holds a map in a cream plaid cape."),
    ],
    [
      "butterfly-hoop-embroidery",
      tr("Butterfly hoop embroidery"),
      tr("Liru holds a purple butterfly embroidery hoop in a cream apron."),
    ],
    [
      "burgundy-velvet-dress",
      tr("Burgundy velvet dress"),
      tr("Liru carries a cream clutch in a burgundy velvet dress."),
    ],
    [
      "mist-blue-bow-umbrella",
      tr("Misty blue umbrella"),
      tr("Liru carries a folded umbrella in a mist blue jacket with a bow."),
    ],
    [
      "cream-daisy-pinafore",
      tr("Cream daisy pinafore"),
      tr("Liru holds daisies in a cream daisy-patterned pinafore."),
    ],
    [
      "cocoa-rose-bookshop",
      tr("Cocoa rose bookshop"),
      tr("Liru adjusts her glasses and holds books in a cocoa pinafore."),
    ],
    [
      "mint-windup-music-box",
      tr("Mint windup music box"),
      tr("Liru holds a windup music box in a mint dress patterned with notes."),
    ],
    [
      "cherry-soda-sailor",
      tr("Cherry soda sailor"),
      tr("Liru makes a peace sign with pink soda in a cherry sailor dress."),
    ],
    [
      "misty-lilac-bell-cape",
      tr("Misty lilac bell cape"),
      tr("Liru holds a ribbon-tied scroll in a lilac cape with gold bells."),
    ],
    [
      "forest-green-detective",
      tr("Forest green detective"),
      tr("Liru holds a magnifying glass and notebook in a forest green coat."),
    ],
    [
      "honey-apricot-bow-dress",
      tr("Honey apricot bow dress"),
      tr("Liru carries a heart-shaped bag in an apricot dress with a bow."),
    ],
    [
      "indigo-moonlight-dress",
      tr("Indigo moonlight dress"),
      tr("Liru waves in an indigo star dress with a crescent-covered book."),
    ],
    [
      "strawberry-tea-party-dress",
      tr("Strawberry tea dress"),
      tr("Liru holds a strawberry teacup in a cream strawberry dress."),
    ],
    [
      "rose-milk-tea-academy",
      tr("Rose milk tea uniform"),
      tr("Liru holds a takeaway cup and handbag in a rose pink toggle coat."),
    ],
    [
      "spring-embroidered-maxi-dress",
      tr("Spring embroidered dress"),
      tr("Liru lifts a cream yellow skirt with floral embroidery at the hem."),
    ],
    [
      "arcade-streetwear",
      tr("Arcade streetwear"),
      tr("Liru raises a fist in a blue and white jacket and cargo trousers."),
    ],
    [
      "plum-knit-campus",
      tr("Plum campus cardigan"),
      tr("Liru holds a lilac notebook in a plum cardigan."),
    ],
    [
      "starry-pajamas",
      tr("Starry pajamas"),
      tr("Liru yawns in star-patterned pajamas while holding a quilt."),
    ],
    [
      "flower-ribbon",
      tr("Flower ribbon"),
      tr("Liru ties a plum ribbon around a pink bouquet."),
    ],
    [
      "cyanotype",
      tr("Ginkgo cyanotype"),
      tr(
        "Liru holds a golden ginkgo leaf beside its silhouette on a cyanotype.",
      ),
    ],
    [
      "late-night-radio",
      tr("Late-night radio"),
      tr("Liru turns the dial of a red radio in a teal cardigan."),
    ],
    [
      "woodland-birdcare",
      tr("Woodland birdkeeper"),
      tr(
        "Liru wears a mustard jacket with a small bird perched on her finger.",
      ),
    ],
    [
      "origami-swallow",
      tr("Paper swallow"),
      tr("Liru holds a blue paper swallow in a navy sailor dress."),
    ],
    [
      "morning-yoga",
      tr("Morning yoga"),
      tr("Liru sits cross-legged with eyes closed in a coral wrap top."),
    ],
    [
      "bubble-walk",
      tr("Bubble walk"),
      tr("Liru lifts a bubble wand to her lips in a denim vest."),
    ],
    [
      "wicker-weaver",
      tr("Wicker basket weaver"),
      tr("Liru carries a small wicker basket in an ochre vest."),
    ],
    [
      "ice-skates",
      tr("Lacing up skates"),
      tr("Liru sits on a bench in a burgundy jacket and laces an ice skate."),
    ],
    [
      "lantern-festival",
      tr("Lantern festival"),
      tr("Liru carries a glowing lantern in an embroidered golden skirt."),
    ],
    [
      "mime",
      tr("Street mime"),
      tr("Liru raises both palms in a striped shirt and red neckerchief."),
    ],
    [
      "baseball-fielding",
      tr("Baseball fielding"),
      tr("Liru holds a baseball in a glove, wearing a pinstriped uniform."),
    ],
    [
      "fern-gardener",
      tr("Fern gardener"),
      tr("Liru waters a potted fern in an olive shirt dress."),
    ],
    [
      "moonlight-gala",
      tr("Moonlight gala"),
      tr("Liru carries a silver clutch in a lavender satin gown."),
    ],
    [
      "equestrian",
      tr("Equestrian outfit"),
      tr("Liru fastens a riding glove in a tweed vest and tall boots."),
    ],
    [
      "pinwheel-festival",
      tr("Pinwheel festival"),
      tr("Liru holds a colorful pinwheel in blue gingham overalls."),
    ],
    [
      "night-train",
      tr("Night train attendant"),
      tr("Liru checks a pocket watch in a gold-trimmed green railway uniform."),
    ],
    [
      "fossil-researcher",
      tr("Fossil researcher"),
      tr("Liru brushes an ammonite fossil in a white lab coat."),
    ],
    [
      "bouldering",
      tr("Bouldering outfit"),
      tr("Liru reaches into her chalk bag in a bright green climbing vest."),
    ],
    [
      "matcha",
      tr("Matcha tea ceremony"),
      tr("Liru kneels in a floral green kimono and offers matcha."),
    ],
    [
      "accordion",
      tr("Folk accordion"),
      tr("Liru plays a red accordion in a leaf-embroidered jacket."),
    ],
    [
      "stained-glass",
      tr("Stained-glass sunlight"),
      tr("Liru holds stained glass patterned with a golden sun."),
    ],
    [
      "street-photographer",
      tr("Street photographer"),
      tr("Liru kneels in a mustard corduroy jacket with a camera."),
    ],
    [
      "circus-juggler",
      tr("Circus juggler"),
      tr("Liru juggles colorful balls in a diamond-patterned vest."),
    ],
    [
      "badminton",
      tr("Badminton outfit"),
      tr("Liru holds a racket and shuttlecock in yellow and green sportswear."),
    ],
    [
      "chess",
      tr("White knight"),
      tr("Liru holds up a white chess knight in a checkerboard dress."),
    ],
    [
      "vinyl-dj",
      tr("Vinyl DJ"),
      tr("Liru holds a vinyl record with headphones around her neck."),
    ],
    [
      "patchwork-tailor",
      tr("Patchwork tailor"),
      tr("Liru shows a patchwork star and wears a tomato pincushion."),
    ],
    [
      "sunset-astronaut",
      tr("Sunset astronaut"),
      tr("Liru salutes in an orange spacesuit while holding a white helmet."),
    ],
    [
      "jellyfish-dancer",
      tr("Jellyfish dancer"),
      tr("Liru dances in a shimmering blue dress with layered ruffles."),
    ],
    [
      "steam-workshop",
      tr("Steam workshop"),
      tr("Liru holds a wrench and brass gears in green overalls."),
    ],
    [
      "jazz-conductor",
      tr("Jazz conductor"),
      tr("Liru raises a baton in a black tailcoat with a gold bow tie."),
    ],
    [
      "snow-post",
      tr("Snowbound post"),
      tr("Liru offers a wax-sealed letter in a white quilted coat."),
    ],
    [
      "roller",
      tr("Roller skating"),
      tr(
        "Liru balances with arms out on mismatched red and blue roller skates.",
      ),
    ],
    [
      "marine",
      tr("Marine field notes"),
      tr("Liru holds a pencil and open notebook in a vest with a wave emblem."),
    ],
    [
      "camellia",
      tr("Camellia fan"),
      tr("Liru holds a camellia fan in a red frog-button jacket."),
    ],
    [
      "raincoat",
      tr("Mint raincoat"),
      tr("Liru makes a peace sign in a mint raincoat with a yellow umbrella."),
    ],
    [
      "baker",
      tr("Orange bun baker"),
      tr("Liru presents two glazed orange buns in an orange apron."),
    ],
    [
      "stargazer",
      tr("Constellation stargazer"),
      tr("Liru holds a brass spyglass in a purple constellation cape."),
    ],
    [
      "cello-tuning",
      tr("Cello tuning"),
      tr("Liru turns a cello tuning peg in a cream embroidered blouse."),
    ],
    [
      "shadow-puppet",
      tr("Golden crane shadow puppet"),
      tr("Liru in red brocade raises a golden crane shadow puppet."),
    ],
    [
      "surf-wax",
      tr("Waxing the surfboard"),
      tr("Liru kneels in a wetsuit and waxes a striped surfboard."),
    ],
    [
      "bookbinding",
      tr("Handbound notebook"),
      tr("Liru wears a blue knit shawl and stitches a book spine."),
    ],
    [
      "pool-chalk",
      tr("Chalking the cue"),
      tr("Liru in a plum waistcoat chalks a pool cue."),
    ],
    [
      "seaglass",
      tr("Sea glass"),
      tr("Liru crouches in yellow boots and holds up turquoise sea glass."),
    ],
    [
      "color-cube",
      tr("Puzzle cube"),
      tr("Liru twists a colorful puzzle cube in a peach vest."),
    ],
    [
      "frame-drum",
      tr("Frame drum"),
      tr("Liru in a lilac vest holds a round frame drum."),
    ],
    [
      "pottery-wheel",
      tr("Pottery wheel workshop"),
      tr("Liru shapes a clay cup on a pottery wheel."),
    ],
    [
      "candy-balloon",
      tr("Heart balloon"),
      tr("Liru in a blue sailor jacket holds a pink heart balloon."),
    ],
    [
      "peach-kitten",
      tr("Kitten brushing"),
      tr("Liru brushes the orange kitten curled up in her lap."),
    ],
    [
      "grape-bunny-bag",
      tr("Grape bunny bag"),
      tr("Liru looks back in a purple pinafore with a bunny backpack."),
    ],
    [
      "caramel-pudding",
      tr("Caramel pudding"),
      tr("Liru in a yellow sweater points to a caramel pudding."),
    ],
    [
      "duck-windup",
      tr("Windup duck"),
      tr("Liru crouches in a blue sailor coat and winds a toy duck."),
    ],
    [
      "cotton-candy-taste",
      tr("Cotton candy"),
      tr("Liru touches her cheek while holding pink and purple cotton candy."),
    ],
    [
      "teddy-greeting",
      tr("Teddy wave"),
      tr("Liru in a fleece jacket lifts her teddy bear’s paw to wave."),
    ],
    [
      "strawberry-heart",
      tr("Strawberry heart"),
      tr("Liru makes a hand heart in a cardigan with strawberry buttons."),
    ],
    [
      "lemon-piping",
      tr("Lemon tart"),
      tr("Liru in a chef’s jacket pipes cream onto a lemon tart."),
    ],
    [
      "kite-reel",
      tr("Kite reel"),
      tr(
        "Liru in a yellow vest pulls string from a reel beside a folded kite.",
      ),
    ],
    [
      "tarot",
      tr("Star tarot"),
      tr("Liru in a burgundy vest draws a tarot card with a gold star."),
    ],
    [
      "typewriter",
      tr("Vintage typewriter"),
      tr("Liru in a red blouse types on a cream typewriter."),
    ],
    [
      "lolita-steampunk",
      tr("Clockwork Lolita"),
      tr(
        "Liru holds a brass pocket watch in a brown dress embroidered with gears.",
      ),
    ],
    [
      "lolita-antique-doll",
      tr("Antique rose doll"),
      tr(
        "Liru touches a rose brooch above a dusty pink dress with lace and pearl chains.",
      ),
    ],
    [
      "lolita-desert-princess",
      tr("Desert sun princess"),
      tr(
        "Liru holds a blue pendant in a tasseled cape and skirt with gold sun motifs.",
      ),
    ],
    [
      "lolita-blue-porcelain",
      tr("Blue porcelain Lolita"),
      tr(
        "Liru holds a closed fan that matches the cobalt peonies on her ivory dress.",
      ),
    ],
    [
      "lolita-rose-knight",
      tr("Rose knight"),
      tr(
        "Liru wears silver shoulder armor over a burgundy dress embroidered with roses.",
      ),
    ],
    [
      "lolita-magic-librarian",
      tr("Spellbook librarian"),
      tr(
        "Liru holds a gold-stamped book in a dark green cape, with a small key in her hair.",
      ),
    ],
    [
      "lolita-moon-vampire",
      tr("Moonlit vampire"),
      tr(
        "Liru smiles with small fangs in a bat-wing cape fastened with a red gem.",
      ),
    ],
    [
      "lolita-vintage-detective",
      tr("Houndstooth detective"),
      tr("Liru raises a brass magnifying glass in a brown houndstooth cape."),
    ],
    [
      "lolita-candy-witch",
      tr("Candy witch"),
      tr(
        "Liru winks with a swirl lollipop in a purple witch hat and candy-print skirt.",
      ),
    ],
    [
      "lolita-deep-sea-mermaid",
      tr("Deep sea mermaid"),
      tr(
        "Liru cradles a spiral shell in a navy dress with shimmering scales and pearl strands.",
      ),
    ],
    [
      "lolita-circus",
      tr("Circus ringmaster"),
      tr(
        "Liru winks in a burgundy ringmaster jacket, lifting a skirt embroidered with a circus tent.",
      ),
    ],
    [
      "lolita-astrologer",
      tr("Astrolabe keeper"),
      tr(
        "Liru holds a brass astrolabe, with gold moon phases embroidered on her skirt.",
      ),
    ],
    [
      "lolita-military",
      tr("Ceremonial uniform"),
      tr(
        "Liru adjusts her cuff on a dark green uniform with gold epaulettes and a burgundy sash.",
      ),
    ],
    [
      "peony-stage-dress",
      tr("Scarlet peony dress"),
      tr(
        "Liru touches her collar in a scarlet outfit with peony embroidery, a jade ring and long draped sleeves.",
      ),
    ],
    [
      "starlight-crystal-gown",
      tr("Starlight crystal gown"),
      tr(
        "Liru winks in a violet gown with silver star embroidery and dangling purple crystals.",
      ),
    ],
    [
      "arcade-techwear",
      tr("Neon arcade outfit"),
      tr(
        "Liru raises a fist in a neon-trimmed jacket and loose cargo pants, with headphones around her neck.",
      ),
    ],
    [
      "jade-blossom-cape",
      tr("Jade blossom cape"),
      tr(
        "Liru closes her eyes with a white bouquet in her hands and jade clasps on her green cape.",
      ),
    ],
    [
      "campus-knit-notebook",
      tr("Campus knit cardigan"),
      tr(
        "Liru waves in a lavender cable-knit cardigan, holding a notebook beside a sprout satchel.",
      ),
    ],
    [
      "lolita-gothic-rose",
      tr("Gothic violet rose"),
      tr(
        "Liru holds a closed lace fan beside a black velvet skirt embroidered with purple roses.",
      ),
    ],
    [
      "bamboo-fan-hanfu",
      tr("Bamboo fan hanfu"),
      tr(
        "Liru opens a green bamboo-patterned fan beside her lavender pleated skirt.",
      ),
    ],
    [
      "lolita-strawberry-sweet",
      tr("Strawberry ribbon dress"),
      tr(
        "Liru lifts a strawberry charm beside the pink bow and berry embroidery on her lavender dress.",
      ),
    ],
    [
      "lolita-maple-kimono",
      tr("Maple kimono Lolita"),
      tr(
        "Liru lifts a kimono-style sleeve above a lace skirt patterned with maple leaves and chrysanthemums.",
      ),
    ],
    [
      "lolita-snow-queen",
      tr("Snow queen"),
      tr(
        "Liru holds a snowflake scepter in a pale blue dress with a white fur-trimmed cape.",
      ),
    ],
    [
      "lolita-forest-lily",
      tr("Woodland lily of the valley"),
      tr(
        "Liru closes her eyes holding lily of the valley, with fern embroidery on her sage-green skirt.",
      ),
    ],
    [
      "lolita-sailor-shell",
      tr("Seashell sailor dress"),
      tr(
        "Liru winks and lifts a navy sailor skirt trimmed with rope knots, shells and waves.",
      ),
    ],
    [
      "lolita-court-blue-rose",
      tr("Blue rose court dress"),
      tr(
        "Liru holds a lace fan in a powder-blue gown with blue roses, gold scrollwork and pearls.",
      ),
    ],
    [
      "lolita-classic-rose",
      tr("Classic rose Lolita"),
      tr(
        "Liru holds a single pink rose in a moss-green dress with dusty pink ribbons.",
      ),
    ],
    [
      "lolita-daisy-gingham",
      tr("Daisy gingham dress"),
      tr(
        "Liru holds a white daisy in a peach gingham pinafore with a cream pocket.",
      ),
    ],
    [
      "lolita-mint-tie-sailor",
      tr("Mint tie sailor dress"),
      tr(
        "Liru winks in a navy sailor dress with a striped white collar and a mint green tie.",
      ),
    ],
    [
      "lolita-pink-bow-pinafore",
      tr("Pink bow pinafore"),
      tr(
        "Liru smiles in a pink pinafore with a waist bow and a white eyelet hem.",
      ),
    ],
    [
      "lolita-monochrome-gothic",
      tr("Monochrome gothic dress"),
      tr(
        "Liru adjusts a cream cuff on her black dress with a ribbon at the ruffled collar.",
      ),
    ],
    [
      "lolita-burgundy-bow-academy",
      tr("Burgundy bow academy outfit"),
      tr(
        "Liru holds a cream book in a blue-violet jacket with a burgundy bow.",
      ),
    ],
    [
      "lolita-sage-pocket-dress",
      tr("Sage pocket dress"),
      tr(
        "Liru slips one hand into the pocket of a sage green pinafore with a lace hem.",
      ),
    ],
    [
      "lolita-opera-phantom",
      tr("Opera phantom"),
      tr(
        "Liru raises an ivory mask beside a black cape and a skirt draped in burgundy.",
      ),
    ],
    [
      "lolita-spring-flower-goddess",
      tr("Spring flower goddess"),
      tr(
        "Liru holds a flowering branch in a petal cape and a yellow skirt embroidered with tulips.",
      ),
    ],
    [
      "lolita-rose-music-box",
      tr("Rose windup music box"),
      tr(
        "Liru opens a brass music box with a rose on its lid, wearing a peach dress trimmed with gears.",
      ),
    ],
  ];
  // Saved draws still refer to these images by their original URLs.
  const retired: Outfit[] = [
    [
      "star-note-academy",
      tr("Star Note Academy"),
      tr("Liru waves with a music book in a star-patterned navy skirt."),
    ],
    [
      "mint-bunny-picnic",
      tr("Mint bunny picnic"),
      tr("Liru carries a picnic basket in a mint bunny-ear hoodie."),
    ],
    [
      "strawberry-cream-cafe",
      tr("Strawberry cream café"),
      tr("Liru carries a plate of strawberry cake in a pink strawberry apron."),
    ],
    [
      "peach-carousel-dress",
      tr("Peach carousel dress"),
      tr("Liru wears a peach-pink carousel dress with a ticket-shaped bag."),
    ],
    [
      "violet-carousel-dress",
      tr("Violet carousel dress"),
      tr("Liru wears a violet carousel dress with a ticket-shaped bag."),
    ],
    [
      "mint-carousel-dress",
      tr("Mint carousel dress"),
      tr("Liru wears a mint carousel dress with a ticket-shaped bag."),
    ],
  ];
  function figure([id, caption, alt]: Outfit): WikiGalleryFigure {
    return {
      src: `/mascot/liru/gallery/${id}.webp`,
      previewSrc: `/mascot/liru/gallery/${id}-640.webp`,
      width: 1024,
      height: 1536,
      rarity: liruRarities[id] ?? "R",
      alt,
      caption,
    };
  }
  const gallery = outfits.map(figure);
  return {
    title: tr("Liru Gallery"),
    gallery,
    collection: [...gallery, ...retired.map(figure)],
  };
}

export function wikiHref(slug: string) {
  return slug === "introduction" ? "/wiki" : `/wiki/${slug}`;
}
