"use client";

import { useAppTranslations } from "@/i18n/shared";

import type { CaptainBoard, DraftBoard } from "@/lib/draft-types";
import { useState } from "react";
import { CaptainDraftOverview } from "./captain-draft-overview";
import { DraftBoardView, draftLabels } from "./draft-board";
import { DraftPick } from "./draft-pick";
import { useStaffReadOnly } from "./staff-read-only";
import { Action, EmptyState } from "./ui";
import { usePoll } from "./use-poll";
export function LiveDraft({
  slug,
  initial,
  captainId,
  presenter = false,
}: {
  slug: string;
  initial: DraftBoard | CaptainBoard | null;
  captainId?: number;
  presenter?: boolean;
}) {
  const tr = useAppTranslations();
  const readOnly = useStaffReadOnly();

  const [feedback, setFeedback] = useState<{
    message: string;
    version: number;
  } | null>(null);
  const endpoint = `/api/tournaments/${slug}/draft${captainId ? "/captain" : ""}`;
  const {
    value: board,
    connected,
    authorizationLost,
  } = usePoll<DraftBoard | CaptainBoard>(endpoint, initial);
  const canPick = Boolean(
    !readOnly &&
    captainId &&
    board?.state === "live" &&
    board.activeTeam?.captain.osuId === captainId &&
    connected &&
    "eligiblePool" in board,
  );
  if (authorizationLost)
    return (
      <section className="panel" role="alert">
        <h2>{tr("Sign-in or captain access changed.")}</h2>
        <p className="muted">
          {tr(
            "Your session may have expired. Sign in again; captain appointments are managed by the organizer.",
          )}
        </p>
        <Action href="/login">{tr("Sign in again")}</Action>
      </section>
    );
  return (
    <div
      className={
        captainId ? "captain-draft-room" : presenter ? "presenter-view" : ""
      }
    >
      <div className={captainId ? "captain-draft-status" : "section-title"}>
        {captainId && board ? (
          <div
            className="captain-draft-turn"
            role="status"
            aria-label={tr("Current draft turn")}
          >
            <span
              className={`badge ${board.state === "live" ? "status-accepted" : "status-pending"}`}
            >
              {tr(draftLabels[board.state])}
            </span>
            <span>
              {board.turnCount
                ? tr("Pick {value0} of {value1}", {
                    value0: Math.min(board.turnIndex + 1, board.turnCount),
                    value1: board.turnCount,
                  })
                : tr("No picks configured")}
            </span>
            <strong>
              {board.activeTeam?.name ??
                tr(
                  board.state === "completed" || board.state === "finalized"
                    ? "The draft is complete."
                    : "Awaiting the next stage.",
                )}
            </strong>
          </div>
        ) : (
          !captainId && <p className="eyebrow">{tr("OCLR / LIVE DRAFT")}</p>
        )}
        <p className="connection-state small" role="status">
          {connected
            ? tr("Connected · updates every 2s")
            : tr("Reconnecting · showing last published state")}
        </p>
      </div>
      {feedback && board && feedback.version === board.version && (
        <p className="notice" role="status">
          {tr(feedback.message)}
        </p>
      )}
      {board ? (
        <>
          {captainId && "eligiblePool" in board && (
            <p className="captain-draft-turns muted small">
              {tr("Your configured turns:")}{" "}
              {(board.turnSequence ?? [])
                .flatMap((teamId, index) =>
                  board.rosters.some(
                    (r) =>
                      r.team.id === teamId &&
                      r.team.captain.osuId === captainId,
                  )
                    ? [index + 1]
                    : [],
                )
                .join(", ") || tr("None")}
              .
            </p>
          )}
          {captainId && "eligiblePool" in board ? (
            (() => {
              const own = board.rosters.find(
                (r) => r.team.captain.osuId === captainId,
              );
              return own ? (
                <>
                  <DraftPick
                    key={`${board.sessionId}:${board.engineRevision}:${board.version}:${own.team.id}`}
                    slug={slug}
                    sessionId={board.sessionId}
                    revision={board.engineRevision}
                    turnIndex={board.turnIndex}
                    team={own.team}
                    players={own.players}
                    capacity={board.capacities?.[own.team.id]}
                    pool={board.eligiblePool}
                    staff={false}
                    teamAnchorId="captain-own-team"
                    enabled={canPick}
                    unavailableMessage={
                      !connected
                        ? "Reconnecting. Selection is unavailable until the snapshot refreshes."
                        : board.state === "live"
                          ? "Waiting for your turn."
                          : "Picking is unavailable in the current published state."
                    }
                    onFeedback={(message) =>
                      setFeedback({ message, version: board.version })
                    }
                  />
                  <CaptainDraftOverview board={board} ownTeamId={own.team.id} />
                </>
              ) : (
                <p className="notice">
                  {tr("Your team is awaiting publication.")}
                </p>
              );
            })()
          ) : (
            <DraftBoardView board={board} />
          )}
        </>
      ) : (
        <EmptyState title={tr("Draft awaiting publication")}>
          {tr(
            "No draft board is published for this edition. Check the tournament announcements.",
          )}
        </EmptyState>
      )}
    </div>
  );
}
