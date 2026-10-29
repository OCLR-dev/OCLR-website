import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { BracketCanvas } from "../../src/components/bracket-canvas";
import { archiveBracket } from "../../src/lib/archive-bracket";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import archive from "../../docs/imports/s8-archive.json";
import en from "../../messages/en.json";
import "../../src/app/globals.css";
const bracket = archiveBracket(
  historicalArchiveSchema.parse(archive),
  (id) => `#${id}`,
)!;
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en}>
    <BracketCanvas
      group={bracket.groups[0]}
      editionSlug="s8"
      showAppearanceLinks
    />
  </NextIntlClientProvider>,
);
