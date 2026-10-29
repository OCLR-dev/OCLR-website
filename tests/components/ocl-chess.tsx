import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import { ChessCanvas } from "../../src/app/games/ocl-chess/workspace";
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <ChessCanvas />
  </NextIntlClientProvider>,
);
