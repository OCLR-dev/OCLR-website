# Liru character refinement

The original seated character was edited with built-in ImageGen. The target was
the existing `assets/liru.png`; the organizer's character sheet was used only as
a hair/sprout reference. Prompt: `liru-refinement-prompt.txt`.

The revised image removes the huge loop-shaped floating hair, organizes the bob
and side ponytail, uses a compact sprout ahoge, and brings the jaw closer to the
shoulders/collar. Seated pose, hand supporting the cheek, face identity, clothing,
bracelet, crossed hair clips, T4 badge and red/blue shoes are retained.

## Outputs

- `assets/liru-refined-v2.png`: ImageGen output, **1024 × 1536 RGBA**. Despite the
  prompt requesting 2048 × 3072, this is the actual returned resolution. Alpha
  ranges 0–254; 55.5% of pixels are fully transparent. Best retention of the
  illustrated face and soft shading.
- `assets/liru-refined-v2.svg`: **12,831 actual vector paths**, 5,194,391 bytes,
  `viewBox="0 0 1024 1536"`, **no `<image>` element or embedded bitmap**. Traced
  with VTracer 0.6.15 on Python 3.12; the system Python 3.14 binding crashed.
  Alpha is thresholded at 50% in an intermediate tracing input to remove faint
  outer haze. Background remains transparent. This file scales without pixel
  interpolation, but tracing visibly simplifies gradients into color regions.
  It is not a lossless recreation of the painted original.
- `assets/liru-refined-v2-vector-2048.png`: **2048 × 3072 RGBA**, rendered from the
  SVG using librsvg. Alpha ranges 0–255; 57.5% of pixels are fully transparent.
  This is a higher-resolution vector render, not newly generated native detail.

Recommendation: compare the raster and vector at the intended homepage size.
Use the edited raster if retaining facial shading is more important than pure
vector scaling; the SVG is available for a visibly more graphic treatment.

Reproduce SVG/render with:

```sh
uv run --python 3.12 --with vtracer python design/home-visual/layer-studio/trace-liru.py
```

No existing asset or homepage source was overwritten by this refinement task.
The character source attribution remains JerrYamada / OCLR, CC BY 4.0 as recorded
in the parent studio README; this is an AI-assisted derived illustration.


## Archived wallpaper method applied

Reviewed the 2026-09-06 archived thread and `WallpaperDemo/Demo1/demos/vector-methods/build.mjs`. Its selected workflow uses color-quantized cumulative masks with Potrace Bezier curves. The earlier fixed-anchor VTracer smoothing was only a limited improvement.

Reprocessed the corrected PNG with coherent 768×1152 tracing input, 64-color quantization, cumulative light-to-dark masks, Potrace alphamax 1.2 / opttolerance .55 / turdsize 2 / unit 1, then SVGO precision 1. Cumulative masks avoid holes between adjacent color regions. Result `liru-smooth-final.svg` is real vector geometry with no embedded image and no blur filter. This was evaluated and rejected in favor of the corrected PNG; SVG variants remain comparison backups. Color shading remains quantized, but contour breaks and tiny fragments are substantially reduced. See `liru-smoothing-final-report.json` for exact raw/gzip sizes. Gzip size is measured potential compression, not a claim about active server Content-Encoding.

Reproduce: `python design/home-visual/layer-studio/smooth-liru.py`, then `npx svgo --input design/home-visual/layer-studio/assets/liru-potrace-smooth-64.svg --output design/home-visual/layer-studio/assets/liru-smooth-final.svg --precision 1`.
