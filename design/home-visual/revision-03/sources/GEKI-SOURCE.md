# Classic osu! 激 source and SVG adaptation

The source was inspected directly in the official `ppy/osu-resources` repository.
Pinned repository commit: `b86b30a9c1109f612fead25c269f8ad6cae4a1c1`.

## Selected asset

- Official path: `osu.Game.Resources/Skins/Legacy/hit300g@2x.png`.
- [Pinned source](https://github.com/ppy/osu-resources/blob/b86b30a9c1109f612fead25c269f8ad6cae4a1c1/osu.Game.Resources/Skins/Legacy/hit300g%402x.png).
- `legacy-hit300g@2x.png`: original 162 × 164 RGBA, unchanged.
- SHA-256: `39e8e94b8c3183661a7e4d3d29c3f591f5691f26665f1a9ba2182203c925d46a`.
- Appearance: white/cyan heavy stylized 激 on cyan blue glow, without a numeric score.
- Attribution: **ppy / osu! resources**.

`../geki.svg` is a native path vector adaptation of this source. It was deterministically traced with Potrace 1.16 from alpha and foreground color masks. The original character contour is retained; no replacement font or AI-generated character was used. Raster glow is simplified into three smooth vector alpha bands; foreground uses a white-to-cyan gradient matching the source direction. No raster images, external fonts, filters or scripts are embedded.

Regenerate with `python sources/trace-geki.py` from the revision-03 directory (requires Pillow, NumPy and Potrace). The result has `viewBox="0 0 162 164"` and approximately 6.6 KB. Place without stretching, preferably upright to preserve the skin asset's existing slanted strokes.

## Earlier Retro alternative

The official repository also contains `osu.Game.Resources/Skins/Retro/hit300g.png`.
Its unchanged original is preserved as `retro-hit300g.png` for comparison. It has a yellow/red burst with **激 300**, rather than the stand-alone 激 requested here.

- [Pinned Retro source](https://github.com/ppy/osu-resources/blob/b86b30a9c1109f612fead25c269f8ad6cae4a1c1/osu.Game.Resources/Skins/Retro/hit300g.png).
- SHA-256: `edde7b3c2d0f80ff3103c6b8c03553435c62c64ce47e1a3c4b502b5f48e14763`.

The user's term “原始皮肤” can refer to either period; selection here is the classic Legacy stand-alone 激 because its content matches the requested O-center judgement. This does not claim all default-skin generations use the same asset.

## License

The official [repository README](https://github.com/ppy/osu-resources/blob/b86b30a9c1109f612fead25c269f8ad6cae4a1c1/README.md) states that the majority of resources are **CC BY-NC 4.0**. No asset-specific alternative license was present for these skin files in the inspected tree. The pinned repository license is preserved in `OSU-RESOURCES-LICENCE.md`.

This source and its SVG adaptation are attributed separately from the OCLR repository's MIT code. Preserve attribution, license notice, source link and the modification statement above. Commercial reuse is not granted by CC BY-NC 4.0. The source repository also reserves osu!/ppy branding trademark rights; no endorsement is claimed.
