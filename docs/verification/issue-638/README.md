# #638 Liru character-sheet card

Homepage hero on the local test database, default theme,
`prefers-reduced-motion: reduce` for the still frames. Simplified Chinese unless
the file name ends in `-en`.

|                                         | Idle                        | Card open                                        |
| --------------------------------------- | --------------------------- | ------------------------------------------------ |
| Desktop 1920×990, mouse on Liru         | ![](desktop-1920-idle.webp) | ![](desktop-1920-hover.webp)                     |
| Desktop 1280×720, English               |                             | ![](desktop-1280-hover-en.webp)                  |
| iPhone 13 (390×664), after tapping Liru | ![](phone-idle.webp)        | ![](phone-tapped.webp) ![](phone-tapped-en.webp) |

Interaction tests: `tests/e2e/home-liru-card.spec.ts`.
