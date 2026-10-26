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
import "./arcade-theme.css";
import "./frutiger-theme.css";
import "./skyline-theme.css";
import "./glacier-theme.css";
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
                    href="https://github.com/OCLR-dev"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {"OCLR Dev Team."}
                  </a>{" "}
                  {"· OCLR — osu! Chinese League Rookie"}
                </p>
                <p className="glacier-attribution">
                  {tr(
                    "Touhou Project fan art · Cirno © Team Shanghai Alice / ZUN",
                  )}
                </p>
                <div className="footer-actions">
                  <a
                    className="footer-credit footer-action"
                    href="https://github.com/OCLR-dev/OCLR-website/issues/new"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {tr("Report an issue")}
                  </a>
                  <a
                    className="footer-credit footer-action footer-github"
                    href="https://github.com/OCLR-dev/OCLR-website"
                    aria-label={tr("GitHub repository")}
                    title={tr("GitHub repository")}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {/*
                      GitHub mark from Primer Octicons.
                      MIT License — Copyright (c) 2026 GitHub Inc.

                      Permission is hereby granted, free of charge, to any person obtaining a copy
                      of this software and associated documentation files (the "Software"), to deal
                      in the Software without restriction, including without limitation the rights
                      to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
                      copies of the Software, and to permit persons to whom the Software is
                      furnished to do so, subject to the following conditions:

                      The above copyright notice and this permission notice shall be included in all
                      copies or substantial portions of the Software.

                      THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
                      IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
                      FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
                      AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
                      LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
                      OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
                      SOFTWARE.
                    */}
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
                    </svg>
                  </a>
                </div>
              </footer>
            </SiteFrame>
          </AppearanceProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
