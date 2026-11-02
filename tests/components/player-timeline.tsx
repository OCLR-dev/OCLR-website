import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { PlayerTimeline } from "../../src/components/player-timeline";
import {
  buildPlayerTimeline,
  readSeasonWindows,
} from "../../src/lib/player-timeline";
import windows from "../../src/content/season-timeline.json";
import zhHant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/orbital-theme.css";

const params = new URLSearchParams(location.search);
document.title = "Synthetic player timeline";
document.documentElement.lang = "zh-Hant";
document.documentElement.dataset.theme = params.get("theme") ?? "light";
document.documentElement.dataset.appearance = "orbital-pulse";
const timeline = buildPlayerTimeline({
  editions: params.has("participated")
    ? [
        {
          editionSlug: "s6",
          editionName: "Synthetic S6",
          season: "6",
          matches: [],
        },
      ]
    : [],
  // Keep adjacent seasons far enough apart for a real touch target. All dates
  // and appearances still come from the same source as the profile page.
  windows: readSeasonWindows(windows).filter(
    (window) => window.season >= 5 && window.season <= 7,
  ),
  now: new Date("2022-04-01T00:00:00Z"),
});

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="zh-Hant" messages={zhHant} timeZone="UTC">
    <main className="themed-site" style={{ padding: "160px 24px 24px" }}>
      <PlayerTimeline timeline={timeline} />
      <div className="page" style={{ marginTop: 32 }}>
        <header className="page-heading">
          <h1>S6 · 星環脈衝</h1>
          <p>Synthetic theme heading</p>
        </header>
      </div>
    </main>
  </NextIntlClientProvider>,
);
