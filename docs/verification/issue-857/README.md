# #857 Liru character-sheet bubble

Homepage hero, local dev server, no database. The card frames are taken with
the pointer or keyboard on Liru (desktop) or with the touch prompt open
(phone). Simplified Chinese unless the file name ends in `-en`. Light theme
unless the file name includes `dark`.

The bubble keeps the link to `/wiki/liru`, the hover, focus and touch behaviour
from #638, and the same window size in each before/after pair.

|                                     | Before                             | After                             |
| ----------------------------------- | ---------------------------------- | --------------------------------- |
| Desktop 1920×990, light             | ![](desktop-1920-before.webp)      | ![](desktop-1920-after.webp)      |
| Desktop 1920×990, dark              | ![](desktop-1920-dark-before.webp) | ![](desktop-1920-dark-after.webp) |
| Desktop 1280×720, English, light    | ![](desktop-1280-en-before.webp)   | ![](desktop-1280-en-after.webp)   |
| Phone 390×844, light, after tapping | ![](phone-before.webp)             | ![](phone-after.webp)             |

What changed: the border is a 1.5px line with a 14px radius, the label and
arrow sit on one row, and the tail is a separate shape whose fill matches the
bubble and whose tip meets the chibi outline.
