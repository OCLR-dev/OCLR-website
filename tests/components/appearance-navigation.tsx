import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AppearanceProvider } from "../../src/components/appearance-provider";
import { AppearanceControl } from "../../src/components/appearance-control";
import en from "../../messages/en.json";
import "../../src/app/globals.css";

const scopes = [
  {
    slug: "a",
    defaultAppearance: "skyline-pop" as const,
    published: true,
    staff: false,
  },
  {
    slug: "b",
    defaultAppearance: "glacier-blue" as const,
    published: true,
    staff: false,
  },
];
const query = new URLSearchParams();
document.documentElement.dataset.appearance = "default";
function Harness() {
  const [path, setPath] = useState("/");
  return (
    <PathnameContext.Provider value={path}>
      <SearchParamsContext.Provider value={query}>
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          <AppearanceProvider siteDefault="default" scopes={scopes}>
            <AppearanceControl initialAppearance="default" />
            {scopes.map(({ slug }) => (
              <button
                key={slug}
                onClick={() => setPath(`/tournaments/${slug}`)}
              >
                Navigate to {slug}
              </button>
            ))}
          </AppearanceProvider>
        </NextIntlClientProvider>
      </SearchParamsContext.Provider>
    </PathnameContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
