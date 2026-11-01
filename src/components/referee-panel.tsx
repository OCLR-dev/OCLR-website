"use client";
import { RefereeMp } from "./referee-mp";
import { useStaffReadOnly } from "./staff-read-only";
import Link from "next/link";
import { refereeMessage } from "@/i18n/referee";
import { useEffect, useId, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { RefereeWorkspace, RefereeCommand } from "@/lib/referee";
import {
  refereeOrderConflicts,
  projectReferee,
  validateRefereeAction,
  refereeActionSchema,
  resolveRefereeActor,
  type RefereeEvent,
} from "@/lib/referee-model";
import { bpSyncSource } from "@/lib/referee-sync";
import { refereeCommands } from "@/lib/referee-commands";
import { RefereeIrc } from "./referee-irc";
import { RefereeCommands } from "./referee-commands";
import { RefereeReconciliation } from "./referee-reconciliation";
import styles from "./referee-panel.module.css";

type Action = RefereeCommand extends infer C
  ? C extends RefereeCommand
    ? Omit<C, "requestKey" | "expectedRevision" | "dependencyFingerprint">
    : never
  : never;
export function RefereePanel({
  data: initial,
  slug,
  simulation = false,
}: {
  data: RefereeWorkspace;
  slug: string;
  simulation?: boolean;
}) {
  const tr = useAppTranslations();
  const readOnly = useStaffReadOnly();
  const newestRevision = useRef(initial.session?.revision ?? 0);
  const controlId = useId();
  const [data, setData] = useState(initial);
  const [firstBan, setFirstBan] = useState(
    initial.session?.firstBanTeamId ?? "",
  );
  const [firstPick, setFirstPick] = useState(
    initial.session?.firstPickTeamId ?? "",
  );
  const [activeStage, setActiveStage] = useState("referee-preparation");
  useEffect(() => {
    const ids = ["referee-preparation", "referee-bp", "referee-post-match"];
    const updateStage = () => {
      const current = ids
        .filter(
          (id) =>
            (document.getElementById(id)?.getBoundingClientRect().top ??
              Infinity) <= 180,
        )
        .at(-1);
      const atEnd =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 2;
      setActiveStage(atEnd ? ids[2] : (current ?? ids[0]));
    };
    updateStage();
    window.addEventListener("scroll", updateStage, { passive: true });
    return () => window.removeEventListener("scroll", updateStage);
  }, []);
  const [selected, setSelected] = useState("");
  const [simulationEpoch, setSimulationEpoch] = useState(0);
  const [simulationEvents, setSimulationEvents] = useState<RefereeEvent[]>([]);
  const [simulationOrders, setSimulationOrders] = useState({
    firstBanTeamId: initial.session?.firstBanTeamId ?? null,
    firstPickTeamId: initial.session?.firstPickTeamId ?? null,
  });
  const [syncEvents, setSyncEvents] = useState<{ id: string; text: string }[]>(
    [],
  );
  function addSync(workspace: RefereeWorkspace, eventId: string) {
    const source = bpSyncSource(workspace, eventId);
    if (source)
      setSyncEvents((current) => {
        const pending = source.withdrawn
          ? current.filter((e) => e.id !== source.selectionId)
          : current;
        return pending.some((e) => e.id === eventId)
          ? pending
          : [...pending, { id: eventId, text: source.text }];
      });
  }
  const [ircDraft, setIrcDraft] = useState("");
  const [ircSelection, setIrcSelection] = useState<{
    entryId: string;
    text: string;
    label: string;
  } | null>(null);
  const [sentCommands, setSentCommands] = useState<string[]>([]);
  function prepareCommand(text: string) {
    setIrcDraft(text);
    setIrcSelection(null);
  }
  const appliedOrders = simulation
    ? simulationOrders
    : {
        firstBanTeamId: data.session?.firstBanTeamId ?? null,
        firstPickTeamId: data.session?.firstPickTeamId ?? null,
      };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<RefereeCommand | null>(null);
  const writing = useRef(false);
  const endpoint = `/api/admin/tournaments/${slug}/matches/${data.fixture.id}/referee`;
  const teamName = (id: string | null, neutral = true) =>
    data.teams.find((t) => t.id === id)?.name ??
    refereeMessage(tr, neutral ? "Neutral tiebreaker" : "Not set");
  const dirtyOrder =
    firstBan !== (appliedOrders.firstBanTeamId ?? "") ||
    firstPick !== (appliedOrders.firstPickTeamId ?? "");
  const stale = Boolean(
    data.session &&
    data.session.dependencyFingerprint !== data.dependencyFingerprint,
  );
  const basis = data.session?.basis ?? {
    policy: data.policy,
    teamIds: data.teams.map((t) => t.id),
    maps: data.maps,
    series: data.series,
  };
  const model = {
    exPlayersPerTeam: data.rules?.exPlayersPerTeam,
    ...basis,
    orders: appliedOrders,
    events: simulation ? [...data.events, ...simulationEvents] : data.events,
  };
  const conflicts = refereeOrderConflicts(model, {
    firstBanTeamId: firstBan || null,
    firstPickTeamId: firstPick || null,
  });
  const map = data.maps.find((m) => m.id === selected) ?? null;
  function accept(next: RefereeWorkspace) {
    if ((next.session?.revision ?? 0) < newestRevision.current) return;
    newestRevision.current = next.session?.revision ?? 0;
    setData(next);
    setFirstBan(next.session?.firstBanTeamId ?? "");
    setFirstPick(next.session?.firstPickTeamId ?? "");
  }
  function prepareRecordedSelection(
    workspace: RefereeWorkspace,
    entryId: string,
  ) {
    const chosen = workspace.maps.find((map) => map.id === entryId);
    if (!chosen) return;
    setSelected(entryId);
  }

  async function refresh() {
    if (simulation) {
      setSimulationEvents([]);
      setSimulationOrders({
        firstBanTeamId: initial.session?.firstBanTeamId ?? null,
        firstPickTeamId: initial.session?.firstPickTeamId ?? null,
      });
      setFirstBan(initial.session?.firstBanTeamId ?? "");
      setFirstPick(initial.session?.firstPickTeamId ?? "");
      setIrcDraft("");
      setIrcSelection(null);
      setSentCommands([]);
      setSyncEvents([]);
      setError("");
      setSimulationEpoch((v) => v + 1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "Unable to reload the referee workspace.",
        );
      accept(body);
      setNotice(tr("Reloaded saved referee state."));
    } catch (e) {
      setError(
        refereeMessage(
          tr,
          e instanceof Error
            ? e.message
            : "Unable to reload the referee workspace.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function send(action?: Action) {
    if (busy || writing.current) return false;
    if (simulation) {
      writing.current = true;
      if (!action || !data.canRecord) {
        writing.current = false;
        return false;
      }
      try {
        if (action.action === "save_settings") {
          return false;
        }
        const parsed = refereeActionSchema.parse(action);
        const payload = validateRefereeAction(model, parsed);
        if (payload.type === "order_set") setSimulationOrders(payload);
        if (payload.type === "selection_recorded")
          prepareRecordedSelection(data, payload.entryId);
        const event: RefereeEvent = {
          id: crypto.randomUUID(),
          ordinal: model.events.length + 1,
          actorId: 0,
          createdAt: new Date().toISOString(),
          payload,
        };
        const events = [...model.events, event];
        setSimulationEvents((current) => [...current, event]);
        addSync(
          { ...data, events, projection: projectReferee({ ...model, events }) },
          event.id,
        );
        setError("");
        return true;
      } catch (e) {
        setError(
          refereeMessage(
            tr,
            e instanceof Error
              ? e.message
              : "Unable to save the referee action.",
          ),
        );
        return false;
      } finally {
        queueMicrotask(() => {
          writing.current = false;
        });
      }
    }
    writing.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const payload = action
      ? ({
          ...action,
          requestKey: crypto.randomUUID(),
          expectedRevision: data.session?.revision ?? 0,
          dependencyFingerprint: data.dependencyFingerprint,
        } as RefereeCommand)
      : pending.current;
    if (!payload) {
      writing.current = false;
      setBusy(false);
      return;
    }
    pending.current = payload;
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status < 500) {
          pending.current = null;
          setUncertain(false);
        } else setUncertain(true);
        throw new Error(body.error ?? "Unable to save the referee action.");
      }
      accept(body.workspace);
      pending.current = null;
      setUncertain(false);
      setNotice(tr("Referee record saved."));
      if (payload.action === "record_selection") {
        prepareRecordedSelection(body.workspace, payload.entryId);
      }
      if (body.receipt?.eventId) addSync(body.workspace, body.receipt.eventId);
      return true;
    } catch (e) {
      if (pending.current) setUncertain(true);
      setError(
        refereeMessage(
          tr,
          e instanceof Error && !(e instanceof TypeError)
            ? e.message
            : "Unable to save the referee action.",
        ),
      );
      return false;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  const disabled = busy || uncertain || !data.canRecord;
  const state = simulation ? projectReferee(model) : data.projection;
  const exPick = state.activeSelections.find(
    (s) => s.id === state.lastSelectionId,
  );
  function historyDetail(event: RefereeEvent) {
    const p = event.payload;
    if (p.type === "order_set") {
      return `${tr("First Ban team")}: ${teamName(p.firstBanTeamId)} · ${tr("First Pick team")}: ${teamName(p.firstPickTeamId)}`;
    }
    if (p.type === "selection_recorded") {
      return `${tr("Step {number}", { number: p.stepIndex + 1 })} · ${p.kind.toUpperCase()} · ${tr("Selected by {team}", { team: teamName(p.teamId) })} · ${p.category} · ${p.beatmapId}`;
    }
    if (p.type === "ex_declared")
      return `${tr("EX mode")} · ${p.enabled ? tr("Yes") : tr("No")}`;
    if (p.type === "settings_saved") {
      return `${tr("Room name")}: ${p.settings.roomName || tr("Not set")} · ${tr("Timer seconds")}: ${p.settings.timerSeconds ?? tr("Not set")} · ${tr("Start countdown seconds")}: ${p.settings.startSeconds ?? tr("Not set")}`;
    }
    if (p.type === "policy_configured") {
      return p.policy.steps
        .map((step, index) => `${index + 1}. ${step.kind.toUpperCase()}`)
        .join(" → ");
    }
    if (p.type === "dependencies_reconfirmed") return "";
    const pickId = p.type === "selection_voided" ? p.selectionId : p.pickId;
    const selection = state.selections.find((item) => item.id === pickId);
    if (!selection) return "";
    const step = `${tr("Step {number}", { number: selection.stepIndex + 1 })} · ${selection.category} · ${selection.beatmapId}`;
    if (p.type === "selection_voided") return step;
    const attemptId = p.type === "attempt_replayed" ? event.id : p.attemptId;
    const attempt = selection.attempts.find((item) => item.id === attemptId);
    const description = `${step} · ${tr("Attempt {number}", { number: attempt?.number ?? 1 })}`;
    if (p.type !== "attempt_resolved") return description;
    const outcome = (status: string, winner: string | null) =>
      `${refereeMessage(tr, status)}${winner ? ` · ${tr("Winner")}: ${teamName(winner)}` : ""}`;
    const previous = data.events
      .filter(
        (item) =>
          item.ordinal < event.ordinal &&
          item.payload.type === "attempt_resolved" &&
          item.payload.attemptId === p.attemptId,
      )
      .at(-1)?.payload;
    return `${description} · ${previous?.type === "attempt_resolved" ? `${outcome(previous.status, previous.winnerTeamId)} → ` : ""}${outcome(p.status, p.winnerTeamId)}`;
  }
  return (
    <div className={styles.workspace}>
      <nav className={styles.stageNav} aria-label={tr("Referee stages")}>
        {[
          { id: "referee-preparation", label: tr("Pre-match preparation") },
          { id: "referee-bp", label: tr("BP stage") },
          { id: "referee-post-match", label: tr("Post-match calculation") },
        ].map((stage, index) => (
          <a
            key={stage.id}
            href={`#${stage.id}`}
            aria-current={activeStage === stage.id ? "location" : undefined}
            onClick={() => setActiveStage(stage.id)}
          >
            <span className={styles.navNumber}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>{stage.label}</span>
          </a>
        ))}
      </nav>
      <div className={styles.stageContent}>
        {simulation && (
          <p className="notice">
            {tr(
              "Simulation records stay in this page and reset on reload. No IRC command or match result is submitted.",
            )}
          </p>
        )}
        <div className="actions">
          <Link
            className="button secondary"
            href={`/admin/tournaments/${slug}/matches`}
          >
            {tr("My assigned matches")}
          </Link>
          <Link
            className="button secondary"
            href={`/admin/tournaments/${slug}/matches/${data.fixture.id}`}
          >
            {tr("Post-match review")}
          </Link>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={refresh}
          >
            {tr("Reload saved state")}
          </button>
        </div>

        <section
          id="referee-preparation"
          className={styles.stage}
          aria-labelledby="referee-preparation-title"
        >
          <header className={styles.stageHeading}>
            <span className={styles.stageNumber}>01</span>
            <h2 id="referee-preparation-title">
              {tr("Pre-match preparation")}
            </h2>
          </header>
          <RefereeCommands
            key={`preparation-${data.session?.revision ?? 0}`}
            stage="preparation"
            onPrepare={prepareCommand}
            sentCommands={sentCommands}
            mapSelector={
              <label className="field" htmlFor={`${controlId}-preparation-map`}>
                <span id={`${controlId}-preparation-map-label`}>
                  {tr("Preparation map")}
                </span>
                <select
                  id={`${controlId}-preparation-map`}
                  aria-labelledby={`${controlId}-preparation-map-label`}
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">{tr("Not set")}</option>
                  {data.maps.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.category}
                      {entry.position} · {entry.metadata.title}
                    </option>
                  ))}
                </select>
              </label>
            }
            settings={data.defaultSettings}
            policy={data.policy?.commands ?? null}
            rules={data.rules}
            teams={data.teams}
            selectedMap={map}
          />
        </section>
        <section
          id="referee-bp"
          className={styles.stage}
          aria-labelledby="referee-bp-title"
        >
          <header className={styles.stageHeading}>
            <span className={styles.stageNumber}>02</span>
            <h2 id="referee-bp-title">{tr("BP stage")}</h2>
          </header>
          <section className="panel form-stack" aria-labelledby="referee-score">
            <div className={styles.topline}>
              <div>
                <p className="eyebrow" id="referee-score">
                  {tr("Referee temporary score")}
                </p>
                <div className={styles.score}>
                  {data.teams
                    .map((t) => `${t.name} ${state.score[t.id] ?? 0}`)
                    .join(" — ") || tr("Teams not resolved")}
                </div>
              </div>
              <span className="badge">
                {state.complete
                  ? tr("Temporary series complete")
                  : tr("Private Staff workspace")}
              </span>
            </div>
            <p className="muted">
              {tr(
                "Prepare a map command, then confirm it in IRC to advance the Ban / Pick record.",
              )}
            </p>
            {!data.canRecord && (
              <p className="notice">
                {tr("Read-only access. Referee records cannot be changed.")}
              </p>
            )}
            {data.readiness.length > 0 && (
              <ul className="notice">
                {data.readiness.map((message, i) => (
                  <li key={i}>{refereeMessage(tr, message)}</li>
                ))}
              </ul>
            )}
            {stale && (
              <button
                type="button"
                className="secondary"
                disabled={disabled || state.activeSelections.length > 0}
                onClick={() => send({ action: "reconfirm_dependencies" })}
              >
                {tr("Recheck fixture dependencies")}
              </button>
            )}
            <div className={styles.orders}>
              <label className="field" htmlFor={`${controlId}-first-ban`}>
                <span id={`${controlId}-first-ban-label`}>
                  {tr("First Ban team")}
                </span>
                <select
                  id={`${controlId}-first-ban`}
                  aria-labelledby={`${controlId}-first-ban-label`}
                  value={firstBan}
                  disabled={disabled || stale}
                  onChange={(e) => {
                    setFirstBan(e.target.value);
                    setIrcSelection(null);
                  }}
                >
                  <option value="">{tr("Not set")}</option>
                  {data.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor={`${controlId}-first-pick`}>
                <span id={`${controlId}-first-pick-label`}>
                  {tr("First Pick team")}
                </span>
                <select
                  id={`${controlId}-first-pick`}
                  aria-labelledby={`${controlId}-first-pick-label`}
                  value={firstPick}
                  disabled={disabled || stale}
                  onChange={(e) => {
                    setFirstPick(e.target.value);
                    setIrcSelection(null);
                  }}
                >
                  <option value="">{tr("Not set")}</option>
                  {data.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="actions">
              <button
                type="button"
                disabled={
                  disabled ||
                  stale ||
                  !dirtyOrder ||
                  !firstBan ||
                  !firstPick ||
                  conflicts.length > 0
                }
                onClick={() =>
                  send({
                    action: "set_order",
                    firstBanTeamId: firstBan,
                    firstPickTeamId: firstPick,
                  })
                }
              >
                {tr("Apply order")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy || !dirtyOrder}
                onClick={() => {
                  setFirstBan(appliedOrders.firstBanTeamId ?? "");
                  setFirstPick(appliedOrders.firstPickTeamId ?? "");
                }}
              >
                {tr("Discard unsaved order")}
              </button>
              <span className="small muted">
                {dirtyOrder
                  ? tr("Order preview — not saved")
                  : tr("Showing applied order")}
              </span>
            </div>
            {conflicts.length > 0 && (
              <p role="status">
                {tr("Withdraw conflicting steps in reverse order: {steps}", {
                  steps: conflicts.join(", "),
                })}
              </p>
            )}
            {data.policy && (
              <details>
                <summary>{tr("Preview Ban / Pick sequence")}</summary>
                <ol>
                  {data.policy.steps.map((step, index) => (
                    <li key={index}>
                      {step.kind.toUpperCase()} ·{" "}
                      {teamName(
                        resolveRefereeActor(
                          step.actor,
                          {
                            firstBanTeamId: firstBan || null,
                            firstPickTeamId: firstPick || null,
                          },
                          data.teams.map((t) => t.id),
                        ),
                        step.actor === "neutral",
                      )}
                      {step.kind === "tb"
                        ? ` · ${step.tiedAt}:${step.tiedAt}`
                        : ""}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </section>
          <div aria-live="polite">
            {notice && <p className="notice">{notice}</p>}
            {error && (
              <p role="alert" className="notice">
                {error}
              </p>
            )}
            {uncertain && (
              <div className="panel form-stack">
                <p>
                  {tr(
                    "The save outcome is unknown. Retry the same request before making another change.",
                  )}
                </p>
                <button disabled={busy} onClick={() => send()}>
                  {tr("Retry same request")}
                </button>
              </div>
            )}
          </div>
          {!simulation && data.canRecord && !readOnly && (
            <RefereeMp
              endpoint={`${endpoint}/mp`}
              workspace={data}
              disabled={disabled}
              onWorkspace={(next) => {
                if ((next.session?.revision ?? 0) < newestRevision.current)
                  return;
                newestRevision.current = next.session?.revision ?? 0;
                setData(next);
              }}
            />
          )}
          <div className={styles.columns}>
            <section
              className={`panel ${styles.pinnedSummary}`}
              aria-label={tr("Referee records")}
            >
              <div className={styles.summaryHeading}>
                <span className="eyebrow">{tr("Series score")}</span>
                <div className={styles.summaryActions}>
                  {exPick &&
                    exPick.kind === "pick" &&
                    exPick.category !== "TB" &&
                    exPick.attempts.length === 1 &&
                    exPick.attempts[0]?.status === "pending" && (
                      <button
                        type="button"
                        className="secondary"
                        aria-pressed={Boolean(exPick.exMode)}
                        title={`${tr("BID")} ${exPick.beatmapId}`}
                        disabled={
                          disabled || stale || !data.rules?.exPlayersPerTeam
                        }
                        onClick={() =>
                          void send({
                            action: "declare_ex",
                            pickId: exPick.id,
                            enabled: !exPick.exMode,
                          })
                        }
                      >
                        {exPick.exMode ? tr("Cancel EX") : tr("Declare EX")}
                      </button>
                    )}
                  <button
                    type="button"
                    className="secondary"
                    disabled={disabled || !state.lastSelectionId}
                    onClick={() => send({ action: "void_last" })}
                  >
                    {tr("Withdraw last Ban / Pick")}
                  </button>
                </div>
              </div>
              <div className={styles.summaryScore}>
                {data.teams.length === 2 ? (
                  <>
                    <div className={styles.summaryTeam} data-team="red">
                      <span>{data.teams[1].name}</span>
                      <strong>{state.score[data.teams[1].id] ?? 0}</strong>
                    </div>
                    <span className={styles.scoreDivider} aria-hidden="true">
                      :
                    </span>
                    <div className={styles.summaryTeam} data-team="blue">
                      <span>{data.teams[0].name}</span>
                      <strong>{state.score[data.teams[0].id] ?? 0}</strong>
                    </div>
                  </>
                ) : (
                  <span>{tr("Teams not resolved")}</span>
                )}
              </div>
              <dl className={styles.summaryRows}>
                <div>
                  <dt>{tr("BP sequence")}</dt>
                  <dd>
                    {state.activeSelections.length
                      ? state.activeSelections.map((s) => (
                          <span key={s.id}>
                            {teamName(s.teamId)} {s.kind.toUpperCase()}{" "}
                            {s.category}
                            {
                              data.maps.find((m) => m.id === s.entryId)
                                ?.position
                            }
                          </span>
                        ))
                      : "—"}
                  </dd>
                </div>
                {state.activeSelections.some((s) => s.attempts.length > 1) && (
                  <div>
                    <dt>{tr("Replay history")}</dt>
                    <dd>
                      {state.activeSelections.some((s) => s.attempts.length > 1)
                        ? state.activeSelections
                            .filter((s) => s.attempts.length > 1)
                            .map((s) => (
                              <span key={s.id}>
                                {s.category}
                                {
                                  data.maps.find((m) => m.id === s.entryId)
                                    ?.position
                                }{" "}
                                ·{" "}
                                {tr("Replays used: {used} / {limit}", {
                                  used: s.attempts.length - 1,
                                  limit: basis.policy?.maxReplaysPerMap ?? "—",
                                })}
                              </span>
                            ))
                        : "—"}
                    </dd>
                  </div>
                )}
                {state.activeSelections.some((s) => s.kind !== "ban") && (
                  <div>
                    <dt>{tr("Map outcomes")}</dt>
                    <dd>
                      {state.activeSelections.some((s) => s.kind !== "ban")
                        ? state.activeSelections
                            .filter((s) => s.kind !== "ban")
                            .map((s) => {
                              const attempt = s.attempts.at(-1);
                              return (
                                <span key={s.id}>
                                  {s.category}
                                  {
                                    data.maps.find((m) => m.id === s.entryId)
                                      ?.position
                                  }{" "}
                                  ·{" "}
                                  {attempt?.winnerTeamId
                                    ? tr("Winner: {team}", {
                                        team: teamName(attempt.winnerTeamId),
                                      })
                                    : refereeMessage(
                                        tr,
                                        attempt?.status ?? "pending",
                                      )}
                                </span>
                              );
                            })
                        : "—"}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
            <section
              className={`panel ${styles.pool}`}
              aria-labelledby="referee-pool"
            >
              <h2 id="referee-pool">{tr("Round mappool")}</h2>

              <p role="status">
                {state.nextStep
                  ? tr("Step {number}: {action} · {team}", {
                      number: state.nextStep.index + 1,
                      action: state.nextStep.kind.toUpperCase(),
                      team: teamName(state.nextStep.teamId),
                    })
                  : tr("No further configured step")}
              </p>
              {Array.from(new Set(data.maps.map((m) => m.category))).map(
                (category) => (
                  <section
                    className={styles.poolGroup}
                    key={category}
                    aria-label={category}
                  >
                    <h3>
                      {(
                        {
                          NM: "No Mod",
                          HD: "Hidden",
                          HR: "Hard Rock",
                          DT: "Double Time",
                          FM: "Free Mod",
                          TB: "Tiebreaker",
                        } as Record<string, string>
                      )[category] ?? category}
                    </h3>
                    {data.maps
                      .filter((m) => m.category === category)
                      .map((m) => {
                        const used = state.activeSelections.find(
                          (s) => s.entryId === m.id,
                        );
                        let allowed = true;
                        try {
                          validateRefereeAction(model, {
                            action: "record_selection",
                            entryId: m.id,
                          });
                        } catch {
                          allowed = false;
                        }
                        return (
                          <div
                            className={styles.poolRow}
                            key={m.id}
                            data-selected={ircSelection?.entryId === m.id}
                          >
                            <div>
                              <strong>
                                {m.category}
                                {m.position}
                              </strong>{" "}
                              <span>{m.metadata.title}</span>
                              <small>
                                {m.metadata.artist} · {m.metadata.difficulty}
                              </small>
                            </div>
                            {used ? (
                              <span className="badge">
                                {teamName(used.teamId)} ·{" "}
                                {used.kind.toUpperCase()}
                              </span>
                            ) : (
                              <div className={styles.poolActions}>
                                {(["ban", "pick"] as const).flatMap((kind) =>
                                  data.teams
                                    .map((team, index) => (
                                      <button
                                        key={`${kind}-${team.id}`}
                                        type="button"
                                        className="secondary"
                                        data-team={index === 0 ? "blue" : "red"}
                                        disabled={
                                          disabled ||
                                          stale ||
                                          dirtyOrder ||
                                          !allowed ||
                                          (state.nextStep?.kind === "tb"
                                            ? kind !== "pick"
                                            : state.nextStep?.kind !== kind) ||
                                          (state.nextStep?.teamId !== null &&
                                            state.nextStep?.teamId !== team.id)
                                        }
                                        onClick={() => {
                                          void send({
                                            action: "record_selection",
                                            entryId: m.id,
                                          });
                                        }}
                                      >
                                        {index === 0
                                          ? tr("Blue team")
                                          : tr("Red team")}{" "}
                                        {kind.toUpperCase()}
                                      </button>
                                    ))
                                    .toReversed(),
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </section>
                ),
              )}
              {state.issues.map((message, i) => (
                <p className="small muted" key={i}>
                  {refereeMessage(tr, message)}
                </p>
              ))}
            </section>
            <details
              id="referee-record-editor"
              className={`panel ${styles.recordControls}`}
            >
              <summary>{tr("Record and correct outcomes")}</summary>
              {!state.activeSelections.length && (
                <p className="muted">{tr("No Ban or Pick recorded yet.")}</p>
              )}
              {state.activeSelections.map((s) => {
                const attempt = s.attempts.at(-1);
                const last = s.id === state.lastSelectionId;
                return (
                  <article key={s.id} className={styles.record}>
                    <h3>
                      {s.stepIndex + 1}. {s.kind.toUpperCase()} · {s.category}
                      {data.maps.find((m) => m.id === s.entryId)?.position ??
                        ""}
                    </h3>
                    <p>
                      {tr("Selected by {team}", { team: teamName(s.teamId) })} ·{" "}
                      {s.beatmapId}
                    </p>
                    {s.kind !== "ban" &&
                      basis.policy?.maxReplaysPerMap !== undefined && (
                        <p className="small muted">
                          {tr("Replays used: {used} / {limit}", {
                            used: s.attempts.length - 1,
                            limit: basis.policy.maxReplaysPerMap,
                          })}
                        </p>
                      )}
                    {s.kind !== "ban" && (
                      <p className="small muted">
                        {s.exMode ? tr("EX mode") : tr("Normal mode")}
                      </p>
                    )}
                    {s.attempts.map((a) => (
                      <p className="small" key={a.id}>
                        {tr("Attempt {number}", { number: a.number })} ·{" "}
                        {refereeMessage(tr, a.status)}
                        {a.winnerTeamId
                          ? ` · ${tr("Winner")}: ${teamName(a.winnerTeamId)}`
                          : ""}
                        {a.id !== attempt?.id
                          ? ` · ${tr("Superseded by replay")}`
                          : ""}
                      </p>
                    ))}
                    {last && attempt && (
                      <div className={styles.stack}>
                        <div className="actions">
                          {attempt.status === "pending" && (
                            <button
                              type="button"
                              className="secondary"
                              disabled={disabled || stale}
                              onClick={() =>
                                send({ action: "start_attempt", pickId: s.id })
                              }
                            >
                              {tr("Record actual start")}
                            </button>
                          )}
                          {data.teams.map((t) => (
                            <button
                              type="button"
                              key={t.id}
                              disabled={disabled || stale}
                              onClick={() =>
                                send({
                                  action: "resolve_attempt",
                                  pickId: s.id,
                                  status: "completed",
                                  winnerTeamId: t.id,
                                })
                              }
                            >
                              {tr("Record win: {team}", { team: t.name })}
                            </button>
                          ))}
                        </div>
                        <div className="actions">
                          <button
                            className="secondary"
                            disabled={disabled || stale}
                            onClick={() =>
                              send({
                                action: "resolve_attempt",
                                pickId: s.id,
                                status: "tied",
                                winnerTeamId: null,
                              })
                            }
                          >
                            {tr("Record tie")}
                          </button>
                          <button
                            className="secondary"
                            disabled={disabled || stale}
                            onClick={() =>
                              send({
                                action: "resolve_attempt",
                                pickId: s.id,
                                status: "aborted",
                                winnerTeamId: null,
                              })
                            }
                          >
                            {tr("Record abort")}
                          </button>
                          <button
                            className="secondary"
                            disabled={
                              disabled ||
                              stale ||
                              ["pending", "playing"].includes(attempt.status) ||
                              (basis.policy?.maxReplaysPerMap !== undefined &&
                                s.attempts.length - 1 >=
                                  basis.policy.maxReplaysPerMap)
                            }
                            onClick={() =>
                              send({ action: "replay_attempt", pickId: s.id })
                            }
                          >
                            {tr("Record replay")}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
              <details>
                <summary>{tr("Full correction history")}</summary>
                <ol className={styles.history}>
                  {model.events.map((e) => (
                    <li key={e.id}>
                      <strong>
                        {e.ordinal}. {refereeMessage(tr, e.payload.type)}
                      </strong>
                      <p>{historyDetail(e)}</p>
                      <p className="small muted">
                        {e.actorId} ·{" "}
                        <time dateTime={e.createdAt}>{e.createdAt}</time>
                      </p>
                    </li>
                  ))}
                </ol>
              </details>
            </details>
          </div>
        </section>
        <section
          id="referee-post-match"
          className={styles.stage}
          aria-labelledby="referee-post-match-title"
        >
          <header className={styles.stageHeading}>
            <span className={styles.stageNumber}>03</span>
            <h2 id="referee-post-match-title">
              {tr("Post-match calculation")}
            </h2>
          </header>
          {simulation ? (
            <p className="notice">
              {tr(
                "Simulation records stay in this page and reset on reload. No IRC command or match result is submitted.",
              )}
            </p>
          ) : (
            <RefereeReconciliation
              key={data.session?.revision ?? 0}
              slug={slug}
              fixtureId={data.fixture.id}
            />
          )}
        </section>
      </div>
      <RefereeIrc
        syncEvents={syncEvents}
        onSynced={(id) =>
          setSyncEvents((current) => current.filter((e) => e.id !== id))
        }
        fixtureId={data.fixture.id}
        key={simulationEpoch}
        endpoint={`${endpoint}/irc`}
        onWorkspace={(next) => {
          const incomingRevision = next.session?.revision ?? 0;
          const currentRevision = data.session?.revision ?? 0;
          if (
            incomingRevision >= currentRevision &&
            (incomingRevision !== currentRevision ||
              next.dependencyFingerprint !== data.dependencyFingerprint ||
              next.policyRevision !== data.policyRevision ||
              JSON.stringify(next.defaultSettings) !==
                JSON.stringify(data.defaultSettings))
          )
            accept(next);
        }}
        onConfirmed={(commands) =>
          setSentCommands((current) =>
            current.length === commands.length &&
            current.every((text, index) => text === commands[index])
              ? current
              : commands,
          )
        }
        onQueued={() => {
          setIrcDraft("");
          setIrcSelection(null);
        }}
        draft={ircDraft}
        simulation={simulation}
        disabled={disabled || stale}
        startSeconds={data.defaultSettings.startSeconds}
        timers={[
          data.policy?.commands?.banSeconds,
          data.policy?.commands?.pickSeconds,
          data.policy?.commands?.prepareSeconds,
        ]}
        selectedMods={
          refereeCommands({
            settings: data.defaultSettings,
            policy: data.policy?.commands ?? null,
            rules: data.rules,
            teams: data.teams,
            selectedMap: map,
          }).find((c) => c.kind === "mods")?.text ?? null
        }
        onChange={(text) => {
          setIrcDraft(text);
          if (text !== ircSelection?.text) setIrcSelection(null);
        }}
        onPrepare={prepareCommand}
        recordedSelectionLabel={ircSelection?.label ?? null}
        onConfirm={async () => {
          if (!simulation || disabled || stale || !ircDraft.trim())
            return false;
          setSentCommands((sent) => [...new Set([...sent, ircDraft])]);
          setIrcDraft("");
          setIrcSelection(null);
          return true;
        }}
      />
    </div>
  );
}
