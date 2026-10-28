# S11 layered banner study / R07

Local visual draft, built at the organizer's request. It is a separate homepage-banner composition page, not a deployed homepage or approved mascot replacement. Open `http://127.0.0.1:4178/` while the local static server is running. This page needs no Developer token, backend, database or login.

## Controls

- Select city, foreground, Liru or Logo on the right. Use **− 缩小 / ＋ 放大** above the canvas to resize that layer about its center. Its width percentage is displayed between the buttons.
- **画布 − / ＋** magnifies the preview only (50–200%); it does not change the composition. **适应窗口** restores 100%. Oversized previews can be scrolled.
- Drag the canvas to move the selected layer. Arrow keys nudge by 0.2 percentage points; Shift nudges by 2.
- Each layer has position, width, rotation, horizontal/vertical perspective, skew, opacity and visibility controls. Perspective transforms the image plane, not the actual 3D anatomy or city geometry.
- The dark-left / transparent-right gradient is separate from the source images.
- Toggle original reference and thirds guides; switch desktop/narrow preview; use pure preview to hide editing tools.
- Composition is saved only in this origin's browser localStorage. Export/import JSON to retain or share parameters; image files remain separate. Reset restores the initial arrangement. No server uploads occur.

## Asset manifest and provenance

| Asset | Role | Source |
| --- | --- | --- |
| `assets/city.png` | City/river/sky background plate | Built-in ImageGen style transfer using the existing homepage background |
| `assets/liru.png` | Seated character with alpha | Built-in ImageGen; supplied Liru sheet for identity, existing homepage for pose |
| `assets/foreground.png` | Stone ledges/steps with alpha | Built-in ImageGen; existing homepage perspective reference |
| `assets/logo.svg` | Transparent outline logo | Exact copy of `public/branding/oclr-s11-layout-b.svg` at creation, including five-region accuracy bar |
| `assets/original.webp` | Comparison reference | Existing `public/oclr-s11-website-background.webp` |

All four user attachments in this turn contained the same character sheet, not distinct city/pose references. The current homepage was therefore used as the provisional city/pose reference. ImageGen approximates the source geometry; this does **not** claim pixel-exact preservation of architectural lines. Use the original comparison to review skyline, bridge and foreground changes. The user can replace the plates after supplying distinct references.

Liru original character design: **JerrYamada**, [official character sheet](https://oclr.org/wiki/liru), **CC BY 4.0**. These are AI-assisted adaptations. New images were generated with the built-in `image_gen` tool. Exact prompts and input roles are retained in [prompts.json](prompts.json). Original generated outputs remain under the tool's generated-images directory, with project copies stored here. The character retains lavender hair, side ponytail, green sprout, halo, red/blue clip, athletic jacket, T4 badge, green bracelet, and asymmetrical sneaker accents, subject to visual review.

The city plate is 1774×887 RGB. Character is 1024×1536 RGBA; foreground is 1774×887 RGBA. Both PNG cutouts have real alpha. Character lighting includes a soft translucent rim glow; it is not a perfect hard matte. Background and character style/pose are proposals pending organizer review.

## Run locally

From this directory:

```sh
python -m http.server 4178 --bind 127.0.0.1
```

The current preview was started as a detached loopback-only process to keep it available between chat turns. Existing app preview on localhost:3000 and its Developer connection are separate and unchanged.

## Verification

Node syntax check; SVG and PNG metadata/alpha inspection; local browser visual inspection. This standalone page does not alter application routes, translations, tournament data or runtime authorization. Full application/DB tests do not apply to this static design artifact.

Browser checks confirmed all source images loaded, layer enlargement (31% → 34.1%), independent canvas zoom (100% → 125%), perspective persistence after refresh, and no document-level horizontal overflow. A second review instance on port 4179 isolates composition storage from 4178. Do not reset either browser state when the organizer is adjusting the scene.

## City update / v2

The organizer subsequently supplied the real skyline photograph (`assets/city-reference.png`). The active city layer is now `assets/city-beijing-v2.png`, restyled with built-in ImageGen to the lavender/peach lighting of the original study while retaining recognizable landmark positions and dense urban foreground. The original comparison now shows that photograph. The output is a generative approximation, not an exact architectural tracing. Its native aspect ratio is preserved; the banner clips the image instead of stretching it. Existing localStorage settings, character, foreground and SVG are unchanged. Previous `assets/city.png` remains as iteration history. Source image usage is based on the organizer-provided reference; no external licensing claim is made.

## Separate centered banner / R08

Open `centered/` for the second banner: no character or stone foreground, only a purple star field with faint city contours and separate OCLR / S11 outline layers. Its initial composition follows the organizer's S9 reference's central title hierarchy, not its blue palette, character or S9 text. Built-in ImageGen produced `assets/centered-skyline.png`; exact prompt is in `centered-prompt.json`. The source photo is the skyline reference, while `assets/centered-reference.png` is the user-provided composition reference. No licensing claim is made for user-provided references.

`split-logo.py` reproducibly separates the original SVG without changing letter paths. Both pages expose OCLR and S11 as independently adjustable layers. The homepage uses full-canvas transparent split layers to preserve every previous position/perspective setting: when old settings have only `logo`, its settings are copied to the new S11 layer. The centered page uses cropped SVG views for intuitive independent scaling. Letter interiors stay transparent.

Storage keys are independent (`oclr-banner-layer-studio-v1` versus `oclr-centered-banner-studio-v1`); exported JSON records layout type and rejects import into the wrong layout. Main-page settings are not reset by visiting the centered page. Both have direct layer +/- and canvas +/- controls. The main page now uses the supplied Beijing photo's style-transfer output.

Verified SVG split group membership and preserved path data, JavaScript syntax, all image loads, separate initial state on the new centered page, and retention of existing non-default homepage values after reload. Browser composition inspected. Static design artifacts only; no app/DB/build suite run and no deployment.


### 素材替换与 SVG 直接选择

OCLR、S11、喝通过 `split-logo.py` 从原 SVG 分组提取，原路径数据保持一致；页面内联 SVG，可点击可见笔画选择并拖动，或使用右侧图层按钮。喝使用独立完整 viewBox，避免原主标裁切。旧构图自动迁移，背景、人物替换保留位置参数；“适配当前素材位置”只调整所选层的位置与宽度。

- `gandalf-happy.png`：用户提供甘道夫参考图的透明 PNG，微笑、人物与长杖保留，移除 2001 字样。
- `osu-original.jpg`：本机 osu! Songs 中 set 838182 / beatmap 1754777 的 BG.jpg；保留原作者角标。
- `osu-purple.png`：该背景的紫色风格版本。
- `nebula-only.png`：从居中背景移除城市后的纯紫色星云。
- 位图使用内置 imagegen 编辑；提示词见 `replacement-prompts.json`。这些是本地视觉草稿素材，未部署。


2026-10-28 微调：`gandalf-happy-v2.png` 使用内置 imagegen 增强笑容（提示词 `gandalf-v2-prompt.txt`）；封面改为原背景加 CSS `saturate(.75) hue-rotate(12deg)`，星云 `saturate(.65)`，没有重新生成背景。OCL 在原 SVG 中缩小 4%，围绕原字高中心调整，R 保留圆弧的视觉超出量。已有位置与透视参数保持不变。


### 冬季彩色方案

原 SVG 的 OCL 使用冰蓝—薰衣草—淡粉渐变，R 保持镂空、外轮廓柔光，控制点改为四芒星并用星座虚线连接；英文 Rookie 的首字母复用 R 的图形。准度条使用三色渐变，保留区间分界；S11 填白并与左侧整组文字底端对齐。居中页增加八边形内框、细线外框和 `2026 winter`。星云直接用亮度滤镜提亮，无新增图片生成。

居中配色版使用独立浏览器保存键 `oclr-centered-banner-studio-color-v1`，保留先前构图键。源 SVG 修改后依次运行 `python split-logo.py` 和 `python sync-inline.py` 同步两个页面。


### 冬季星空摄影试排

`assets/nasa-orion-snow.jpg` 来自 NASA APOD 2026-01-27《Orion’s Treasures over Snowy Mountains》。来源：https://science.nasa.gov/image-article/apod-2026-january-27-orions-treasures-over-snowy-mountains/ 。摄影与版权：Włodzimierz Bubak（Trzeci Plan），不是 NASA 公版照片。当前仅用于用户要求的本地试排，公开发布前需确认摄影作品的使用授权。原图保留，页面通过 object-fit: cover / object-position: 50% 20% 做 2:1 适配，未重新生成或改写照片。旧星云仍可在素材菜单切回。

另下载候选 `nasa-winter-night.jpg`（未使用），来源 NASA APOD 2024-12-28《A December Winter Night》，同一摄影师版权：https://science.nasa.gov/image-article/apod-2024-december-28-a-december-winter-night/ 。


### 高清背景修正

此前 APOD 的 960×1200 图片在 150% 放大后，画布实际只有约 640×320 的来源像素。新增 `assets/nasa-orion-6000.jpg`（6000×6000）替换为同属猎户座主题的 Hubble 星云图： https://science.nasa.gov/asset/hubble/hubbles-sharpest-view-of-the-orion-nebula/ 。来源文件为该页面公开的 6000×6000 JPEG 下载。署名 NASA / ESA、M. Robberto (Space Telescope Science Institute/ESA) 与 Hubble Space Telescope Orion Treasury Project Team。全宽 100% 显示时取原图上半部 6000×3000 区域；仅 CSS 紫色调色，不放大低分辨率像素、不生成虚构细节。旧图保留为菜单对照选项。


高清星云调色更新：以 SVG 色调曲线将暗部映射到干净的深蓝、中间调映射到紫色、亮部保留浅紫与白色；移除原先整体染色产生的灰色中间调。Logo 后方增加局部深蓝透明遮罩，边缘与下方星云保留亮度和纹理。未改写 NASA 原图，未重置构图参数。


## Current homepage integration

The homepage uses the corrected transparent `liru-refined-v2.png` (native 1024×1536), reduced by 30% from 77.1087% to 53.97609% canvas width, positioned at x=63%, y=28% with 12° horizontal perspective. PNG is the approved display format; SVG tracing experiments remain comparison assets and do not increase source detail. A fresh studio starts with the same homepage composition. Existing saved browser compositions remain intact; use reset or import/export to switch deliberately.

The character composition is applied to `/`; the separate centered octagonal winter banner is applied inside the S11 tournament overview. Run the static studio with the command above; open `/` for the character composition and `/centered/` for the independent banner. No backend or credentials are required by either editor. The `public/branding/home-s11/` copies are runtime assets. Scripts, source artwork, generation prompts and alternative assets in this directory are retained for editing and provenance.


## Runtime image exports (PR #421 review)

Keep editing the full-resolution files under `assets/`. After `npm ci`, run
`node design/home-visual/layer-studio/export-runtime-images.mjs` from the repo root
to regenerate the palette-compressed runtime PNGs (including alpha) and their
480/960/1600px scene and 320/640px character derivatives. The largest variants
retain the source dimensions; they do not invent additional detail. The homepage
uses native `picture` / width-based `srcset` selection with sizes matching the
existing layer geometry (103vw sky, 95vw foreground, 54vw character). Eager sky
and character loading uses the selected source, without a fallback-image preload.

Run `python3 design/home-visual/layer-studio/export-home-banner.py` to regenerate
the centered SVG. It invokes the same Sharp exporter to crop the top 6000×3000
region and embed a 2000×1000 JPEG at quality 85, matching the former `xMidYMin
slice` composition at 2x canvas density. Node, npm dependencies and Python 3 are
required; the original 6000×6000 NASA photograph stays untouched in the studio.
