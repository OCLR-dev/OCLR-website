"use client";
import { ReadOnlyFields } from "./staff-read-only";
import { useId, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { MappoolWorkspace } from "@/lib/mappools";
import { WorkspaceTabs } from "./workspace-tabs";
import { ConfirmMutation } from "./confirm-mutation";
import styles from "./round-manager.module.css";
type Round = MappoolWorkspace["rounds"][number];

function RoundForm({
  url,
  stage,
  round,
  nextPosition,
  onSuccess,
  onError,
}: {
  url: string;
  stage: string;
  round?: Round;
  nextPosition: number;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const tr = useAppTranslations();
  const [name, setName] = useState(round?.name ?? "");
  const [position, setPosition] = useState(
    String(round?.position ?? nextPosition),
  );
  const label = round ? tr("Save round") : tr("Create round");
  return (
    <ReadOnlyFields>
      <div className="form-stack">
        <label className="field">
          <span>{tr("Round name")}</span>
          <input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder={tr("Approved round label")}
          />
        </label>
        <label className="field">
          <span>{tr("Round order")}</span>
          <input
            type="number"
            min={1}
            max={999}
            value={position}
            onChange={(event) => setPosition(event.target.value)}
          />
        </label>
        <div className="actions">
          <ConfirmMutation
            label={label}
            title={label}
            requireConfirmation={false}
            canConfirm={
              Boolean(name.trim()) &&
              Number.isInteger(Number(position)) &&
              Number(position) >= 1 &&
              Number(position) <= 999
            }
            url={url}
            onSuccess={onSuccess}
            onError={onError}
            payload={
              round
                ? {
                    action: "round_edit",
                    roundId: round.id,
                    expectedVersion: round.version,
                    name,
                    position: Number(position),
                    confirmed: true,
                  }
                : {
                    action: "round_create",
                    stage,
                    name,
                    position: Number(position),
                    confirmed: true,
                  }
            }
          />
        </div>
      </div>
    </ReadOnlyFields>
  );
}

export function RoundManager({
  slug,
  rounds: allRounds,
  initialStage,
  initialRoundId,
}: {
  slug: string;
  rounds: MappoolWorkspace["rounds"];
  initialStage: "group" | "knockout";
  initialRoundId?: string;
}) {
  const tr = useAppTranslations();
  const id = useId();
  const [stage, setStage] = useState<string>(initialStage);
  const [editing, setEditing] = useState<string | null>(initialRoundId ?? null);
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const rounds = allRounds.filter((round) => round.stage === stage);
  const url = `/api/admin/tournaments/${slug}/mappools`;
  function closeEditor() {
    const trigger =
      editing === "new" ? `${id}-create` : `${id}-${editing}-edit`;
    setEditing(null);
    requestAnimationFrame(() => document.getElementById(trigger)?.focus());
  }
  const failed = (message: string) => setFeedback({ message, error: true });
  return (
    <div className={`${styles.manager} round-manager`}>
      <div className={styles.toolbar}>
        <WorkspaceTabs
          id={`${id}-stage`}
          label={tr("Competition stage")}
          appearance="line"
          value={stage}
          items={[
            { value: "group", label: "Group Stage" },
            { value: "knockout", label: "Knockout Stage" },
          ]}
          onChange={(value) => {
            setStage(value);
            setEditing(null);
            setFeedback(null);
          }}
        />
        <button
          type="button"
          className="secondary"
          id={`${id}-create`}
          aria-expanded={editing === "new"}
          aria-controls={editing === "new" ? `${id}-new` : undefined}
          onClick={() => {
            setEditing(editing === "new" ? null : "new");
            setFeedback(null);
          }}
        >
          {tr("+ New round")}
        </button>
      </div>
      {feedback && (
        <p
          className={`notice${feedback.error ? " error-text" : ""}`}
          role={feedback.error ? "alert" : "status"}
        >
          {tr(feedback.message)}
        </p>
      )}
      <div
        role="tabpanel"
        id={`${id}-stage-panel`}
        aria-labelledby={`${id}-stage-${stage}`}
        tabIndex={0}
      >
        {editing === "new" && (
          <section
            className={styles.editor}
            id={`${id}-new`}
            aria-label={tr("Create a round")}
          >
            <div className={styles.toolbar}>
              <h2>{tr("Create a round")}</h2>
              <button type="button" className="secondary" onClick={closeEditor}>
                {tr("Cancel")}
              </button>
            </div>
            <RoundForm
              url={url}
              stage={stage}
              nextPosition={
                Math.max(0, ...rounds.map((round) => round.position)) + 1
              }
              onError={failed}
              onSuccess={() => {
                closeEditor();
                setFeedback({ message: tr("Round saved."), error: false });
              }}
            />
          </section>
        )}
        {rounds.length ? (
          <ul className={styles.list} aria-label={tr("Rounds")}>
            {rounds.map((round) => (
              <li key={round.id}>
                <div className={styles.toolbar}>
                  <div>
                    <h2>{round.name}</h2>
                    <p className="muted small">
                      {tr("Round order")}: {round.position}
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="secondary"
                      id={`${id}-${round.id}-edit`}
                      aria-expanded={editing === round.id}
                      aria-controls={
                        editing === round.id ? `${id}-${round.id}` : undefined
                      }
                      onClick={() => {
                        setEditing(editing === round.id ? null : round.id);
                        setFeedback(null);
                      }}
                    >
                      {tr("Edit round")}
                    </button>
                    <ConfirmMutation
                      label={tr("Delete round")}
                      className="secondary destructive-action"
                      title={tr("Delete round “{name}”?", { name: round.name })}
                      description={tr(
                        "Only an empty round without mappools, fixtures or protected competition history can be deleted. This cannot be undone; audit history is retained.",
                      )}
                      url={url}
                      payload={{
                        action: "round_delete",
                        roundId: round.id,
                        expectedVersion: round.version,
                        confirmed: true,
                      }}
                      onError={failed}
                      onSuccess={() => {
                        setEditing(null);
                        setFeedback({
                          message: tr("Round deleted."),
                          error: false,
                        });
                        requestAnimationFrame(() =>
                          document.getElementById(`${id}-create`)?.focus(),
                        );
                      }}
                    />
                  </div>
                </div>
                {editing === round.id && (
                  <section
                    className={styles.editor}
                    id={`${id}-${round.id}`}
                    aria-label={tr("Edit selected round")}
                  >
                    <div className={styles.toolbar}>
                      <h3>{tr("Edit selected round")}</h3>
                      <button
                        type="button"
                        className="secondary"
                        onClick={closeEditor}
                      >
                        {tr("Cancel")}
                      </button>
                    </div>
                    <RoundForm
                      key={`${round.id}-${round.version}`}
                      url={url}
                      round={round}
                      stage={stage}
                      nextPosition={round.position}
                      onError={failed}
                      onSuccess={() => {
                        closeEditor();
                        setFeedback({
                          message: tr("Round saved."),
                          error: false,
                        });
                      }}
                    />
                  </section>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{tr("No rounds in this stage.")}</p>
        )}
      </div>
    </div>
  );
}
