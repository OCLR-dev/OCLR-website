# Country flags (#694)

OCLR uses the same **Twemoji SVG artwork** as osu!, served from the application's
own `/flags/twemoji/` static assets. Flag rendering never downloads from osu!, a
CDN or a provider API. The component takes the existing saved country code;
identity/publication checks and profile lookup behavior remain with its callers.

## Source, format and permission

Reviewed osu-web revision: `4fda1477412a11dbb589a9107cbbfd0c7a25a29a`.

- [webpack.config.js](https://github.com/ppy/osu-web/blob/4fda1477412a11dbb589a9107cbbfd0c7a25a29a/webpack.config.js)
  copies `@discordapp/twemoji/dist/svg/1f1??-1f1??.svg` to `images/flags/`.
- [yarn.lock](https://github.com/ppy/osu-web/blob/4fda1477412a11dbb589a9107cbbfd0c7a25a29a/yarn.lock)
  resolves `@discordapp/twemoji` to **16.0.1**.
- [flag-country.tsx](https://github.com/ppy/osu-web/blob/4fda1477412a11dbb589a9107cbbfd0c7a25a29a/resources/js/components/flag-country.tsx)
  uses regional-indicator filenames under `/assets/images/flags/`.
- A direct download of osu!'s
  [CN SVG](https://osu.ppy.sh/assets/images/flags/1f1e8-1f1f3.svg) on 2026-11-02
  was byte-identical to the pinned package's file. This confirms that sample,
  not a claim that every deployed file was compared.

The npm package records source revision
`8892014e679439b19dc0f453de0a312c6e289a26` in
[discord/twemoji](https://github.com/discord/twemoji/tree/8892014e679439b19dc0f453de0a312c6e289a26).
Its [README](https://github.com/discord/twemoji/blob/8892014e679439b19dc0f453de0a312c6e289a26/README.md)
explicitly distinguishes MIT code from **CC BY 4.0 graphics**, and accepts
attribution in a project README. The graphics
[license](https://github.com/discord/twemoji/blob/8892014e679439b19dc0f453de0a312c6e289a26/LICENSE-GRAPHICS)
permits copying, redistribution and adaptation with attribution. OCLR retains
credit, source, license links and the full license text in the public
[NOTICE](../public/flags/twemoji/NOTICE.md), and credits Twemoji in the README.
Only unmodified upstream SVGs are vendored; no AGPL osu-web code/CSS is reused.

All 259 SVGs have a **36 × 36 viewBox**, including transparent padding around
rectangular and nonrectangular flags. They total 716,477 bytes (before transport
compression). SVG preserves the original paths at small and high DPI sizes;
PNG/WebP would require rasterization and multiple densities. The native SVG
canvas, original flag proportions and colors are preserved with `object-fit:
contain`; osu-web's CSS effects and forced aspect ratio are not copied.

## Component contract

`CountryFlag({code, size?, decorative?})` uses the same API on server-rendered
pages and in client cards. Sizes are `small` (18px canvas), `medium` (24px,
default) and `large` (32px). The fixed intrinsic canvas reserves space before
loading. Its own CSS module applies on public, dashboard and Admin routes.

ASCII two-letter codes are trimmed and uppercased, then resolved through the
committed allowlist. The set includes upstream regions such as AC, EA, IC, TA,
XK, EU and UN; UK is not silently remapped to GB. There are no guessed aliases.
ZZ, unknown codes and malformed/missing values render nothing and request no
asset. `Intl.DisplayNames` supplies the localized name (English on a malformed
locale; the exact code if the runtime lacks a region name).

An image error replaces the image once with a neutral two-letter country code
in the same reserved canvas. It cannot retry until the code changes or the
component is remounted. It never substitutes another country or an OS emoji.
Meaningful flags have a localized accessible name using the existing message;
callers with adjacent country text pass `decorative` to avoid duplicate speech.

## Integration inventory

| Surface / route                                          | Integration                                                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/about` public staff                                    | Existing `CountryFlag`, meaningful standalone flag beside staff name                                                                    |
| `/tournaments/:edition/teams/:teamId` member/coach lists | `PublicPlayerIdentity`, decorative flag beside existing country text                                                                    |
| Coach management                                         | Same `PublicPlayerIdentity`                                                                                                             |
| Captain management / draft pool cards                    | `CaptainPlayerCard`; replaces independent emoji generation, keeps existing lookup policy                                                |
| `/dashboard` identity                                    | Replaces independent emoji generation using the existing snapshot                                                                       |
| `/players/:osuId` country line                           | Adds shared flag beside the existing saved country text                                                                                 |
| `/tournaments/:edition/players`, historical roster cards | Currently have no flag or country field in their public directory projection; no extra profile requests or inferred countries are added |
| Individual/series/statistics leaderboards                | Currently have no flag or country field in their score/rating projections; no alternative flag renderer remains to migrate              |

The last two rows document the current data limits. Adding new country metadata
to those public read contracts is separate from replacing existing flag styles;
future flag rendering must reuse this component. Cross-season career/leaderboard
feature #566 remains tracked separately.

## Reproducing / updating the assets

No npm runtime dependency is needed. In a temporary directory, run
`npm pack @discordapp/twemoji@16.0.1`, verify the tarball's SHA-512 against the
public NOTICE, and extract it. Retrieve `LICENSE-GRAPHICS` from the pinned source
revision (the npm package omits this file), then run from the repository:

```sh
node --import tsx scripts/vendor-country-flags.ts /tmp/extracted/package /tmp/LICENSE-GRAPHICS
```

The script validates the package identity/version, regional filenames, inert SVG
content and dimensions, copies bytes unchanged, and regenerates the runtime
allowlist and public per-file SHA-256 manifest. For an upgrade, review osu!'s
current pinned version and the asset license again, update the script's explicit
version/count/dimension guards, and review the regenerated set and NOTICE.
Commit both manifests, SVGs and licenses together. Normal Next.js static-asset
packaging serves them; no download step is added to build, start or deploy.

Unit tests verify the full asset set, checksums, dimensions, safe paths and
locale/code handling. The focused component browser test exercises image errors,
code changes, accessibility, external-request blocking and responsive geometry.
It is separate from ordinary CI's existing E2E policy. Run the opt-in matrix
with `npx playwright test --config playwright.country-flags.config.ts`; it covers
Chromium, Firefox, desktop WebKit and mobile WebKit without changing default CI.
