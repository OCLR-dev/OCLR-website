# #278 Localized Information page guidance

The two interface-guidance sentences in the introductory Wiki article now use the existing next-intl helper and ICU parameters. The parameter comes from `tr("Information page")`, exactly as in the Header/home entry. Article text, source attribution, community names, QQ number and URLs remain literal.

`npm run i18n:extract`, `npm run test:i18n` (4 checks) and three locale-specific guidance tests passed. Tests verify the matching entry name, replaced parameters, absence of English residue in Chinese guidance, and unchanged community identity/link data.

Actual same-page visual previews were captured in zh-Hans/zh-Hant/en at desktop/mobile widths; screenshots inspected. Examples: [desktop Simplified](desktop-zh-Hans.png), [mobile Traditional](mobile-zh-Hant.png), [mobile English](mobile-en.png). Chinese guidance reuses the existing approved entry term; the surrounding new catalog sentences await organizer review.

`git diff --check` passed. Local e2e skipped at organizer request; combined non-e2e/CI results are reported in the PR.
