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
