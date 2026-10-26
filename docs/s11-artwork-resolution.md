# S11 artwork resolution investigation (#173)

## Current purple-outfit artwork — 2026-10-26

The organizer supplied `oclr-s11-purple-c-outfit-1920x1080.png` and requested replacing the current S11 artwork plus high-resolution, banner and logo versions. This supersedes the previous artwork selection described in the historical investigation below.

The source and deliverables are preserved in `output/imagegen/s11-purple/`:

- `source-1920x1080.png`: unchanged organizer source.
- `key-visual-3840x2160.png`: 16:9 master; the built-in image editor returned 1672×941, then Sharp Lanczos3 enlarged it to the exact UHD canvas. This is AI interpretation followed by interpolation, **not native 4K or recovered original detail**.
- `banner-3840x1280.png`: branded 3:1 promotional banner (generated at 2172×724, enlarged).
- `background-3840x1800.png`: text-free homepage background (generated at 1831×859, resized/cropped by less than one source pixel in height).
- `logo-transparent.png`: 2086×754 transparent cream/pink S11 wordmark with the English subtitle; verified alpha range 0–255.
- `square-generated.png`: 1254×1254 square emblem; website export is 1200×1200 WebP.
- The `*-generated.png` files retain the unresized built-in image-generation outputs. Exact prompts are recorded in `output/imagegen/s11-purple-prompts.txt`.

Existing S11 public paths are updated in place to preserve stored branding allowlists. The overview retains its six responsive widths (640–3840); its intrinsic height is now 2160. The original key-visual path uses the supplied source; responsive enhanced paths use the AI-refined master. The homepage keeps its existing separate background and transparent wordmark layers. `public/oclr-s11-banner.webp` supplies the standalone promotional banner. The global OCLR header and favicon are unchanged. Historical exports outside this new directory remain historical, not current masters.

All generated designs were visually inspected for lettering, palette, character and framing. Generated derivatives can vary from the supplied illustration. No tournament data, locale wording or deployment was changed.

Verification for this replacement: `npm ci`, `npm run check`, `npm run build`, `npm audit --omit=dev` (zero production vulnerabilities), Prettier checks and `git diff --check` passed. All website image dimensions were decoded with Sharp; the six overview exports are exactly 16:9. The 4K overview WebP is 1,509,056 bytes, homepage background 1,301,474 bytes, promotional banner 1,010,644 bytes, transparent wordmark 826,447 bytes and square emblem 399,980 bytes. The initial full test attempt encountered sandbox-sensitive deployment/listener failures; the unsandboxed retry completed successfully: 97 files passed, 52 skipped; 669 tests passed, 424 skipped (138.76 seconds). Targeted desktop/mobile Playwright initially failed with loopback `EPERM`; its retry stalled awaiting server readiness and was interrupted. No isolated test database was configured, so DB-backed S11 browser checks and real-page crop acceptance are not established. Local tooling was Node 26.12.0 (Node 24 LTS was unavailable); a supported-runtime CI run remains outstanding. No new commit-specific CI pass or production deployment is claimed.

Checked on 2026-10-24. The initial source investigation is retained below. The organizer subsequently authorized AI enhancement and applying the selected poster; see the application record at the end.

| Surface                        | Approved source                           | Pixels    | File bytes | Delivery                                                              |
| ------------------------------ | ----------------------------------------- | --------- | ---------- | --------------------------------------------------------------------- |
| Home wide hero                 | `public/oclr-s11-website-background.webp` | 2560×1200 | 255310     | CSS background, `cover` on desktop; mobile composition uses `contain` |
| Tournament overview key visual | `public/oclr-s11-key-visual.webp`         | 1672×941  | 293892     | Next Image with `unoptimized`; delivered at original dimensions       |

The public home page was inspected in a browser and uses the website-background asset, not the directory thumbnail. There is no Next Image `srcset` selection or optimization quality loss in that CSS path. The tournament overview also receives the original file, so changing `sizes` alone cannot restore detail. The existing opacity/scale entrance animation finishes at scale 1; overlays and responsive crop remain unchanged.

At 1920 CSS pixels and DPR 2, a full-width background needs approximately 3840 source pixels horizontally for one source pixel per device pixel. The 2560-pixel source provides only two thirds of that width. The 1672-pixel key visual similarly limits very wide/high-DPI use. Actual source detail and compression quality cannot be recovered from dimensions alone; merely upscaling or re-encoding these exports does not prove a sharper original.

The existing `/Users/emik/Downloads/mainsheet-light/assets/oclr-s11-hero.webp` and `oclr-s11-key-visual.webp` copies have the same dimensions and file sizes as the shipped files. No higher-resolution approved source has been identified. The organizer subsequently supplied `oclr-s11-key-visual-1.webp`; see the byte comparison below. Keep #173 open until a higher-resolution source is available, then export responsive versions and compare 1440/1920 CSS-pixel screenshots at DPR 1 and 2, mobile/tablet crops, transfer sizes and layout stability. Do not substitute a different composition or synthesize artwork details.

Current source SHA-256:

- Website background: `db206ec9782ec991a5492259eeee1bae9257434d69198a93e06e1a135a69d3fd`
- Tournament key visual: `bfd7b6ef12654a7814c064a0bc2014b5250ce3f501991176977c3c9472dfab16`

## Organizer-supplied file check

On 2026-10-24 the organizer supplied `/Users/emik/Downloads/oclr-s11-key-visual-1.webp`. It measures **1672×941**, is **293892 bytes**, and has SHA-256 `bfd7b6ef12654a7814c064a0bc2014b5250ce3f501991176977c3c9472dfab16`. A direct byte comparison (`cmp`) confirms it is identical to `public/oclr-s11-key-visual.webp`. It is therefore already the shipped tournament artwork, not a higher-resolution replacement. Nearby `oclr-s11*` files contain only the previously checked exports.

No image was replaced, recompressed, upscaled or generated on this follow-up. #173 still requires a higher-resolution approved original to establish the requested sharpness improvement while preserving the artwork. The supplied key visual also has a different composition/aspect ratio from the text-free home background, so substituting it there would not preserve the current hero composition.

## Organizer-authorized enhancement export

On 2026-10-24 the organizer explicitly requested “進行超解析度處理製作一個更大的主視覺圖”. This authorizes a new enhancement candidate; the original artwork remains intact. The built-in `image_gen` editor produced two restoration candidates. Both actually returned **1672×941** PNGs despite requests for 3840×2160, including the attempt using an interpolated 4K input. The second candidate was visually checked for the existing composition, face, bow, logo and exact subtitle, and selected.

The selected AI-restored result was then enlarged with Lanczos3 to **3840×2161**, preserving its aspect ratio without cropping, and exported as:

| Artifact                                                |    Bytes | Purpose                                     |
| ------------------------------------------------------- | -------: | ------------------------------------------- |
| `output/imagegen/oclr-s11-key-visual-enhanced-3840.png` | 15907291 | Lossless master/export                      |
| `public/oclr-s11-key-visual-enhanced-3840.webp`         |  1142224 | Smaller WebP delivery candidate, quality 95 |

The exact prompts and observed output limits are recorded in `output/imagegen/oclr-s11-key-visual-enhancement-prompts.txt`. This is **AI detail restoration followed by interpolation**, not a native-4K super-resolution result or recovery of verifiable original detail. AI-estimated texture may differ from the original. Visual checks retain the composition, character, palette, “OCLR S11” and “OSU! CHINESE LEAGUE ROOKIE”; pixel identity is not claimed. Both exports decode at the stated dimensions. The original source hash remains unchanged.

The artifact-generation step delivered the requested larger image as sibling artifacts without changing the selected website artwork, text-free homepage background, branding configuration, responsive layout or production service. No application code or dependency changed at that step, so the application suite was not repeated for the exports.

## Applied to the tournament key visual

The organizer explicitly requested applying the selected enhancement on 2026-10-24. `EventArtwork` now maps the existing approved S11 key-visual value to the enhanced image and supplies six static responsive widths. Existing published editions and previews receive the new artwork without changing stored configuration, permission checks or branding allowlists. The separate text-free home background retains its original illustration; this poster is not substituted into that different composition.

The 640/960/1280/1920/2560px derivatives use WebP q90 and the existing 3840px master remains q95. The source picture preserves the existing image fallback, alt text, layout, crop and theme behavior. [Measured delivery, local before/after screenshots and verification](verification/issue-173/README.md) document the application step. Production deployment has not been performed.
