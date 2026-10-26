# R04 slider R geometry

This R is constructed from the supplied osu! editor screenshot, not from a font.
The production asset is transparent, monochrome SVG; the screenshot is retained
only as a separate reference. R03 is unchanged.

## Correct control-point order

The two yellow points are easy to read in the wrong order. In screenshot pixel
coordinates the path is:

| Index | Center | Editor marker | Meaning |
| --- | --- | --- | --- |
| 0 | (122.5, 482.5) | purple | first perfect-circle segment starts |
| 1 | (153.5, 279.5) | yellow | intermediate point of the left stem |
| 2 | (205.5, 81.5) | purple | first segment ends; second perfect-circle segment starts |
| 3 | (419.5, 184.5) | yellow | intermediate point on the right bowl |
| 4 | (178.5, 283.5) | red | second segment ends; linear segment starts |
| 5 | (425.5, 522.5) | yellow | final linear control point |

Centers were measured from the flat-color circular marker pixels. All complete
markers have the same 22 × 22 flat-color bounds; the starting marker is partly
occluded. The inferred subpixel positions have approximately ±0.5 px precision.

The official lazer editor maps `PerfectCurve` to purple, untyped intermediate
points to yellow, and the default linear type to red:
[PathControlPointPiece.cs](https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Osu/Edit/Blueprints/Sliders/Components/PathControlPointPiece.cs).
The implementation of typed segments and three-point circular arcs is in
[SliderPath.cs](https://github.com/ppy/osu/blob/master/osu.Game/Rulesets/Objects/SliderPath.cs).
These sources were inspected to interpret the screenshot, not used to claim that
its original beatmap data was available.

## Geometry

1. Circle through points 0, 1, 2: center `(2061.261883, 674.700091)`, radius
   `1948.265514`. This gives the slightly bowed left stem visible in the reference.
2. Circle through points 2, 3, 4: center `(282.831729, 194.640875)`, radius
   `137.043985`, clockwise major arc. The counter and right bowl follow this arc.
3. Line from point 4 toward point 5. The visible round tail ends **before point 5**.

The last distinction matters: the gold round tail in the screenshot is centered
at `(388.562171, 486.758538)`, or `t = 0.850454135` along the final line. Its center
was fitted while constrained to that line. Extending the visible letter to the
last yellow point would make the reference shape approximately 36 px too tall.
This is consistent with osu!'s `ExpectedDistance` truncating a slider path; the
original stored distance cannot be recovered exactly from a screenshot.

The selected track silhouette is modeled with radius `75.5 px` and rounded joins.
The two end circles use radius `76.25 px` to follow the reference's slightly wider
endpoint skin outlines. These widths describe the selected screenshot silhouette,
not gameplay hitbox sizes. The background, cursor, white control polygon, colored
markers, and the external partial ring around the tail are not part of the main
letter.

The full letter bounds are:

```text
xMin = 46.250000000
yMin = -17.903110124
xMax = 495.375713310
yMax = 563.008538202
viewBox = 46.25 -17.903110124 449.125713310 580.911648326
```

The original screenshot crops the top and bottom. Those missing portions are
completed from the same circular arcs and endpoint circles; they are inferred,
not directly observed pixels. Preserve aspect ratio when placing the letter.

## Files and reproducibility

- `../r-shape.svg`: visible `r-slider-shape` group, using `currentColor`; helpers
  `r-visible-centerline`, `r-full-control-path`, and `r-control-points` are hidden.
- `../r-geometry-review.svg`: 497 × 559 reference-coordinate review, with original
  colors for markers and the last trimmed segment shown dashed.
- `../r-control-points.json`: full measured points, arc centers/radii, path data,
  truncation estimate, bounds, and uncertainty notes.
- `r-reference.png`: unchanged supplied screenshot.
- `build-r-shape.py`: standard-library SVG/JSON generator.
- `verify-r-geometry.py`: numerical reference-outline checks; requires Pillow,
  NumPy, and SciPy. It does not alter the geometry.

```sh
python design/home-visual/revision-04/sources/build-r-shape.py
python design/home-visual/revision-04/sources/verify-r-geometry.py
```

## Verification

The two SVGs were parsed/rendered by `rsvg-convert` and visually checked against
the supplied image. The outline checks sample selected unobscured scanlines,
not the full screenshot. They omit the control-polygon crossing of the counter
at y = 212–222 and scanlines where other overlays erase the stem's flat gold.

| Reference check | Median absolute error | 95th percentile |
| --- | ---: | ---: |
| Left stem outer flat-gold edge | 1.07 px | 1.53 px |
| Upper/right bowl outer flat-gold edge | 1.00 px | 1.47 px |
| Counter inner flat-gold edge | 0.79 px | 1.17 px |
| Upper/right bowl white body edge | 0.20 px | 0.53 px |
| Counter white body edge | 0.53 px | 0.87 px |
| Tail gold-circle fit, 196 edge samples | 0.22 px | 0.43 px |

Gold checks use exact `(255, 204, 34)` pixels, so their edges are about one pixel
inside the reference's antialiased color extent. The 0.22 px tail fit is a local
fit residual; it is **not** a whole-letter accuracy claim. The reconstruction
preserves the observed control topology and positions, but does not claim to
recover the original `.osu` file, hidden metadata, or invisible pixels exactly.
