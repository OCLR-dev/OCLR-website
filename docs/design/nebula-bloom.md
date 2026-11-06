# S11 · 星雲初綻 — Nebula Bloom (#858)

`nebula-bloom` adapts the native purple MainSheet to the organizer's current
S11 nebula and Chinese-outfit Liru artwork. The visual direction is a calm
lavender reading surface opening onto an indigo sky, with jade used sparingly
to connect the interface to Liru's fan and clothing.

## Continuity with the default

The native system font, type scale, rounded panels, capsule actions, navigation,
44px controls and page structure remain the starting point. As with the
historical season themes, semantic MainSheet tokens serve public pages, player
and Captain tools, staff workspaces and body-level dialogs. The theme is a
scoped stylesheet rather than a parallel component system.

| Surface                       | Native MainSheet              | S11 adaptation                                                                          |
| ----------------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| Light page / reading surface  | Pale purple / white           | `#f5f2fa` / white, with lavender raised surfaces                                        |
| Dark page / reading surface   | Blue-black / blue-gray        | `#141020` / `#20192f`, layered indigo-purple                                            |
| Light primary action          | Native purple                 | `#70409c`, white text                                                                   |
| Dark primary action           | Native purple                 | Pale lavender `#cfacf1`, deep purple text                                               |
| Page heading                  | Plain title area              | Pure purple nebula background, pale text and a dark reading wash in both modes          |
| Small identifiers             | Purple                        | Jade eyebrow and active navigation dot; text and current-state semantics remain visible |
| Tables, map parameters, rules | Stable data surfaces          | Solid surfaces, lavender table headers, tabular numerals                                |
| Motion                        | Native short control feedback | 180ms heading entrance and 140ms navigation feedback; removed for reduced motion        |

Page banners use the existing pure purple nebula sky as their background, with
pale headings, lavender supporting text and a mint eyebrow. A dark reading wash
preserves text contrast while leaving the star field visible in both modes.
The mappool layout follows its real page: title banner, then pool controls and
data. Its design preview previously inserted a full key-visual poster; the
organizer's correction removes that extra composition. The separate tournament
overview retains its existing artwork placement and matching edge/radius.
Long text wraps within the heading; mobile padding is 24px. Forms use a stronger
control edge in both modes. Forced colors remove the heading image and preserve
explicit selected outlines.

## Registration and naming

- Add `nebula-bloom` to `seasonAppearances` and the on-demand stylesheet registry.
  An authorized edition Admin can choose it in the existing tournament settings.
- The public appearance list and site-default write policy follow #445.
  Preference resolution, server publication checks and broadcast isolation use
  their existing paths.
- The shared `appearanceLabel` source is **S11 · Nebula Bloom** (English),
  **S11 · 星云初绽** (Simplified Chinese) and **S11 · 星雲初綻** (Traditional Chinese).
- The S11 record in `season-timeline.json` references the new appearance. Its
  dates, participation and links continue to come from the existing timeline
  model. The label depends on S11 identity, including when the viewer uses the
  default appearance. Accent and artwork registries use the same season ID.
- Tournament configuration stores the appearance through the existing validated
  edition JSON. No database schema migration or default-setting data update is
  needed. Generated read schemas/OpenAPI include the new allowed edition value.

## Assets and design review

The heading uses `/branding/home-hero/nebula-v2-1600.webp`, the same sky as the
current homepage. Existing responsive S11 key-visual exports retain their
lettering and Liru composition. See the [current source/export ledger](../../design/home-visual/s11-assets/README.md#current-homepage-artwork--2026-11-03-754)
and [homepage credits](../../public/branding/README.md#layered-homepage-hero--2026-10-31-233).
Liru's original design is by **JerrYamada**, **CC BY 4.0**; the ledger records the
AI-assisted adaptations and source resolution limits.

[Comparison previews and verification](../verification/issue-858/README.md)
use actual page components and isolated synthetic records. Organizer review of
the design and its Chinese naming remains the acceptance step; setting an S11
default, publication and deployment require their own instruction.
