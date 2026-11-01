# Mobile header scroll visibility — #646

The organizer's 2026-11-01 phone Safari report showed the header covering content
while reading down the page. The fix applies through 760px: keep the first 96px
visible, hide after 40px downward travel beyond that area, and reveal after 12px
reverse travel or on returning near the top. Movement uses a transform, retaining
the header's layout height so content does not jump.

Open navigation/account/preference menus and keyboard focus protect the header.
Routes, page restoration and switching breakpoints reveal it. Mobile browser
chrome height changes preserve the current visibility. Out-of-range Safari
scroll readings are clamped so bouncing at the bottom is not interpreted as
reverse travel. Reduced-motion mode disables the slide. Tournament context and
rule-index offsets follow the visible header height; desktop stays sticky.

## Local verification

Node 24.22.2, fresh npm installation, synthetic client-component browser host;
no production credentials or database access.

- `npm run check`, full `npm test`, production build and format/diff checks passed.
  Full test invocation: 1,466 passed, 669 skipped (no isolated DB configured).
- New scroll regressions: 10 Chromium desktop/mobile cases and five WebKit phone
  cases passed. They cover direction thresholds, small reverse movement, stable
  content position, viewport-height changes, menus, keyboard focus, desktop and
  route reset, page restoration, reduced motion, injected overscroll readings
  and the actual tournament context bar.
- Existing Header dropdown regressions: six desktop/mobile Chromium tests passed,
  including all 19 appearances in light/dark with rotating locales and account
  identities, preference cookies and remote account navigation.
- Initial WebKit failures exposed subpixel coordinate differences and platform
  Tab behavior; assertions use subpixel tolerance and explicitly focus the header
  control following keyboard input. A later resize test waited for asynchronous
  viewport events before starting the next gesture. The final runs above passed.
- Read API generators introduced no differences; contract checks passed (56
  contracts, 174 coverage rows and eight tests). Production audit: zero findings.
- The full suite ran on the patch over `d0f4be86`; the final branch incorporated
  `6d8f910a` (an independent schedule-button CSS/class update), followed by another
  check/build and contract verification. Existing edits in the organizer's
  original checkout were preserved.

Safari-style readings are injected by the test; this does not claim physical
device gesture or full authenticated/DB E2E acceptance. The issue remains open
for organizer review. No merge or deployment is included in this issue's work.
