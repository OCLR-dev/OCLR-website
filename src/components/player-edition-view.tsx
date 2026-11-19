"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { BwsSummary as BwsData } from "@/lib/bws-model";
import type { ProfileSnapshot } from "@/lib/osu-profile-model";
import type { OtrRating } from "@/lib/otr-rating";
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
import { CompactPlayerRatings } from "./player-profile-ratings";
import {
  profileSipTotal,
  type ProfileRatings,
} from "@/lib/profile-ratings-model";
import { HistoricalStaffHistory } from "./historical-staff-history";
import type { HistoricalStaffHistory as StaffHistory } from "@/lib/archive-staff-history";
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
  liruCollection,
  bws,
  profileRatings,
  otrRating = null,
  bwsByEdition,
  competition,
  staffHistory = [],
  mapPerformance,
  mapByEdition,
  mra,
  timelines,
  allTimeline,
  ratingsByEdition,
}: {
  osuId: string;
  editions: ParticipatedTournamentEdition[];
  initial: string | null;
  snapshot: ProfileSnapshot | null;
  heading: ReactNode;
  liruCollection?: ReactNode;
  bws?: BwsData | null;
  profileRatings?: ProfileRatings;
  otrRating?: OtrRating | null;
  bwsByEdition: Record<string, BwsData | null>;
  competition: PlayerCompetitionRecord | null;
  staffHistory?: StaffHistory;
  mapPerformance: PlayerMapPerformance | null;
  mapByEdition: Record<string, PlayerMapPerformance>;
  mra: number | null;
  timelines: Record<string, PlayerTimeline>;
  allTimeline: PlayerTimeline;
  ratingsByEdition: Record<string, RatingHistory>;
}) {
  const tr = useAppTranslations();
  const params = useSearchParams();
  const urlEdition = params.get("edition");
  const [selected, setSelected] = useState(initial);
  const [previousEdition, setPreviousEdition] = useState(urlEdition);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const profile = useRef<HTMLDivElement>(null);

  // Back/forward and any other router-driven URL change updates the panel.
  if (previousEdition !== urlEdition) {
    setPreviousEdition(urlEdition);
    if (!urlEdition || timelines[urlEdition]) {
      setSelected(urlEdition);
      setNoticeDismissed(false);
    }
  }

  const select = (slug: string | null) => {
    if (slug && !timelines[slug]) return false;
    if (slug === selected) return true;
    setSelected(slug);
    setNoticeDismissed(false);
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
  const selectedBws = selected ? (bwsByEdition[selected] ?? null) : bws;
  const showRatingFallback =
    (!snapshot || !selectedBws) &&
    profileRatings &&
    (profileRatings.otr ||
      profileSipTotal(profileRatings) !== null ||
      profileRatings.etx);
  const staffDuties = selected
    ? staffHistory.filter((record) => record.editionSlug === selected)
    : staffHistory;

  return (
    <div
      ref={profile}
      tabIndex={-1}
      className={`${
        selected ? "public-tournament public-player-page" : "container page"
      } ${styles.playerPage}`}
    >
      {selected && !noticeDismissed && (
        <div className={`notice ${styles.filterNotice}`}>
          <a
            className={styles.noticeLink}
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
              "You’re viewing this player’s match data for a single season. Click here to view all data.",
            )}
          </a>
          <button
            className={styles.dismissNotice}
            type="button"
            aria-label={tr("Dismiss single-season notice")}
            onClick={() => {
              profile.current?.focus({ preventScroll: true });
              setNoticeDismissed(true);
            }}
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </button>
        </div>
      )}
      {snapshot ? (
        <PlayerProfile
          heading={heading}
          snapshot={snapshot}
          bws={selectedBws}
          otrRating={profileRatings?.otr ?? otrRating}
          profileRatings={profileRatings ?? null}
        />
      ) : (
        <>
          {heading}
          <p className="notice" role="status">
            {tr("osu! statistics are temporarily unavailable.")}
          </p>
        </>
      )}
      {showRatingFallback && <CompactPlayerRatings ratings={profileRatings} />}
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
        <PlayerMapPerformanceView
          record={selectedMapPerformance}
          mra={mra}
          career={!selected}
        />
      )}
      {selectedCompetition && <PlayerTeamRecord record={selectedCompetition} />}
      {staffDuties.length > 0 && (
        <HistoricalStaffHistory history={staffDuties} />
      )}
      {!selected && liruCollection}
    </div>
  );
}
