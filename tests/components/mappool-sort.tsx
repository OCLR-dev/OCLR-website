import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { MappoolBrowser } from "../../src/components/mappool-browser";
import { syntheticPublicPools } from "../fixtures/public-mappools";
import en from "../../messages/en.json";

const pool = syntheticPublicPools[0];
const titles = ["Zeta", "Alpha", "Middle", "Beta", "Gamma", "Delta"];
const stars = [2, 8, 4, 6, 5, 3];
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <MappoolBrowser
      slug="synthetic"
      pool={{
        ...pool,
        entries: pool.entries
          .slice(0, location.search.includes("fm") ? 6 : 4)
          .map((entry, index) => ({
            ...entry,
            metadata: {
              ...entry.metadata,
              title: titles[index],
              stars: stars[index],
              attributes: entry.metadata.attributes
                ? { ...entry.metadata.attributes, stars: 10 }
                : undefined,
            },
          })),
      }}
    />
  </NextIntlClientProvider>,
);
