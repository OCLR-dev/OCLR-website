"use client";

import { useAppTranslations } from "@/i18n/shared";
import { draftBoardTiers } from "@/lib/award-tiers";

import type { CaptainBoard, DraftBoard } from "@/lib/draft-types";
import { useState } from "react";
import { CaptainDraftOverview } from "./captain-draft-overview";
import { CaptainDraftStatus } from "./captain-draft-status";
import { DraftBoardView } from "./draft-board";
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
    sessionId: string;
  } | null>(null);
  const endpoint = `/api/tournaments/${slug}/draft${captainId ? "/captain" : ""}`;
  const {
    value: board,
    connected,
    authorizationLost,
  } = usePoll<DraftBoard | CaptainBoard>(endpoint, initial);
  const ownTurn = Boolean(
    captainId &&
    connected &&
    board?.state === "live" &&
    board.activeTeam?.captain.osuId === captainId &&
    "eligiblePool" in board,
  );
  const canPick = ownTurn && !readOnly;
  const connection = connected
    ? tr("Connected · updates every 2s")
    : tr("Reconnecting · showing last published state");
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
      {captainId && board ? (
        <CaptainDraftStatus
          board={board}
          captainId={captainId}
          ownTurn={ownTurn}
          connection={connection}
        />
      ) : (
        <div className={captainId ? "captain-draft-status" : "section-title"}>
          {!captainId && <p className="eyebrow">{tr("OCLR / LIVE DRAFT")}</p>}
          <p className="connection-state small" role="status">
            {connection}
          </p>
        </div>
      )}
      {board ? (
        <>
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
                    tiers={draftBoardTiers(board, board.turnSequence ?? [])}
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
                    feedback={
                      feedback?.sessionId === board.sessionId &&
                      feedback.version === board.version
                        ? feedback.message
                        : undefined
                    }
                    onFeedback={(message, publicVersion) =>
                      setFeedback({
                        message,
                        version: publicVersion ?? board.version,
                        sessionId: board.sessionId,
                      })
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
