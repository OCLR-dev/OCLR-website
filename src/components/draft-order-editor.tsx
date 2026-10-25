"use client";
import { ReadOnlyFields } from "./staff-read-only";

import { useAppTranslations } from "@/i18n/shared";

import { useState } from "react";
import type { StaffDraft } from "@/lib/draft";
import {
  generateTurnSequence,
  initialDraftOrderMode,
  maxDraftTurns,
  turnSequenceStructureProblem,
  type DraftOrderMode,
} from "@/lib/draft-order";
import { ConfirmMutation } from "./confirm-mutation";
export function DraftOrderEditor({
  slug,
  data,
}: {
  slug: string;
  data: StaffDraft;
}) {
  const tr = useAppTranslations();

  const teamIds = data.teams.map((t) => t.team.id);
  const saved = data.session?.turnSequence ?? [];
  const [mode, setMode] = useState<DraftOrderMode>(() =>
    initialDraftOrderMode(teamIds, saved),
  );
  const [custom, setCustom] = useState(saved);
  const capacities = data.teams.map((t) =>
    t.team.capacity === null ? null : t.team.capacity - 1,
  );
  const approvedRounds =
    capacities.length &&
    capacities.every((n) => n !== null && n === capacities[0] && n > 0)
      ? capacities[0]
      : null;
  const [rounds, setRounds] = useState(
    saved.length && teamIds.length && saved.length % teamIds.length === 0
      ? String(saved.length / teamIds.length)
      : approvedRounds
        ? String(approvedRounds)
        : "",
  );
  let sequence = custom,
    generationError = "";
  if (mode === "snake" || mode === "forward") {
    try {
      sequence = generateTurnSequence(teamIds, Number(rounds), mode);
    } catch (error) {
      sequence = [];
      generationError = (error as Error).message;
    }
  }
  const committed = data.session?.turnIndex ?? 0;
  const problem =
    sequence.length < committed ||
    sequence.slice(0, committed).some((id, i) => id !== saved[i])
      ? "Confirmed turns cannot be reassigned or removed. Edit future turns, or explicitly reset the draft."
      : generationError ||
        turnSequenceStructureProblem(
          sequence,
          data.teams.map(({ team }) => ({
            id: team.id,
            capacity: team.capacity,
            members: data.members.filter((m) => m.membership.teamId === team.id)
              .length,
          })),
        );
  const sameSaved = JSON.stringify(sequence) === JSON.stringify(saved);
  const version = data.session?.version ?? 0;
  const url = `/api/admin/tournaments/${slug}/draft`;
  const groups = Array.from(
    { length: Math.ceil(sequence.length / Math.max(teamIds.length, 1)) },
    (_, i) => sequence.slice(i * teamIds.length, (i + 1) * teamIds.length),
  );
  return (
    <ReadOnlyFields>
      <div className="draft-order-setup">
        <h3>{tr("Pick order")}</h3>
        <ol
          className="draft-captain-order"
          aria-label={tr("Reviewed captain order")}
        >
          {data.teams.map(({ team, captainName }) => (
            <li key={team.id}>
              <strong>{team.name}</strong>
              <span className="muted small">
                {tr("Captain ")}
                {captainName} ·{" "}
                {team.capacity === null
                  ? tr("Capacity not configured")
                  : tr("Capacity {value0}, including captain", {
                      value0: team.capacity,
                    })}
              </span>
            </li>
          ))}
        </ol>
        <div className="draft-order-fields">
          <label className="field">
            <span>{tr("Order mode")}</span>
            <select
              value={mode}
              onChange={(e) => {
                const next = e.target.value as DraftOrderMode;
                if (next === "custom") setCustom(sequence);
                setMode(next);
              }}
            >
              <option value="snake">{tr("Snake")}</option>
              <option value="forward">{tr("Repeat forward")}</option>
              <option value="custom">{tr("Custom")}</option>
            </select>
          </label>
          {mode !== "custom" && (
            <label className="field">
              <span>{tr("Pick rounds")}</span>
              <input
                type="number"
                min={1}
                max={Math.floor(maxDraftTurns / Math.max(teamIds.length, 1))}
                value={rounds}
                onChange={(e) => setRounds(e.target.value)}
              />
            </label>
          )}
        </div>
        {mode === "custom" && (
          <>
            <ol className="turn-editor">
              {custom.map((teamId, i) => (
                <li key={i}>
                  <label className="field">
                    <span>
                      {tr("Turn ")}
                      {i + 1}
                    </span>
                    <select
                      disabled={i < committed}
                      value={teamId}
                      onChange={(e) =>
                        setCustom(
                          custom.map((id, n) =>
                            n === i ? e.target.value : id,
                          ),
                        )
                      }
                    >
                      {data.teams.map(({ team, captainName }) => (
                        <option key={team.id} value={team.id}>
                          {team.name} — {captainName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="secondary"
                    aria-label={tr("Remove turn {value0}", { value0: i + 1 })}
                    disabled={i < committed}
                    onClick={() => setCustom(custom.filter((_, n) => n !== i))}
                  >
                    {tr("Remove")}
                  </button>
                </li>
              ))}
            </ol>
            <button
              className="secondary"
              disabled={
                !teamIds.length ||
                custom.length + teamIds.length > maxDraftTurns
              }
              onClick={() => setCustom([...custom, ...teamIds])}
            >
              {tr("Append captain order")}
            </button>
          </>
        )}
        <div className="draft-order-summary">
          <h3>{tr("Sequence preview")}</h3>
          <span className="muted small">
            {sequence.length} {tr(" picks · ")}
            {data.setupPoolSize ?? data.availablePool.length}{" "}
            {tr(" eligible players")}
          </span>
        </div>
        {sequence.length > 0 && (
          <div
            className="draft-order-preview"
            role="region"
            aria-label={tr("Full turn sequence preview")}
            tabIndex={0}
          >
            <ol>
              {groups.map((group, i) => (
                <li key={i}>
                  <span className="muted small">
                    {mode === "custom"
                      ? tr("Turns {value0}–{value1}", {
                          value0: i * teamIds.length + 1,
                          value1: i * teamIds.length + group.length,
                        })
                      : tr("Round {value0}", { value0: i + 1 })}
                  </span>
                  <ol>
                    {group.map((id, j) => {
                      const t = data.teams.find((t) => t.team.id === id);
                      return (
                        <li key={j}>
                          <span className="eyebrow">
                            {i * teamIds.length + j + 1}
                          </span>
                          <span>
                            {t?.team.name ?? tr("Unknown team")}
                            <small className="muted">{t?.captainName}</small>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          </div>
        )}
        {problem && (
          <p className="muted small" role="status">
            {tr(problem)}
          </p>
        )}
        {sequence.length - committed >
          (data.setupPoolSize ?? data.availablePool.length) && (
          <p className="notice small">
            {tr(
              "Planned turns exceed the current pool. You can save and start; each pick requires an available player.",
            )}
          </p>
        )}
        <div className="actions">
          <ConfirmMutation
            requireConfirmation={false}
            label={tr("Save draft configuration")}
            title={tr("Save draft configuration")}
            description={tr("Save the reviewed explicit sequence.")}
            disabled={Boolean(problem) || sameSaved}
            url={url}
            payload={{
              expectedVersion: version,
              confirmed: true,
              command: {
                action: "configure",
                turnSequence: sequence,
                expectedSetupVersion: data.edition?.setupVersion ?? 0,
              },
            }}
          />
          <ConfirmMutation
            requireConfirmation={false}
            label={
              data.session?.state === "paused"
                ? tr("Resume draft")
                : tr("Start draft")
            }
            title={tr("Start draft")}
            description={tr(
              "Start the saved turn order. Public release remains separate.",
            )}
            disabled={!data.session || !sameSaved || Boolean(problem)}
            url={url}
            payload={{
              expectedVersion: version,
              confirmed: true,
              command: {
                action: data.session?.state === "paused" ? "resume" : "start",
              },
            }}
          />
        </div>
      </div>
    </ReadOnlyFields>
  );
}
