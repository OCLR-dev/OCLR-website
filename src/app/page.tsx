import { getAppTranslations } from "@/i18n/server";
import Link from "next/link";
import Image from "next/image";
import { EditionCard } from "@/components/edition-card";
import { frontendTournaments } from "@/lib/frontend-data";
import { remoteMode } from "@/lib/data-source";
import { remotePage } from "@/lib/remote-page";

import { formatDate } from "@/lib/editions";
import type { CSSProperties } from "react";
import "./home.css";

export const dynamic = "force-dynamic";

// Stars over the hero: [x %, y %, twinkle delay s, period s, size px].
const HERO_STARS: [number, number, number, number, number][] = [
  [4, 22, 0, 5, 2],
  [12, 64, 1.2, 6.5, 2],
  [21, 10, 2.8, 4.5, 3],
  [33, 80, 4.5, 6, 2],
  [44, 18, 0.6, 7, 2],
  [53, 58, 3.6, 5.5, 3],
  [60, 8, 5.4, 4, 2],
  [66, 72, 2, 6.5, 2],
  [74, 30, 0.3, 5, 2],
  [83, 12, 4, 6, 3],
  [91, 52, 1.8, 4.5, 2],
  [97, 26, 3.2, 7, 2],
];

// Faint stars around the logo, mostly on its upper right (Liru's lit side):
// [x %, y %, twinkle delay s] of the logo box.
const LOGO_STARS: [number, number, number][] = [
  [34, 5, 0.8],
  [58, 7, 3.1],
  [93, 16, 1.9],
  [101, 42, 4.6],
  [95, 90, 2.5],
];

function EntryIcon({ kind }: { kind: "discord" | "qq" | "info" | "calendar" }) {
  return (
    <svg
      className="home-entry-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Brand paths from Simple Icons (CC0): simpleicons.org. */}
      {kind === "discord" && (
        <path
          fill="currentColor"
          stroke="none"
          d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
        />
      )}
      {kind === "qq" && (
        <path
          fill="currentColor"
          stroke="none"
          d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673"
        />
      )}
      {kind === "info" && (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </>
      )}
      {kind === "calendar" && (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4M17 3v4M3 10h18m-13 5 3 3 5-5" />
        </>
      )}
    </svg>
  );
}

async function HomeContent() {
  const tr = await getAppTranslations();
  const editions = await frontendTournaments();
  const featured =
    editions.find((e) => e.status === "live") ??
    editions.find((e) => e.status === "upcoming");
  const availability = featured
    ? (featured.registration?.state ?? "unannounced")
    : null;
  const archives = editions
    .filter((e) => e.status === "completed")
    .sort((a, b) =>
      (b.season ?? b.slug).localeCompare(a.season ?? a.slug, "en", {
        numeric: true,
      }),
    );
  const previewArchive =
    !remoteMode() && process.env.NODE_ENV !== "production"
      ? archives.find((edition) => edition.slug === "dev-archive")
      : undefined;
  const archiveCards = previewArchive
    ? [10, 9, 8, 7].map((season) => ({
        edition: {
          ...previewArchive,
          name: `OCLR S${season}`,
          season: String(season),
          summary: "",
          branding: {
            ...previewArchive.branding,
            logo:
              (
                {
                  10: "/archive/s10/thumbnail.webp",
                  9: "/archive/s9/thumbnail.webp",
                  8: "/archive/s8/thumbnail.webp",
                } as const
              )[season as 10 | 9 | 8] ?? null,
          },
        },
        href:
          season === 10
            ? `/tournaments/${previewArchive.slug}`
            : "/tournaments",
      }))
    : archives.map((edition) => ({
        edition,
        href: `/tournaments/${edition.slug}`,
      }));
  const otherCurrent = editions.filter(
    (e) => e.status !== "completed" && e.slug !== featured?.slug,
  );
  const base = featured ? `/tournaments/${featured.slug}` : "/tournaments";
  const registrationLabel =
    availability === "open"
      ? tr("Registration phase")
      : availability === "upcoming"
        ? tr("Registration opens {value0}", {
            value0: formatDate(
              featured!.registration!.opensAt,
              featured!.timeZone,
              tr.locale,
            ),
          })
        : availability === "paused"
          ? tr("Registration paused")
          : availability === "closed"
            ? tr("Registration closed")
            : availability === "unavailable"
              ? tr("Registration temporarily unavailable")
              : featured
                ? tr("Registration not announced")
                : tr("The next edition has not been announced yet.");
  return (
    <div className="home-redesign">
      <section
        className="home-feature home-layered-hero"
        aria-labelledby="hero-title"
      >
        {/* Layers: base colour (CSS), nebula, ink mist and stars, then the
         * logo, entries and Liru in the page container. Each artwork file
         * can be swapped without touching the layout. */}
        <div className="home-hero-backdrop" aria-hidden="true">
          <div className="home-hero-sky" />
          <Image
            src="/branding/home-hero/ink-mist.webp"
            alt=""
            width={1536}
            height={640}
            unoptimized
            className="home-hero-ink"
          />
          <div className="home-hero-stars">
            {HERO_STARS.map(([x, y, delay, period, size], i) => (
              <span
                key={i}
                style={
                  {
                    "--x": `${x}%`,
                    "--y": `${y}%`,
                    "--delay": `${delay}s`,
                    "--period": `${period}s`,
                    "--size": `${size}px`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
        <div className="container home-feature-inner">
          <div className="home-feature-left">
            <h1 id="hero-title" className="home-hero-logo">
              <span className="sr-only">
                <span>osu! Chinese League Rookie</span> — S11
              </span>
              <Image
                src="/branding/home-s11/oclr-layer.svg"
                alt=""
                width={1200}
                height={490}
                unoptimized
                className="home-hero-logo-layer home-hero-logo-oclr"
              />
              {/* CSS-only accents over the unchanged SVGs: a breathing
               * top-right sheen inside OCLR, and S11 recoloured through its
               * own shape as a mask. */}
              <span
                className="home-hero-logo-layer home-hero-logo-sheen"
                aria-hidden="true"
              />
              <span
                className="home-hero-logo-layer home-hero-logo-season"
                aria-hidden="true"
              >
                <span />
              </span>
              <span className="home-hero-logo-sparkle" aria-hidden="true" />
              <Image
                src="/branding/home-s11/katu-cropped.svg"
                alt=""
                width={100}
                height={100}
                unoptimized
                className="home-hero-logo-katu"
              />
              <span className="home-hero-logo-stars" aria-hidden="true">
                {LOGO_STARS.map(([x, y, delay], i) => (
                  <span
                    key={i}
                    style={
                      {
                        "--x": `${x}%`,
                        "--y": `${y}%`,
                        "--delay": `${delay}s`,
                      } as CSSProperties
                    }
                  />
                ))}
              </span>
            </h1>
            <div className="home-entry-links">
              <div className="home-contact-bar" aria-label={tr("Contact")}>
                <a
                  href="https://discord.gg/graS4RJHjM"
                  className="home-contact"
                >
                  <EntryIcon kind="discord" />
                  <span>{"Discord"}</span>
                  <span aria-hidden="true">→</span>
                </a>
                <a
                  href="https://qm.qq.com/q/sqIoPulwUo"
                  className="home-contact"
                >
                  <EntryIcon kind="qq" />
                  <span>{tr("QQ group")}</span>
                  <span aria-hidden="true">→</span>
                </a>
              </div>
              <Link className="home-contact home-information-link" href={base}>
                <EntryIcon kind="info" />
                <span>{tr("Information page")}</span>
                <span aria-hidden="true">→</span>
              </Link>
              <Link
                className="home-registration-link"
                href={availability === "open" ? `${base}/register` : base}
              >
                <EntryIcon kind="calendar" />
                <span className="home-registration-label">
                  <span>{registrationLabel}</span>
                  {availability === "open" && featured?.registration && (
                    <>
                      <span
                        className="home-registration-divider"
                        aria-hidden="true"
                      >
                        |
                      </span>
                      <span>
                        {tr("Deadline {date}", {
                          date: formatDate(
                            featured.registration.closesAt,
                            featured.timeZone,
                            tr.locale,
                          ),
                        })}
                      </span>
                    </>
                  )}
                </span>
                <span className="home-registration-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </div>
          </div>
          {/* Liru artwork: the box crops it per breakpoint (home.css), so
           * another Liru image can be dropped in unchanged. */}
          <picture className="home-hero-character">
            <source
              type="image/webp"
              srcSet="/branding/home-hero/liru-cn-v3-480.webp 480w, /branding/home-hero/liru-cn-v3-800.webp 800w, /branding/home-hero/liru-cn-v3-1111.webp 1111w"
              sizes="(max-width: 760px) 86vw, 390px"
            />
            <Image
              src="/branding/home-hero/liru-cn-v3-800.webp"
              unoptimized
              alt={tr(
                "Liru, the OCLR mascot, in her Chinese-style outfit holding a folding fan",
              )}
              width={800}
              height={1430}
              loading="eager"
            />
          </picture>
        </div>
      </section>
      <div className="container home-archive-section" id="past-seasons">
        {otherCurrent.length > 0 && (
          <section className="home-other-current">
            <h2>{tr("Current tournaments")}</h2>
            {otherCurrent.map((edition) => (
              <Link
                className="context-link"
                key={edition.slug}
                href={`/tournaments/${edition.slug}`}
              >
                {edition.slug.startsWith("dev-")
                  ? `OCLR S${edition.season}`
                  : edition.name}{" "}
                →
              </Link>
            ))}
          </section>
        )}
        <section aria-labelledby="archive-title">
          <div className="home-archive-heading">
            <h2 id="archive-title">{tr("Past tournament")}</h2>
          </div>
          <div className="home-archive-grid">
            {archiveCards.map(({ edition, href }) => (
              <EditionCard
                key={`${edition.slug}-${edition.season}`}
                edition={edition}
                href={href}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function Home() {
  return remotePage(HomeContent);
}
