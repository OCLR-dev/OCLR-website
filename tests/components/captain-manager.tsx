import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CaptainManager } from "../../src/components/captain-manager";
import { StaffReadOnlyContext } from "../../src/components/staff-read-only";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";
import "../../src/app/pastel-theme.css";
import "../../src/app/swiss-theme.css";

type Setup = Parameters<typeof CaptainManager>[0]["setup"];
const params = new URLSearchParams(location.search);
const locale = params.get("locale") || "en";
document.documentElement.lang = locale;
document.documentElement.dataset.theme = params.get("theme") || "light";
document.documentElement.dataset.appearance =
  params.get("appearance") || "default";
const candidates = Array.from(
  { length: Number(params.get("count") || 76) },
  (_, i) => ({
    userId: 400000001 + i,
    username: `Synthetic Player ${String(i + 1).padStart(2, "0")}`,
    unavailableReason: null,
  }),
);
const initial: Setup = {
  version: 4,
  locked: params.has("locked"),
  availabilityLocked: params.has("locked"),
  poolPublished: params.has("publication"),
  captains:
    params.has("publication") || params.has("unappoint")
      ? [
          {
            userId: 399999999,
            username: "Synthetic Captain",
            position: 1,
            published: false,
            teamId: params.has("team") ? "synthetic-team" : null,
            teamName: params.has("team") ? "Synthetic team" : null,
          },
        ]
      : [],
  candidates,
  pool: candidates,
};
const identities = Object.fromEntries(
  [...initial.captains, ...candidates].map((p) => [
    p.userId,
    {
      avatarUrl: null,
      countryCode: "CN",
      countryName: "China",
    },
  ]),
);

function Fixture() {
  const [setup, setSetup] = useState(initial);
  const appointed = useRef<number | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      appointed.current = (event as CustomEvent<number>).detail;
    };
    window.addEventListener("synthetic-appointment", receive);
    return () => window.removeEventListener("synthetic-appointment", receive);
  }, []);
  const router: AppRouterInstance = {
    back() {},
    forward() {},
    refresh() {
      const id = appointed.current;
      if (id === null) return;
      appointed.current = null;
      setSetup((previous) => {
        const player = previous.pool.find((p) => p.userId === id)!;
        return {
          ...previous,
          version: previous.version + 1,
          pool: previous.pool.filter((p) => p.userId !== id),
          captains: [
            ...previous.captains,
            {
              userId: id,
              username: player.username,
              position: previous.captains.length + 1,
              published: false,
              teamId: null,
              teamName: null,
            },
          ],
        };
      });
    },
    push() {},
    replace() {},
    prefetch() {},
    bfcacheId: "synthetic",
  };
  return (
    <AppRouterContext.Provider value={router}>
      <NextIntlClientProvider
        locale={locale}
        messages={
          locale === "zh-Hans" ? hans : locale === "zh-Hant" ? hant : en
        }
        timeZone="UTC"
      >
        <StaffReadOnlyContext value={params.has("readonly")}>
          <main
            className="themed-site private-site"
            style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}
          >
            <h1>Captain setup</h1>
            <CaptainManager
              slug="synthetic"
              setup={setup}
              identities={identities}
            />
          </main>
        </StaffReadOnlyContext>
      </NextIntlClientProvider>
    </AppRouterContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
