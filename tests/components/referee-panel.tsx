import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { RefereePanel } from "../../src/components/referee-panel";
import { workspace } from "./referee-panel-data";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";
const params = new URLSearchParams(location.search),
  locale = params.get("locale") ?? "en";
document.documentElement.dataset.theme = params.get("theme") ?? "dark";
const data = workspace();
data.canRecord = !params.has("readonly");
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider
    locale={locale}
    messages={locale === "zh-Hant" ? hant : locale === "zh-Hans" ? hans : en}
    timeZone="UTC"
  >
    <main className="themed-site private-site">
      <RefereePanel
        data={data}
        slug="synthetic"
        simulation={params.has("simulation")}
      />
    </main>
  </NextIntlClientProvider>,
);
