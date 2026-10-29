import { createRoot } from "react-dom/client";
import { useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { PlayerMessageBoard } from "../../src/components/player-message-board";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";

function Harness() {
  const [locale, setLocale] = useState(
    new URLSearchParams(location.search).get("locale") ?? "en",
  );
  const [playerId, setPlayerId] = useState(190004);
  return (
    <>
      <button onClick={() => setLocale("zh-Hans")}>Switch locale</button>
      <button onClick={() => setPlayerId(190005)}>Switch player</button>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "en" ? en : locale === "zh-Hans" ? hans : hant}
        timeZone="UTC"
      >
        <PlayerMessageBoard
          key={playerId}
          edition="synthetic-test"
          playerId={playerId}
          name="Synthetic Player"
          signedIn
          viewerId={190001}
        />
      </NextIntlClientProvider>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
