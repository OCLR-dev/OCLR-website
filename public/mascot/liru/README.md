# Liru (LR娘) character sheets

Official OCLR mascot (issue #334). The design began as a community proposal by JerrYamada.

- `sheet-main.webp`: character sheet (front view, profile, design details, palette), 1600×1453.
- `sheet-turnaround.webp`: front, side and back views at one scale, 1600×1160.
- `sheet-expressions.webp`: six expressions, 1600×1227.
- `sheet-outfit-chinese.webp`: Chinese-style outfit v1.2 (an alternate outfit; the track jacket stays her main design), 1600×1453. Added for issue #442.
- `sheet-stickers.webp`: overview of the chibi stickers on light and dark backgrounds, 1600×509. Added for issue #536.

Each file is an approved sheet (v1.2.1; v1.2 for the outfit), exported as a 2400 px wide PNG kept by the proposer, then scaled to 1600 px and saved as WebP (quality 86). The artwork was made with AI assistance (Animagine XL 4.0, CreativeML Open RAIL++-M) and retouched afterwards.

Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), credit "Liru by JerrYamada". This applies to these images only; the repository code stays under its MIT licence.

Used by the Wiki article `/wiki/liru` (`src/lib/wiki-articles.ts`). No tournament data depends on these files.

## Stickers (`stickers/`, issue #536)

Eight chibi stickers of Liru in her Chinese-style outfit, v1.0.0, for the website, stream overlays and other interface designs:
`pick`, `ban` and `mod-nm`, `mod-hd`, `mod-hr`, `mod-dt`, `mod-fm`, `mod-tb` (one per mappool category).

- `stickers/png/liru-<id>-<size>.png` and `stickers/webp/liru-<id>-<size>.webp`, sizes 512, 256, 128 and 64 px.
- Every sticker is on the same transparent square canvas, with equal padding and her feet on a shared baseline, so one can replace another in a fixed-size slot. A white sticker rim keeps them readable on light and dark backgrounds.
- `stickers/manifest.json` lists each sticker's ID, Chinese and English names, Chinese and English alt text, and file paths. Use the alt text when showing a sticker.
- Prefer WebP; for a 64–128 px slot use the next size up for sharp high-DPI display.
- The stickers carry no team colour or text; show teams with the interface's existing red/blue borders.
- Scale proportionally. Do not stretch, recolour, crop the rim or flip horizontally (her left/right details are fixed).

Same licence and credit as above (CC BY 4.0, "Liru by JerrYamada"; AI-assisted and retouched).

The chat icon in `src/components/liru-chat-icon.tsx` is a monochrome head portrait redrawn from the official chibi design. Liru by JerrYamada, adapted for OCLR chat under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The design retains the two-tone character's sprout-shaped forelock, pointed side locks and eyes using outlines and negative space. [Character reference](https://oclr.org/wiki/liru).
