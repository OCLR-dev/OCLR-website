import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { GitHubMark } from "@/components/github-mark";
import "./shell.generated.css";
import { appearanceStylesheet } from "@/lib/appearance-styles";
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
import { getAppTranslations } from "@/i18n/server";
import type { Metadata } from "next";
import "./content-layout.css";
import { isStaff } from "@/lib/auth/staff";
import { hasStreamingMenuAccess } from "@/lib/streaming-api";
import { hasDeveloperAccess } from "@/lib/developer-api";
import { currentUser } from "@/lib/auth/user";
import { SiteFrame } from "@/components/site-frame";
import { Header } from "@/components/header";
import { AppearanceProvider } from "@/components/appearance-provider";
import { inheritedAppearance } from "@/lib/appearance-scope";
import { tournamentAppearanceScopes } from "@/lib/tournaments";
import { cookies, headers } from "next/headers";
import {
  readThemePreference,
  readTheme,
  resolveTheme,
  themeCookie,
  systemThemeCookie,
  themeScript,
  readVisitorAppearance,
  readSiteAppearance,
  appearanceCookie,
  isPublicAppearance,
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
          url: `/branding/oclr-${size}.webp?v=3`,
          type: "image/webp",
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
      shortcut: "/branding/oclr-32.webp?v=3",
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

async function RootLayoutContent({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const tr = await getAppTranslations();

  const preferences = await cookies();
  const themePreference = readThemePreference(
    preferences.get(themeCookie)?.value,
  );
  const systemTheme = readTheme(preferences.get(systemThemeCookie)?.value);
  const theme = resolveTheme(themePreference, systemTheme);
  const remote = remoteMode();
  const route = await headers();
  let remoteFailure: string | undefined;
  let defaultAppearance: Appearance = "default";
  if (!remote) defaultAppearance = await defaultSiteAppearance();
  const appearanceValue = preferences.get(appearanceCookie)?.value;
  const appearancePreference = isPublicAppearance(appearanceValue)
    ? appearanceValue
    : undefined;
  const locale = await getLocale();
  let user: Awaited<ReturnType<typeof currentUser>> = null;
  let authUnavailable = false;
  let staff = false;
  let developer = false;
  let streaming = false;
  let scopes: AppearanceScope[] = [];
  if (remote) {
    try {
      const connection = await frontendConnection();
      user = connection.identity?.user ?? null;
      const [site, summaries] = await Promise.all([
        frontendSite(),
        frontendTournaments(),
      ]);
      defaultAppearance = readSiteAppearance(site.defaultAppearance);
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
      [staff, developer, streaming] = user
        ? await Promise.all([
            isStaff(user),
            hasDeveloperAccess(user.osuId),
            hasStreamingMenuAccess(user.osuId),
          ])
        : [false, false, false];
    } catch {
      authUnavailable = true;
    }
    scopes = await tournamentAppearanceScopes(user);
  }
  const inherited = inheritedAppearance(
    route.get("x-oclr-pathname") ?? "/",
    new URLSearchParams(route.get("x-oclr-search") ?? ""),
    scopes,
    defaultAppearance,
  );
  const appearance = readVisitorAppearance(
    appearanceValue,
    inherited.appearance,
  );
  return (
    // The head script may correct data-theme from the visitor's system before paint.
    <html
      lang={locale}
      data-theme={theme}
      data-theme-preference={themePreference}
      data-appearance={appearance}
      suppressHydrationWarning
    >
      <head>
        {appearanceStylesheet(appearance) && (
          <link
            rel="stylesheet"
            href={appearanceStylesheet(appearance)!}
            data-oclr-appearance-style={appearance}
          />
        )}
        <script
          nonce={route.get("x-nonce") ?? undefined}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
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
                themePreference={themePreference}
                systemTheme={systemTheme}
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
                        streaming,
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
                    <GitHubMark />
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

export default function RootLayout(props: Parameters<typeof RootLayoutContent>[0]) {
  return withFrontendReadRequest(() => RootLayoutContent(props));
}
