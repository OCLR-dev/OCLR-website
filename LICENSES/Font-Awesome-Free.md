# Font Awesome Free download icon

The osu!direct action in `src/components/beatmap-actions.tsx` includes the solid
`download` icon from **Font Awesome Free 5.15.4 by Fonticons, Inc.**

- Source SVG: https://github.com/FortAwesome/Font-Awesome/blob/5.15.4/svgs/solid/download.svg
- Icon license: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- Upstream license and attribution: https://github.com/FortAwesome/Font-Awesome/blob/5.15.4/LICENSE.txt
- Font Awesome: https://fontawesome.com

The path geometry is unchanged. It is embedded as an 18px decorative SVG with
`currentColor` and accessibility attributes instead of loading an icon font.

This matches osu-web's `fas fa-download` choice for its osu!direct button:
https://github.com/ppy/osu-web/blob/master/resources/js/beatmapsets-show/header.tsx
The corresponding dependency is `@fortawesome/fontawesome-free` version
`^5.15.4`: https://github.com/ppy/osu-web/blob/master/package.json.
