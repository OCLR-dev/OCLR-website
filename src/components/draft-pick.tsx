"use client";

import { InfoNote } from "@/components/info-note";

import { useAppTranslations } from "@/i18n/shared";

import { useId, useRef, useState } from "react";
import type { DraftIdentity, DraftTeam } from "@/lib/draft-types";
import { Avatar } from "./avatar";
function PlayerIdentity({ player }: { player: DraftIdentity }) {
  const tr = useAppTranslations();

  return (
    <span className="draft-player-identity">
      <Avatar osuId={player.osuId} username={player.username} />
      <span>
        <strong>{player.username}</strong>
        <small className="muted">
          {tr("osu! ID ")}
          {player.osuId}
        </small>
      </span>
    </span>
  );
}
export function DraftPick({
  slug,
  sessionId,
  revision,
  turnIndex,
  team,
  pool,
  players,
  tiers,
  capacity,
  teamAnchorId,
  staff,
  enabled,
  unavailableMessage,
  onFeedback,
}: {
  slug: string;
  sessionId: string;
  revision: number;
  turnIndex: number;
  team: DraftTeam;
  pool: DraftIdentity[];
  players: DraftIdentity[];
  tiers?: ReadonlyMap<number, number>;
  capacity?: number | null;
  teamAnchorId?: string;
  staff: boolean;
  enabled: boolean;
  unavailableMessage: string;
  onFeedback: (message: string, publicVersion?: number) => void;
}) {
  const tr = useAppTranslations();

  const id = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [receiptPending, setReceiptPending] = useState(false);
  const [stale, setStale] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previousEnabled, setPreviousEnabled] = useState(enabled);
  const request = useRef<{
    sessionId: string;
    expectedVersion: number;
    turnIndex: number;
    candidateId: number;
    idempotencyKey: string;
  } | null>(null);
  const inFlight = useRef(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  // Disconnection/permission loss discards an unconfirmed proposal. A sent request keeps its receipt key.
  if (previousEnabled !== enabled) {
    setPreviousEnabled(enabled);
    if (!enabled && !receiptPending) {
      setSelected(null);
      setDragOver(false);
    }
  }
  const player = pool.find((p) => p.osuId === selected);
  const canStage =
    enabled && !pending && !committed && !receiptPending && !stale;
  const roster = [
    team.captain,
    ...players.filter((p) => p.osuId !== team.captain.osuId),
  ];
  const filtered = pool.filter(
    (p) =>
      p.username.toLowerCase().includes(query.toLowerCase()) ||
      String(p.osuId).includes(query.trim()),
  );
  function report(message: string, publicVersion?: number) {
    setStatus(message);
    onFeedback(message, publicVersion);
  }
  function choose(osuId: number) {
    if (!canStage || !pool.some((p) => p.osuId === osuId)) return;
    request.current = null;
    setSelected(osuId);
    setStatus("");
    setDragOver(false);
    requestAnimationFrame(() => confirmButton.current?.focus());
  }
  async function submit() {
    if (!enabled || !player || committed || stale || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setReceiptPending(true);
    setStatus("");
    request.current ??= {
      sessionId,
      expectedVersion: revision,
      turnIndex,
      candidateId: player.osuId,
      idempotencyKey: crypto.randomUUID(),
    };
    try {
      const response = await fetch(`/api/tournaments/${slug}/draft/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.current),
        signal: AbortSignal.timeout(12000),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) {
          setStale(true);
          setSelected(null);
          setReceiptPending(false);
        }
        report(
          result.error ??
            "The pick was not accepted. Wait for the current snapshot.",
        );
        return;
      }
      setCommitted(true);
      setSelected(null);
      report(
        result.corrected
          ? "This earlier pick was corrected. Follow the current snapshot."
          : `Pick committed to ${team.name}.`,
        result.publicVersion,
      );
    } catch {
      report(
        "Connection interrupted. Retry the same confirmed pick to check its receipt; do not choose another player until the snapshot refreshes.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <section
      className="draft-pick-workspace"
      aria-label={tr("Player selection")}
    >
      <section
        className="draft-player-pool"
        aria-labelledby={`${id}-pool-title`}
      >
        <div className="draft-room-heading">
          <h2 id={`${id}-pool-title`}>{tr("Player pool")}</h2>
          <span className="muted small">
            {filtered.length} {tr(" of ")}
            {pool.length}
          </span>
        </div>
        <label className="field">
          <span>{tr("Search eligible players")}</span>
          <input
            type="search"
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <InfoNote>
          <p className="muted small">
            {canStage
              ? tr("Drag a player into {value0}, or choose a player below.", {
                  value0: tr(staff ? "the receiving team" : "your team"),
                })
              : staff
                ? tr("Current eligible players.")
                : tr("Last published eligible players.")}
          </p>
        </InfoNote>
        <ul
          className="draft-player-list"
          aria-label={tr("Eligible players")}
          tabIndex={0}
        >
          {filtered.map((p) => (
            <li
              key={p.osuId}
              data-player-id={p.osuId}
              draggable={canStage}
              onDragStart={(event) => {
                if (!canStage) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.setData(
                  "application/x-oclr-draft-player",
                  JSON.stringify({
                    sessionId,
                    revision,
                    turnIndex,
                    teamId: team.id,
                    playerId: p.osuId,
                  }),
                );
                event.dataTransfer.effectAllowed = "copy";
              }}
              onDragEnd={() => setDragOver(false)}
            >
              <button
                type="button"
                id={`${id}-player-${p.osuId}`}
                disabled={!canStage}
                aria-label={tr("Choose {value0}", { value0: p.username })}
                aria-pressed={selected === p.osuId}
                onClick={() => choose(p.osuId)}
              >
                <PlayerIdentity player={p} />
              </button>
            </li>
          ))}
        </ul>
        {!filtered.length && (
          <p className="muted small">
            {pool.length
              ? tr("No matching players.")
              : tr("No eligible players in this snapshot.")}
          </p>
        )}
      </section>
      <section
        id={teamAnchorId}
        className={`draft-own-team ${dragOver && canStage ? "is-dragging" : ""}`}
        aria-label={staff ? tr("Receiving team") : tr("My team")}
        onDragOver={(event) => {
          if (
            canStage &&
            event.dataTransfer.types.includes("application/x-oclr-draft-player")
          ) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDragOver(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (!canStage) return;
          try {
            const value = JSON.parse(
              event.dataTransfer.getData("application/x-oclr-draft-player"),
            );
            if (
              value.sessionId === sessionId &&
              value.revision === revision &&
              value.turnIndex === turnIndex &&
              value.teamId === team.id
            )
              choose(value.playerId);
          } catch {
            /* Unrelated drags never select a player. */
          }
        }}
      >
        <div className="draft-room-heading">
          <h2>{staff ? tr("Receiving team") : tr("My team")}</h2>
          <span className="badge">
            {capacity == null
              ? tr("draft_members", { count: roster.length })
              : `${roster.length} / ${capacity}`}
          </span>
        </div>
        <h3>{team.name}</h3>
        {staff && (
          <p className="muted small">
            {tr("Picking on behalf of Captain ")}
            {team.captain.username}.
          </p>
        )}
        <ul
          className="draft-team-list"
          aria-label={
            staff ? tr("Receiving team roster") : tr("My team roster")
          }
        >
          {roster.map((p) => {
            const tier = tiers?.get(p.osuId);
            return (
              <li key={p.osuId}>
                <PlayerIdentity player={p} />
                {p.osuId === team.captain.osuId ? (
                  <span className="badge">{tr("Captain")}</span>
                ) : tier ? (
                  <span className="badge">{`Tier ${tier}`}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {capacity != null && (
          <p className="muted small">
            {Math.max(0, capacity - roster.length)} {tr(" available roster")}{" "}
            {capacity - roster.length === 1 ? tr("slot") : tr("slots")}
          </p>
        )}
        <section
          className="draft-pending-pick"
          aria-label={tr("Pending selection")}
        >
          {player && !committed ? (
            <>
              <p className="eyebrow">{tr("Pending selection")}</p>
              <PlayerIdentity player={player} />
              <p className="muted small">
                {tr("Confirm to draft this player to ")}
                {team.name}.
              </p>
            </>
          ) : canStage ? (
            <p className="muted small">
              {tr("Drop or choose a player to prepare your pick.")}
            </p>
          ) : null}
          <div className="actions">
            <button
              type="button"
              ref={confirmButton}
              disabled={!enabled || !player || pending || committed || stale}
              onClick={submit}
            >
              {pending
                ? tr("Submitting…")
                : receiptPending && !committed
                  ? tr("Retry confirmed pick")
                  : staff
                    ? tr("Select for Captain {value0}", {
                        value0: team.captain.username,
                      })
                    : tr("Confirm Pick")}
            </button>
            {player && !receiptPending && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const previous = selected;
                  setSelected(null);
                  setStatus("Selection cancelled.");
                  document.getElementById(`${id}-player-${previous}`)?.focus();
                }}
              >
                {tr("Cancel selection")}
              </button>
            )}
          </div>
        </section>
        <p
          className={status || !enabled ? "draft-pick-status small" : "sr-only"}
          role="status"
          aria-live="polite"
        >
          {status
            ? tr(status)
            : player
              ? tr("{value0} selected. Confirm the pending pick when ready.", {
                  value0: player.username,
                })
              : !enabled
                ? tr(unavailableMessage)
                : ""}
        </p>
      </section>
    </section>
  );
}
