import {
  readAppearance,
  readSiteAppearance,
  type Appearance,
} from "./preferences";
import { isBroadcastPage } from "./public-navigation";
export type AppearanceScope = {
  slug: string;
  defaultAppearance: Appearance | null;
  published: boolean;
  staff: boolean;
};
/** A presentation projection only. Authorization stays in server pages/services. */
export function inheritedAppearance(
  path: string,
  query: URLSearchParams,
  scopes: AppearanceScope[],
  siteDefault: Appearance,
) {
  siteDefault = readSiteAppearance(siteDefault);
  if (isBroadcastPage(path, query.get("presenter") === "1"))
    return { appearance: siteDefault, edition: false };
  const route =
    /^\/(admin\/)?tournaments\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/.exec(path);
  const slug =
    route?.[2] ??
    (/^\/players\/[1-9]\d*\/?$/.test(path) ? query.get("edition") : null);
  const scope = scopes.find(
    (s) => s.slug === slug && (route?.[1] ? s.staff : s.published),
  );
  return {
    appearance: readAppearance(
      scope?.defaultAppearance ?? undefined,
      siteDefault,
    ),
    edition: Boolean(scope),
  };
}
