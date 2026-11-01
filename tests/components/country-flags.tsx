import { createRoot } from "react-dom/client";
import { useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { CountryFlag } from "../../src/components/country-flag";
import { PublicPlayerIdentity } from "../../src/components/public-player-identity";
import { CaptainPlayerCard } from "../../src/components/captain-player-card";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/pastel-theme.css";
import "../../src/app/swiss-theme.css";

const params = new URLSearchParams(location.search);
const locale = params.get("locale") ?? "en";
document.documentElement.setAttribute(
  "data-theme",
  params.get("theme") ?? "light",
);
document.documentElement.setAttribute(
  "data-appearance",
  params.get("appearance") ?? "default",
);

function Fixture() {
  const [code, setCode] = useState("US");
  const [renderCount, setRenderCount] = useState(0);
  return (
    <main className="themed-site" style={{ padding: 16, minHeight: "100vh" }}>
      <h1 style={{ fontSize: 24 }}>Country flags</h1>
      <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
        <section className="panel" aria-label="Published team list">
          <PublicPlayerIdentity
            osuId={90000001}
            username="SyntheticLongPlayerNameForMobileLayout"
            countryCode="CN"
            countryName="China"
          />
        </section>
        <section className="panel" aria-label="Captain management">
          <CaptainPlayerCard
            userId={90000002}
            username="Synthetic captain"
            identity={{
              avatarUrl: null,
              countryCode: "KR",
              countryName: "South Korea",
            }}
          />
        </section>
        <section className="panel public-staff-list" aria-label="Staff">
          <h3>
            Synthetic staff <CountryFlag code="TW" />
          </h3>
        </section>
        <section className="panel" aria-label="Compact flag samples">
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {["JP", "GB", "CH", "NP", "EU", "UN", "XK"].map((region) => (
              <CountryFlag key={region} code={region} />
            ))}
            <CountryFlag code="CN" size="small" />
            <CountryFlag code="CN" size="large" />
          </div>
        </section>
        <section className="panel" aria-label="Failure and recovery">
          <div data-testid="recoverable">
            <CountryFlag code={code} />
          </div>
          <button onClick={() => setCode("JP")}>Change country</button>
          <button onClick={() => setRenderCount(renderCount + 1)}>
            Render again
          </button>
          <span>{renderCount}</span>
        </section>
        <div data-testid="invalid">
          {[
            null,
            undefined,
            "",
            "ZZ",
            "XX",
            "../CN",
            "https://example.test/flag.svg",
          ].map((code, i) => (
            <CountryFlag key={i} code={code} />
          ))}
        </div>
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
    <Fixture />
  </NextIntlClientProvider>,
);
