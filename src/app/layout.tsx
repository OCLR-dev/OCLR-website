import { remoteMode } from "@/lib/data-source";
import {
  frontendSite,
  frontendTournaments,
  frontendConnection,
  frontendPrivateTournaments,
} from "@/lib/frontend-data";
import { RemoteDataError } from "@/lib/remote-errors";
import { RemoteBoundary } from "@/components/remote-development";
import type { AppearanceScope } from "@/lib/appearance-scope";
import type { Appearance } from "@/lib/preferences";
import { getPublicEditions } from "@/lib/content";
import { getAppTranslations } from "@/i18n/server";
import type { Metadata } from "next";
import { isStaff } from "@/lib/auth/staff";
import { hasDeveloperAccess } from "@/lib/developer-api";
import { currentUser } from "@/lib/auth/user";
import { SiteFrame } from "@/components/site-frame";
import { Header } from "@/components/header";
import "./globals.css";
import "./public-tournament.css";
import "./workspace.css";
import "./pastel-theme.css";
import "./swiss-theme.css";
import "./clay-theme.css";
import "./manga-theme.css";
import "./glass-theme.css";
import "./esports-theme.css";
import { AppearanceProvider } from "@/components/appearance-provider";
import { inheritedAppearance } from "@/lib/appearance-scope";
import { tournamentAppearanceScopes } from "@/lib/tournaments";
import { cookies, headers } from "next/headers";
import {
  readTheme,
  themeCookie,
  readAppearance,
  appearanceCookie,
  isAppearance,
} from "@/lib/preferences";
import { defaultSiteAppearance } from "@/lib/site-settings";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const tr = await getAppTranslations();
  return {
    icons: {
      icon: [
        {
          url: "/branding/oclr-mark.svg?v=3",
          type: "image/svg+xml",
          sizes: "any",
        },
        ...[16, 32, 48].map((size) => ({
          url: `/branding/oclr-${size}.png?v=3`,
          type: "image/png",
          sizes: `${size}x${size}`,
        })),
      ],
      apple: [
        {
          url: "/branding/oclr-180.png?v=3",
          sizes: "180x180",
          type: "image/png",
        },
      ],
      shortcut: "/branding/oclr-32.png?v=3",
    },
    title: {
      default: "OCLR — osu! Chinese League Rookie",
      template: "%s | OCLR",
    },
    openGraph: {
      title: "OCLR — osu! Chinese League Rookie",
      description: tr(
        "Tournament information, individual registration and the OCLR community.",
      ),
      siteName: "OCLR",
      type: "website",
    },
    twitter: {
      card: "summary",
      title: "OCLR — osu! Chinese League Rookie",
      description: tr(
        "The rookie stage. Individual entry, captain draft and team competition.",
      ),
    },
    description: tr(
      "The home of osu! Chinese League Rookie. Tournament information, individual player registration and the OCLR community.",
    ),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const tr = await getAppTranslations();

  const preferences = await cookies();
  const theme = readTheme(preferences.get(themeCookie)?.value);
  const remote = remoteMode();
  const route = await headers();
  let remoteFailure: string | undefined;
  let defaultAppearance: Appearance = "default";
  if (!remote) defaultAppearance = await defaultSiteAppearance();
  const appearanceValue = preferences.get(appearanceCookie)?.value;
  const appearancePreference = isAppearance(appearanceValue)
    ? appearanceValue
    : undefined;
  const locale = await getLocale();
  let user: Awaited<ReturnType<typeof currentUser>> = null;
  let authUnavailable = false;
  let staff = false;
  let developer = false;
  let scopes: AppearanceScope[] = [];
  let editions: { slug: string; status: string }[] = [];
  if (remote) {
    try {
      const connection = await frontendConnection();
      user = connection.identity?.user ?? null;
      const [site, summaries] = await Promise.all([
        frontendSite(),
        frontendTournaments(),
      ]);
      defaultAppearance = site.defaultAppearance;
      editions = summaries;
      scopes = summaries.map((e) => ({
        slug: e.slug,
        published: true,
        staff: false,
        defaultAppearance: e.defaultAppearance,
      }));
      if (
        connection.identity?.access.scopes.includes("tournaments:private:read")
      ) {
        const internal = await frontendPrivateTournaments();
        scopes = [
          ...scopes.filter((e) => !internal.some((i) => i.slug === e.slug)),
          ...internal.map((e) => ({
            slug: e.slug,
            published: e.published,
            staff: true,
            defaultAppearance: e.defaultAppearance,
          })),
        ];
      }
    } catch (error) {
      remoteFailure =
        error instanceof RemoteDataError ? error.code : "REMOTE_UNAVAILABLE";
      user = null;
    }
  } else {
    try {
      user = await currentUser();
      staff = user ? await isStaff(user) : false;
      developer = user ? await hasDeveloperAccess(user.osuId) : false;
    } catch {
      authUnavailable = true;
    }
    [scopes, editions] = await Promise.all([
      tournamentAppearanceScopes(user),
      getPublicEditions().catch(() => []),
    ]);
  }
  const featured =
    editions.find((edition) => edition.status === "live") ??
    editions.find((edition) => edition.status === "upcoming");
  const informationHref = featured
    ? `/tournaments/${featured.slug}`
    : "/tournaments";
  const inherited = inheritedAppearance(
    route.get("x-oclr-pathname") ?? "/",
    new URLSearchParams(route.get("x-oclr-search") ?? ""),
    scopes,
    defaultAppearance,
  );
  const appearance = readAppearance(appearanceValue, inherited.appearance);
  return (
    <html lang={locale} data-theme={theme} data-appearance={appearance}>
      <body>
        <NextIntlClientProvider>
          <AppearanceProvider
            siteDefault={defaultAppearance}
            scopes={scopes}
            initialPreference={appearancePreference}
          >
            <SiteFrame>
              <a className="skip-link" href="#main">
                {tr("Skip to content")}
              </a>
              <Header
                remote={remote}
                informationHref={informationHref}
                theme={theme}
                appearance={appearance}
                defaultAppearance={defaultAppearance}
                appearancePreference={appearancePreference}
                user={
                  user
                    ? {
                        osuId: user.osuId,
                        username: user.username,
                        staff,
                        developer,
                      }
                    : null
                }
              />
              {authUnavailable && (
                <div className="container">
                  <p className="notice" role="status">
                    {tr(
                      "Sign-in is temporarily unavailable. Public tournament information remains accessible.",
                    )}
                  </p>
                </div>
              )}
              <main id="main">
                {remote ? (
                  <RemoteBoundary error={remoteFailure}>
                    {children}
                  </RemoteBoundary>
                ) : (
                  children
                )}
              </main>
              <footer className="site-footer">
                <p>
                  © {new Date().getUTCFullYear()}{" "}
                  <a
                    className="footer-credit"
                    href="https://osu.ppy.sh/users/1176704"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {"Lapis"}
                  </a>{" "}
                  {"· OCLR — osu! Chinese League Rookie"}
                </p>
                <a
                  className="footer-credit"
                  href="https://github.com/PhoenixEmik/OCLR-website"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {tr("GitHub")}
                </a>
              </footer>
            </SiteFrame>
          </AppearanceProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
