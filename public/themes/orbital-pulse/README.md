# S6 Orbital Pulse assets

`orbital-field-light.svg` and `orbital-field-dark.svg` are the complete,
self-contained page-heading backgrounds. They combine the existing circuit
linework and analysed music spectrum in a transparent 640 × 240 canvas.
The spectrum stays in the centre so a card using `background-size: cover`
retains it. Each file contains its own SVG geometry and makes no external request.

The S6 theme and `src/lib/season-artwork.ts` use this same light/dark pair, as
other season themes do. The player timeline and participated-tournament cards
therefore receive the complete background, including for a timeline season in
which the player did not participate.

Regenerate the pair after changing the source circuit or spectrum assets:

```sh
node --import tsx scripts/generate-orbital-field.ts
```

The original circuit files and `music-spectrum.svg` remain the drawing sources.
Spectrum attribution and analysis are recorded in the
[S6 design notes](../../../docs/design/season-themes/s6/DESIGN.md).
The original tournament key visual is separate, at `/archive/s6/key-visual.webp`.
