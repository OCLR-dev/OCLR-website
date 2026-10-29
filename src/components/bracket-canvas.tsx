"use client";
import { useMemo } from "react";
import Link from "./pending-link";
import {
  DoubleEliminationBracket,
  createTheme,
} from "@cm3tahkuh/react-tournament-brackets";
import type { MatchComponentProps } from "@cm3tahkuh/react-tournament-brackets/dist/src/types";
import { useAppTranslations } from "@/i18n/shared";
import type { ResolvedBracket } from "@/lib/bracket-model";
import {
  doubleBracketMatches,
  type LibraryMatch,
} from "@/lib/double-bracket-adapter";
import { TeamAvatar } from "./team-avatar";
import { BracketColumns } from "./bracket-columns";

// The canvas background and connectors follow the active MainSheet tokens in
// globals.css, which matches these exact stroke values; keep them in sync.
const connectorColor = "#b5a0c9",
  connectorColorHighlight = "#edc4ff";
const theme = createTheme({
  textColor: { main: "#4b315b", highlighted: "#754099", dark: "#222" },
  matchBackground: { wonColor: "#ede5f4", lostColor: "#ffffff" },
  border: { color: "#d9cce5", highlightedColor: "#b785d2" },
  connectorColor,
  connectorColorHighlight,
});

export function BracketCanvas({
  group,
  editionSlug,
  teamUrls,
}: {
  group: ResolvedBracket["groups"][number];
  editionSlug: string;
  teamUrls?: Record<string, string>;
}) {
  const tr = useAppTranslations();
  const data = useMemo(() => doubleBracketMatches(group), [group]);
  const historical = group.rounds.some((r) =>
    r.matches.some((m) =>
      m.slots.some((s) => s.kind === "team" && s.sourceMatchId),
    ),
  );
  const sources = group.rounds.flatMap((round) =>
    round.matches.flatMap((match) =>
      match.slots.filter((slot) => slot.sourceMatchId),
    ),
  );
  // A valid bracket need not fit the double-elimination library. Keep explicit
  // winner/loser routes in the existing column renderer; historical appearance
  // references retain their partial paths in the fallback below.
  if (
    !data &&
    sources.length > 0 &&
    sources.every((slot) => slot.kind === "winner" || slot.kind === "loser")
  )
    return (
      <BracketColumns
        bracket={{
          editionSlug,
          published: true,
          formatLabel: "",
          updatedAt: "2026-01-01T00:00:00Z",
          source: { label: "Source", url: null },
          groups: [group],
        }}
        teamUrls={teamUrls}
        hideGroupTabs
      />
    );
  if (!data)
    return (
      <div className={historical ? "bracket-library-references" : undefined}>
        <p className="muted small">
          {tr(
            "Some bracket sources are missing. Recorded matches are shown without invented advancement links.",
          )}
        </p>
        {historical && (
          <p className="muted small">
            {tr("Recorded appearance only (unconfirmed progression)")}
          </p>
        )}
        <BracketColumns
          bracket={{
            editionSlug,
            published: true,
            formatLabel: "Historical archive",
            updatedAt: "2026-01-01T00:00:00Z",
            source: { label: "Source", url: null },
            groups: [group],
          }}
          teamUrls={teamUrls}
          hideGroupTabs
        />
      </div>
    );
  function MatchCard({
    match: value,
    topParty,
    bottomParty,
    onMouseEnter,
    onMouseLeave,
  }: MatchComponentProps) {
    const match = value as LibraryMatch;
    return (
      <article
        className="match-card"
        data-match-id={match.id}
        data-details={Boolean(match.original.detailsUrl)}
        aria-labelledby={`match-${match.id}`}
      >
        <div className="match-meta">
          <h3 title={match.original.label} id={`match-${match.id}`}>
            {match.original.label}
          </h3>
          <span>
            {match.original.status === "completed"
              ? tr("Completed")
              : tr("Pending")}
          </span>
        </div>
        {[topParty, bottomParty].map((party, row) => {
          const slotIndex = Number(party.originalSlot ?? row),
            slot = match.original.slots[slotIndex];
          return (
            <div
              key={row}
              data-bracket-slot
              data-original-slot={slotIndex}
              className={`match-slot ${party.isWinner ? "match-winner" : "match-loser"}`}
              onMouseEnter={() => onMouseEnter(party.id)}
              onMouseLeave={onMouseLeave}
            >
              <span className="match-slot-identity" title={slot.label}>
                {slot.teamId ? (
                  <Link
                    href={
                      teamUrls?.[slot.teamId] ??
                      `/tournaments/${editionSlug}/teams/${slot.teamId}`
                    }
                  >
                    <TeamAvatar
                      team={{
                        id: slot.teamId,
                        name: slot.label,
                        avatarKey: slot.avatarKey,
                      }}
                    />
                    <span className="match-team-name">{slot.label}</span>
                  </Link>
                ) : (
                  slot.label
                )}
                {party.isWinner && (
                  <span className="sr-only">{tr(" (winner)")}</span>
                )}
              </span>
              <strong
                aria-label={tr("Score {value0}", {
                  value0: party.resultText ?? "unreported",
                })}
              >
                {party.resultText ?? "—"}
              </strong>
            </div>
          );
        })}
        {match.original.detailsUrl && (
          <p className="match-note">
            <Link className="text-link" href={match.original.detailsUrl}>
              {tr("Match details")}
            </Link>
          </p>
        )}
      </article>
    );
  }
  return (
    <>
      <h2 className="sr-only">{group.label}</h2>
      <div
        className={`bracket-library-scroll${historical ? " bracket-library-references" : ""}`}
        role="region"
        aria-label={tr("{value0} bracket; scroll horizontally", {
          value0: group.label,
        })}
        tabIndex={0}
      >
        <DoubleEliminationBracket
          matches={data}
          matchComponent={MatchCard}
          theme={theme}
          options={{
            style: {
              width: 224,
              boxHeight: 180,
              canvasPadding: 16,
              spaceBetweenColumns: 40,
              spaceBetweenRows: 24,
              connectorColor,
              connectorColorHighlight,
              roundHeader: { isShown: false, height: 0, marginBottom: 0 },
            },
          }}
        />
      </div>
      <details className="bracket-source-details">
        <summary>{tr("Connection sources")}</summary>
        <ul>
          {data.edges.map((edge) => {
            const source = [...data.upper, ...data.lower].find(
                (m) => m.id === edge.sourceId,
              )!,
              target = [...data.upper, ...data.lower].find(
                (m) => m.id === edge.targetId,
              )!;
            return (
              <li key={edge.id}>
                {source.original.label} → {target.original.label} ·{" "}
                {target.original.slots[edge.targetSlot].label}
                {edge.kind === "appearance" && (
                  <span className="match-source">
                    {tr("Recorded appearance only (unconfirmed progression)")}
                  </span>
                )}
              </li>
            );
          })}
          {[...data.upper, ...data.lower]
            .filter((match) => match.original.note)
            .map((match) => (
              <li key={`note-${match.id}`}>
                {match.original.label}
                <p>{match.original.note}</p>
              </li>
            ))}
        </ul>
      </details>
    </>
  );
}
