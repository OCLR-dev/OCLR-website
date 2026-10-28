# Optional loading artwork by appearance

The shared spinner supports static images and GIFs without changing the loading
state, overlay scope or accessibility behavior. All appearances currently use
the existing ring: `src/lib/spinner-artwork.ts` deliberately exports an empty
configuration. No mascot artwork is enabled by this change.

## Adding artwork later

1. Add repository-owned files under `public/branding/spinners/` (PNG, WebP, SVG
   or GIF). Public paths in configuration start with `/branding/spinners/`.
2. Add an entry for an existing `Appearance` in
   `src/lib/spinner-artwork.ts`. Give the artwork a stable display width/height.
3. For animation, provide a still `reducedMotionSrc` when available. It must be
   a non-animated image. Otherwise reduced-motion visitors keep the static ring.

Example configuration only; these files and entries are not installed:

```ts
export const spinnerArtwork: Readonly<
  Partial<Record<Appearance, SpinnerArtwork>>
> = {
  "cute-pastel": {
    src: "/branding/spinners/pastel-mascot.gif",
    width: 96,
    height: 96,
    reducedMotionSrc: "/branding/spinners/pastel-mascot-still.png",
  },
  "swiss-minimal": {
    src: "/branding/spinners/swiss-mascot.svg",
    width: 80,
    height: 80,
  },
};
```

GIF/APNG file extensions are recognized as animated. Set `animated: true` for
other animated formats, such as animated WebP. Static artwork works under reduced
motion without a separate still image.

The existing `AppearanceProvider` selects the configuration using the resolved
appearance: manual visitor preference, then the applicable tournament default,
then the site default. This also applies to edition-scoped player URLs. There is
no new preference cookie, theme registration, upload screen or backend setting.
Unconfigured appearances continue to use the ring and existing theme colours.

## Rendering and fallback

- `Spinner` is the single shared entry point for both `LoadingOverlay` and
  `LoadingRegion`. Individual pages do not select or duplicate artwork.
- Artwork is decorative; the parent status/overlay provides the existing
  translated loading announcement.
- Images use `object-fit: contain`, preserving transparency and proportions.
  They do not inherit the ring's rotation. GIFs play their own embedded animation.
- `next/image` uses `unoptimized`, so GIFs are served as their original resource
  rather than being transformed by the image optimizer. The existing image CSP
  is unchanged; use repository-owned public assets.
- While artwork is loading, or if it fails, the shared ring stays visible inside
  the artwork's reserved space. Switching appearances resets loading/error state.
- A native `picture` media source selects a still image for reduced motion. For
  animation without a still, a transparent, non-animated candidate prevents GIF
  downloads while CSS shows the static ring instead.
- Forced-colour mode selects the non-animated candidate and renders the ring with
  system colours. This preserves feedback when an illustration is unsuitable for
  the visitor's contrast settings.

The ring's existing dimensions, palette, animation and reduced-motion behavior
are unchanged when an appearance has no artwork entry.
