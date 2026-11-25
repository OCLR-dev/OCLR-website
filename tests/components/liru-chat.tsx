import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import { LiruChatLauncher } from "../../src/components/liru-chat-launcher";
import "../../src/app/tournaments/[edition]/information.css";
function Fixture() {
  const [edition, setEdition] = useState("cup-a");
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <button onClick={() => setEdition("cup-b")}>Switch season</button>
      <main className="public-tournament" style={{ minHeight: "160vh" }}>
        <LiruChatLauncher
          key={edition}
          edition={edition}
          viewer={
            location.search.includes("guest")
              ? null
              : {
                  osuId: location.search.includes("other") ? 1425011 : 1425010,
                  username: "Synthetic player",
                }
          }
        />
      </main>
    </NextIntlClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
