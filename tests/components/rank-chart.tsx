import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { RankChart } from "../../src/components/rank-chart";
import en from "../../messages/en.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";

// Synthetic rank history: a slow climb with noise, newest sample last.
let rank = 16200;
const history = Array.from({ length: 120 }, (_, index) => {
  rank -= 24;
  rank += index % 7 === 0 ? 180 : -Math.round(index % 5) * 12;
  return Math.max(1, rank);
});
const params = new URLSearchParams(location.search);
const gaps = params.get("gaps");
// Explicit normalized fixtures; normalization/cache contracts are tested in Vitest.
const sample =
  gaps === "two"
    ? { data: [16200, 15000], dayOffsets: [-3, 0] }
    : gaps === "trailing"
      ? { data: [16200], dayOffsets: [-3] }
      : gaps === "one"
        ? { data: [16200, 15500, 15000], dayOffsets: [-3, -1, 0] }
        : { data: [16200, 15900, 15500, 15000], dayOffsets: [-3, -2, -1, 0] };

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <main style={{ padding: 24 }}>
      {/* The real layout wraps every page in .themed-site; tokens live there. */}
      <div className="themed-site">
        <section className="panel profile-summary">
          <div className="profile-body">
            <div className="rank-chart-card">
              <RankChart
                data={gaps ? sample.data : history}
                dayOffsets={gaps ? sample.dayOffsets : undefined}
                globalRank={gaps ? 15000 : 12345}
                observedAt={
                  new URLSearchParams(location.search).has("undated")
                    ? null
                    : gaps
                      ? "2026-11-04T09:00:00Z"
                      : "2026-11-01T23:30:00Z"
                }
              />
            </div>
            <dl className="profile-statistics">
              {[
                ["Accuracy", "97.25%"],
                ["Play count", "48,120"],
                ["Total hits", "9,876,543"],
                ["Play time", "302 days 4 hours"],
                ["Ranked score", "9,007,199,254,740,993"],
                ["Total score", "987,654,321"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </div>
    </main>
  </NextIntlClientProvider>,
);
