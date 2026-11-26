import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import { SiteLiruChat } from "../../src/components/liru-chat-launcher";
import type { ChatEdition } from "../../src/lib/chat-edition";

const editions: ChatEdition[] = [
  { slug: "future-cup", name: "Future Cup", season: "12", status: "upcoming" },
  { slug: "cup-a", name: "Current Cup", season: "11", status: "live" },
  { slug: "cup-b", name: "Archived Cup", season: "10", status: "completed" },
];

function Fixture() {
  const [path, setPath] = useState("/wiki/liru");
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <button onClick={() => setPath("/tournaments/cup-b/mappools/final")}>
        Switch season
      </button>
      <button onClick={() => setPath("/tournaments/cup-b/draft/overlay")}>
        Open overlay
      </button>
      <button onClick={() => setPath("/tournaments/cup-b/chat")}>
        Open full chat
      </button>
      <main style={{ minHeight: "160vh" }} />
      <SiteLiruChat
        path={path}
        query={null}
        editions={editions}
        viewer={
          location.search.includes("guest")
            ? null
            : {
                osuId: location.search.includes("other") ? 1425011 : 1425010,
                username: "Synthetic player",
              }
        }
      />
    </NextIntlClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
