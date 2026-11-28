"use client";
import { useStaffReadOnly } from "./staff-read-only";

import { draftBoardTiers } from "@/lib/award-tiers";
import { useAppTranslations } from "@/i18n/shared";

import { useState } from "react";
import type { StaffDraft } from "@/lib/draft-reads";
import type { DraftBoard, DraftTeam } from "@/lib/draft-types";
import { usePoll } from "./use-poll";
import { DraftPick } from "./draft-pick";
import { ConfirmMutation } from "./confirm-mutation";
import { DraftOrderEditor } from "./draft-order-editor";
import { DraftBoardView, draftLabels } from "./draft-board";
import styles from "./staff-draft.module.css";
function Controls({ slug, data }: { slug: string; data: StaffDraft }) {
  const tr = useAppTranslations();

  const state = data.session?.state ?? "setup";
  const version = data.session?.version ?? 0;
  const editing = !data.edition?.lockedAt;
  const canReset =
    data.canConfigure &&
    data.session &&
    state !== "live" &&
    (state !== "setup" ||
      data.members.some(({ membership }) => membership.origin === "draft") ||
      data.picks.some((pick) => !pick.voidedAt));
  const allowed = [
    ...(data.canConfigure && data.edition?.lockedAt && state !== "finalized"
      ? ["unlock"]
      : []),
    ...(state === "ready" && data.session?.turnSequence.length
      ? ["start"]
      : []),
    ...(state === "live" ? ["pause"] : []),
    ...(state === "paused"
      ? [
          ...(!editing ? ["resume"] : []),
          ...(data.session?.turnIndex ? ["undo"] : []),
        ]
      : []),
    ...(state === "completed" ? ["finalize", "undo"] : []),
    ...(state === "aborted" ? ["recover"] : []),
    ...(state !== "setup" && !data.session?.publicSnapshot ? ["publish"] : []),
  ];
  const labels: Record<string, string> = {
    unlock: state === "live" ? tr("Pause and edit") : tr("Unlock draft setup"),
    start: "Start draft",
    pause: "Pause draft",
    resume: "Resume draft",
    undo: "Void last pick",
    finalize: "Finalize rosters",
    recover: "Reopen setup",
    publish: "Release draft board",
  };
  function actionPayload(action: string) {
    return {
      command: {
        action,
        ...(["unlock", "force_reset"].includes(action)
          ? { expectedSetupVersion: data.edition?.setupVersion ?? 0 }
          : {}),
      },
      expectedVersion: version,
      confirmed: true,
    };
  }
  return (
    <section className={`panel ${styles.controls}`}>
      <header>
        <h2>{tr("Staff controls")}</h2>
        <p className="muted small" role="status">
          {editing
            ? tr(
                "Draft setup is editable. Registration availability is unchanged.",
              )
            : tr(
                "Draft structure is locked. Tournament settings remain editable.",
              )}
        </p>
      </header>
      {(state === "setup" || (state === "paused" && editing)) && (
        <DraftOrderEditor slug={slug} data={data} />
      )}
      {allowed.length > 0 && (
        <div className={styles.actions}>
          {allowed.map((action) => (
            <ConfirmMutation
              loadingFeedback="button"
              key={action}
              requireConfirmation={
                !["start", "pause", "resume", "unlock"].includes(action)
              }
              label={labels[action]}
              title={`${tr(labels[action])}?`}
              className={
                ["start", "resume", "finalize"].includes(action)
                  ? ""
                  : "secondary"
              }
              description={
                action === "publish"
                  ? tr(
                      "Release the current approved captain/team state and committed picks. Remaining pool is shown only when separately approved. This does not create a pick.",
                    )
                  : action === "undo"
                    ? tr(
                        "Void the last pick and remove that player from the roster. Later turns may need review.",
                      )
                    : action === "finalize"
                      ? tr(
                          "Finalize the drafted rosters. Normal roster edits will be locked.",
                        )
                      : action === "start"
                        ? tr(
                            "Start the saved turn order. Public release remains separate.",
                          )
                        : tr(
                            "Reopen draft setup. Review the existing order and rosters before freezing again.",
                          )
              }
              url={`/api/admin/tournaments/${slug}/draft`}
              payload={actionPayload(action)}
            />
          ))}
        </div>
      )}
      {canReset && (
        <div className={styles.recovery}>
          <ConfirmMutation
            loadingFeedback="button"
            className={`secondary ${styles.reset}`}
            label={tr("Force reset draft")}
            title={tr("Force reset draft")}
            confirmLabel={tr("Force reset draft")}
            description={tr(
              "Return to setup and void confirmed picks. Draft assignments and roster finalization are cleared, and the draft board and team rosters are unpublished. Saved order, registration status, fixtures, match evidence, and audit history are preserved.",
            )}
            url={`/api/admin/tournaments/${slug}/draft`}
            payload={actionPayload("force_reset")}
          />
        </div>
      )}
    </section>
  );
}
export function StaffDraftRoom({
  slug,
  initial,
}: {
  slug: string;
  initial: StaffDraft;
}) {
  const readOnly = useStaffReadOnly();
  const tr = useAppTranslations();

  const [feedback, setFeedback] = useState<{
    message: string;
    version: number;
    sessionId: string;
  } | null>(null);
  const { value: data, connected } = usePoll<StaffDraft>(
    `/api/admin/tournaments/${slug}/draft`,
    initial,
  );
  if (!data)
    return (
      <p className="notice" role="alert">
        {tr(
          "Staff access is unavailable. Sign in again or contact the organizer.",
        )}
      </p>
    );
  const session = data.session;
  const pickFeedback =
    feedback?.sessionId === session?.id &&
    feedback?.version === session?.publicVersion
      ? feedback?.message
      : undefined;
  const teamMap = new Map<string, DraftTeam>(
    data.teams.map((t) => [
      t.team.id,
      {
        id: t.team.id,
        name: t.team.name,
        captain: { osuId: t.team.captainId, username: t.captainName },
      },
    ]),
  );
  const currentTeam = session
    ? teamMap.get(session.turnSequence[session.turnIndex])
    : undefined;
  const preview: DraftBoard | null = session
    ? {
        sessionId: session.id,
        version: session.version,
        state: session.state,
        turnIndex: session.turnIndex,
        turnCount: session.turnSequence.length,
        activeTeam: currentTeam ?? null,
        picks: data.picks
          .filter((p) => !p.voidedAt)
          .map((p) => ({
            id: p.id,
            turnIndex: p.turnIndex,
            team: teamMap.get(p.teamId)!,
            player: data.identities.find((u) => u.osuId === p.playerId)!,
          })),
        rosters: data.teams.map((t) => ({
          team: teamMap.get(t.team.id)!,
          players: data.members
            .filter((m) => m.membership.teamId === t.team.id)
            .map((m) => ({ osuId: m.membership.userId, username: m.username })),
        })),
        pool: null,
      }
    : null;
  const tiers =
    preview && session
      ? draftBoardTiers(preview, session.turnSequence)
      : undefined;
  const canPick = Boolean(!readOnly && connected && session?.state === "live");
  return (
    <>
      <p role="status" className="connection-state small">
        {connected
          ? tr("Connected · updates every 2s")
          : tr("Reconnecting · actions may be stale")}
      </p>
      {session?.state === "live" && !data.availablePool.length && (
        <p className="notice" role="status">
          {tr(
            "No eligible players remain. Pause the draft to review or abort and reconfigure.",
          )}
        </p>
      )}
      {session && session.state !== "setup" && (
        <>
          {currentTeam && session && (
            <DraftPick
              key={`pick:${session.id}:${session.version}`}
              slug={slug}
              sessionId={session.id}
              revision={session.version}
              turnIndex={session.turnIndex}
              team={currentTeam}
              players={
                preview?.rosters.find((r) => r.team.id === currentTeam.id)
                  ?.players ?? []
              }
              capacity={
                data.teams.find((t) => t.team.id === currentTeam.id)?.team
                  .capacity
              }
              unavailableMessage={
                !connected
                  ? "Reconnecting. Wait for the authoritative snapshot."
                  : draftLabels[session.state]
              }
              pool={data.availablePool}
              staff
              tiers={tiers}
              enabled={canPick}
              feedback={pickFeedback}
              onFeedback={(message, publicVersion) =>
                setFeedback({
                  message,
                  version: publicVersion ?? session.publicVersion,
                  sessionId: session.id,
                })
              }
            />
          )}
          {!currentTeam && pickFeedback && (
            <p className="notice" role="status">
              {tr(pickFeedback)}
            </p>
          )}
          <h2 className="section-space">{tr("Staff preview")}</h2>
          <p className="muted small">
            {tr(
              "Private operational state. This preview is not the public broadcast.",
            )}
          </p>
          {preview && (
            <DraftBoardView board={preview} slug={slug} privateTiers={tiers} />
          )}
        </>
      )}
      <Controls
        key={`controls:${session?.id ?? "new"}:${session?.version ?? 0}:${data.edition?.setupVersion}`}
        slug={slug}
        data={data}
      />
    </>
  );
}
