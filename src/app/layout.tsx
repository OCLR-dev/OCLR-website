import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { GitHubMark } from "@/components/github-mark";
import rolePreviewStyles from "@/components/role-preview.module.css";
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
import { chatConfiguration } from "@/lib/chat-config";
import type { ChatEdition } from "@/lib/chat-edition";
import { currentUser } from "@/lib/auth/user";
import {
  localRolePreviewCookie,
  localRolePreviewKey,
} from "@/lib/auth/local-role-preview-config";
import { localRolePreviewPath } from "@/lib/local-role-preview-model";
import { SiteFrame } from "@/components/site-frame";
import { Header } from "@/components/header";
import { AppearanceProvider } from "@/components/appearance-provider";
import { inheritedAppearance } from "@/lib/appearance-scope";
import { tournamentSiteContext } from "@/lib/tournament-reads";
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
      icon: {
        url: "/branding/oclr-s11-r.svg",
        type: "image/svg+xml",
        sizes: "any",
      },
      apple: [
        {
          url: "/branding/oclr-180.png?v=3",
          sizes: "180x180",
          type: "image/png",
        },
      ],
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
  const rolePreviewAvailable = Boolean(localRolePreviewKey(route.get("host")));
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
  let chatEditions: ChatEdition[] = [];
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
    ({ scopes, chatEditions } = await tournamentSiteContext(
      user,
      Boolean(chatConfiguration()),
    ));
  }
  const previewUser = preferences.has(localRolePreviewCookie) ? user : null;
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
            <SiteFrame chatEditions={chatEditions} chatViewer={user}>
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
              {rolePreviewAvailable && (
                <div className="container">
                  <div className={rolePreviewStyles.banner}>
                    <div className={rolePreviewStyles.identity}>
                      <a
                        className={`context-link ${rolePreviewStyles.entry}`}
                        href={localRolePreviewPath}
                      >
                        {tr("Development role preview")}
                      </a>
                      {previewUser && (
                        <strong>
                          {tr("Viewing as {username}", {
                            username: previewUser.username,
                          })}
                        </strong>
                      )}
                    </div>
                    {previewUser && (
                      <form action="/auth/logout" method="post">
                        <button className="secondary" type="submit">
                          {tr("Exit role preview")}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}
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
