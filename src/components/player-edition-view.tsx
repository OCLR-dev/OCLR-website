"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAppTranslations } from "@/i18n/shared";
import type { BwsSummary as BwsData } from "@/lib/bws-model";
import type { ProfileSnapshot } from "@/lib/osu-profile-model";
import {
  summarizePlayerCompetition,
  type PlayerCompetitionRecord,
} from "@/lib/player-competition-model";
import type { ParticipatedTournamentEdition } from "@/lib/player-competition";
import type { PlayerMapPerformance } from "@/lib/player-map-performance";
import type { PlayerTimeline } from "@/lib/player-timeline";
import { PlayerCompetition, PlayerTeamRecord } from "./player-competition";
import { PlayerMapPerformance as PlayerMapPerformanceView } from "./player-map-performance";
import { PlayerParticipatedTournaments } from "./player-participated-tournaments";
import { PlayerProfile } from "./player-profile";
import { PlayerTimeline as PlayerTimelineView } from "./player-timeline";
import { RoundRatings } from "./round-ratings";
import styles from "./player-edition-view.module.css";

type RatingHistory = Parameters<typeof RoundRatings>[0]["data"];

/**
 * Edition switching stays in one React tree: every panel's data is loaded with
 * the profile, so choosing a tournament only swaps the rendered slice. The URL
 * still carries `?edition=` for links, reloads and history, but a plain click is
 * handled here instead of fetching the page again.
 */
export function PlayerEditionView({
  osuId,
  editions,
  initial,
  snapshot,
  heading,
  bws,
  bwsByEdition,
  competition,
  mapPerformance,
  mapByEdition,
  timelines,
  allTimeline,
  ratingsByEdition,
}: {
  osuId: string;
  editions: ParticipatedTournamentEdition[];
  initial: string | null;
  snapshot: ProfileSnapshot | null;
  heading: ReactNode;
  bws?: BwsData | null;
  bwsByEdition: Record<string, BwsData | null>;
  competition: PlayerCompetitionRecord | null;
  mapPerformance: PlayerMapPerformance | null;
  mapByEdition: Record<string, PlayerMapPerformance>;
  timelines: Record<string, PlayerTimeline>;
  allTimeline: PlayerTimeline;
  ratingsByEdition: Record<string, RatingHistory>;
}) {
  const tr = useAppTranslations();
  const params = useSearchParams();
  const urlEdition = params.get("edition");
  const [selected, setSelected] = useState(initial);
  const [previousEdition, setPreviousEdition] = useState(urlEdition);
  const [header, setHeader] = useState<HTMLElement | null>(null);

  // The portal target exists by the time effects run, but it is read one frame
  // later so the first paint can stay server-rendered.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setHeader(document.querySelector<HTMLElement>("header.site-header"));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Back/forward and any other router-driven URL change updates the panel.
  if (previousEdition !== urlEdition) {
    setPreviousEdition(urlEdition);
    if (urlEdition && timelines[urlEdition]) setSelected(urlEdition);
    else if (!urlEdition) setSelected(null);
  }

  const select = (slug: string | null) => {
    if (slug && !timelines[slug]) return false;
    if (slug === selected) return true;
    setSelected(slug);
    window.history.pushState(
      null,
      "",
      slug ? `/players/${osuId}?edition=${slug}` : `/players/${osuId}`,
    );
    return true;
  };

  const selectedCompetition = useMemo(
    () =>
      selected && competition
        ? summarizePlayerCompetition(
            competition.editions.filter(
              (edition) => edition.editionSlug === selected,
            ),
          )
        : competition,
    [competition, selected],
  );
  const selectedMapPerformance = selected
    ? (mapByEdition[selected] ?? null)
    : mapPerformance;
  const timeline = selected
    ? (timelines[selected] ?? allTimeline)
    : allTimeline;
  const ratings = selected ? ratingsByEdition[selected] : undefined;

  return (
    <>
      {/* Floating below the header keeps opening and closing the filter from
          shifting the page content. */}
      {selected &&
        header &&
        createPortal(
          <a
            className={`notice ${styles.filterNotice}`}
            href={`/players/${osuId}`}
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              if (select(null)) event.preventDefault();
            }}
          >
            {tr(
              "You are viewing this player's data for a single tournament. To view all data, click here.",
            )}
          </a>,
          header,
        )}
      <div
        className={
          selected ? "public-tournament public-player-page" : "container page"
        }
      >
        <Link
          className="context-link"
          href={selected ? `/tournaments/${selected}/players` : "/tournaments"}
        >
          {selected ? tr("← Tournament players") : tr("← Tournaments")}
        </Link>
        {snapshot ? (
          <PlayerProfile
            heading={heading}
            snapshot={snapshot}
            bws={selected ? (bwsByEdition[selected] ?? null) : bws}
          />
        ) : (
          <>
            {heading}
            <p className="notice" role="status">
              {tr("osu! statistics are temporarily unavailable.")}
            </p>
          </>
        )}
        {selected && ratings && <RoundRatings data={ratings} slug={selected} />}
        {(timeline.marks.length > 0 || timeline.spans.length > 0) && (
          <PlayerTimelineView timeline={timeline} />
        )}
        <PlayerParticipatedTournaments
          editions={editions}
          osuId={osuId}
          selected={selected}
          onSelect={select}
        />
        {selectedCompetition && (
          <PlayerCompetition
            record={selectedCompetition}
            mapRecord={selectedMapPerformance}
            resetHref={null}
          />
        )}
        {selectedMapPerformance && (
          <PlayerMapPerformanceView record={selectedMapPerformance} />
        )}
        {selectedCompetition && (
          <PlayerTeamRecord record={selectedCompetition} />
        )}
      </div>
    </>
  );
}
