import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { DeveloperAccess } from "../../src/components/developer-access";
import { PageHeading } from "../../src/components/ui";
import { useAppTranslations } from "../../src/i18n/shared";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";

const params = new URLSearchParams(location.search);
const locale = params.get("locale") ?? "en";
document.documentElement.dataset.theme = params.get("theme") ?? "light";
document.documentElement.dataset.appearance = "default";
document.documentElement.lang = locale;
function Preview() {
  const tr = useAppTranslations();
  return (
    <main className="themed-site private-site">
      <div className="container page auth-page">
        <PageHeading title={tr("Developer API access")} />
        <DeveloperAccess
          backend="https://oclr.example.test"
          allowedPorts={
            params.has("disabled")
              ? []
              : params.has("restricted")
                ? [3000, 5173]
                : null
          }
          initialTokens={
            params.has("preview")
              ? [
                  {
                    id: "synthetic-access",
                    origin: "http://localhost:3000",
                    ports: [3000, 4000, 5173],
                    scopes: ["identity:read", "tournaments:read"],
                    createdAt: "2026-11-06T13:00:00Z",
                    expiresAt: "2026-11-06T14:00:00Z",
                    revokedAt: "2026-11-06T13:30:00Z",
                  },
                ]
              : []
          }
        />
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider
    locale={locale}
    messages={locale === "zh-Hans" ? hans : locale === "zh-Hant" ? hant : en}
    timeZone="UTC"
  >
    <Preview />
  </NextIntlClientProvider>,
);
