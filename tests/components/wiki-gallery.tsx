import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { WikiGallery } from "../../src/components/wiki-gallery";
import { liruGallery } from "../../src/lib/wiki-articles";
import { english } from "../../src/i18n/translate";
import en from "../../messages/en.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/wiki/wiki.css";

document.documentElement.dataset.theme =
  new URLSearchParams(location.search).get("theme") || "light";
const figures = liruGallery(english).gallery.slice(0, 2);

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <main className="themed-site" style={{ padding: 24 }}>
      <WikiGallery
        title={english("Liru Card Showcase")}
        figures={figures}
        initialIndex={0}
        showAnotherLabel="Show another look"
      />
    </main>
  </NextIntlClientProvider>,
);
