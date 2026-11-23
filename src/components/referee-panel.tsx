"use client";
import { RefereeMp, type RefereeMpStatus } from "./referee-mp";
import { useSnapshotUpdates } from "./use-poll";
import { useStaffReadOnly } from "./staff-read-only";
import Link from "next/link";
import { refereeMessage, refereeMpIssueLabel } from "@/i18n/referee";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { RefereeWorkspace } from "@/lib/referee-workspace";
import type { RefereeCommand } from "@/lib/referee-write-contracts";
import {
  refereeOrderConflicts,
  projectReferee,
  lastRestorableSelectionId,
  validateRefereeAction,
  refereeActionSchema,
  resolveRefereeActor,
  type RefereeAttempt,
  type RefereeEvent,
} from "@/lib/referee-model";
import { bpSyncSource } from "@/lib/referee-sync";
import { refereeTeamSide } from "@/lib/referee-team-side";
import { refereeCommands } from "@/lib/referee-commands";
import { RefereeIrc } from "./referee-irc";
import { RefereeCommands } from "./referee-commands";
import { RefereeReconciliation } from "./referee-reconciliation";
import { PublicationSwitch } from "./publication-switch";
import styles from "./referee-panel.module.css";

const stageIds = [
  "referee-preparation",
  "referee-bp",
  "referee-post-match",
] as const;
const ircId = "referee-irc";

const dependencyChangedMessage =
  "Fixture dependencies changed. Withdraw affected steps and recheck the saved configuration.";

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
  const newestSession = useRef(initial.session);
  const controlId = useId();
  const [data, setData] = useState(initial);
  const [accessLost, setAccessLost] = useState(false);
  const [firstBan, setFirstBan] = useState(
    initial.session?.firstBanTeamId ?? "",
  );
  const [firstPick, setFirstPick] = useState(
    initial.session?.firstPickTeamId ?? "",
  );
  const [orderEditorOpen, setOrderEditorOpen] = useState<boolean | null>(null);
  const [draftSkipBans, setDraftSkipBans] = useState<boolean | null>(null);
  const [activeStage, setActiveStage] = useState<string>(stageIds[0]);
  const workspace = useRef<HTMLDivElement>(null);
  const stageNav = useRef<HTMLElement>(null);
  const ircComposer = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const node = workspace.current;
    const nav = stageNav.current;
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!node || !nav || accessLost) return;

    let stickyBottom = 0;
    function updateStage() {
      const current = stageIds.findLast((id) => {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        return top !== undefined && top <= stickyBottom + 24;
      });
      setActiveStage(current ?? stageIds[0]);
    }
    const measure = () => {
      const headerHeight =
        header?.dataset.scrollHidden === "true" &&
        window.matchMedia("(max-width: 760px)").matches
          ? 0
          : (header?.getBoundingClientRect().height ?? 0);
      stickyBottom = headerHeight + nav.getBoundingClientRect().height;
      node.style.setProperty("--referee-header-height", `${headerHeight}px`);
      node.style.setProperty("--referee-sticky-bottom", `${stickyBottom}px`);
      updateStage();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    const headerVisibility = new MutationObserver(measure);
    if (header) {
      observer.observe(header);
      headerVisibility.observe(header, {
        attributes: true,
        attributeFilter: ["data-scroll-hidden"],
      });
    }
    window.addEventListener("scroll", updateStage, { passive: true });
    return () => {
      observer.disconnect();
      headerVisibility.disconnect();
      window.removeEventListener("scroll", updateStage);
    };
  }, [accessLost]);
  const [selected, setSelected] = useState("");
  const [inspectedMapId, setInspectedMapId] = useState<string | null>(null);
  const [openRecordIds, setOpenRecordIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [mpStatus, setMpStatus] = useState<RefereeMpStatus>({
    binding: null,
    error: false,
  });
  const mapInspector = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (inspectedMapId) mapInspector.current?.focus();
  }, [inspectedMapId]);
  const [simulationEpoch, setSimulationEpoch] = useState(0);
  const [simulationEvents, setSimulationEvents] = useState<RefereeEvent[]>([]);
  const [simulationOrders, setSimulationOrders] = useState({
    firstBanTeamId: initial.session?.firstBanTeamId ?? null,
    firstPickTeamId: initial.session?.firstPickTeamId ?? null,
    skipBans: initial.session?.basis.skipBans,
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
  const [ircRoomId, setIrcRoomId] = useState<number | null>(null);
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
  const [dependencyTargeted, setDependencyTargeted] = useState(false);
  const dependencyCheck = useRef<HTMLElement>(null);
  useEffect(() => {
    const target = () =>
      setDependencyTargeted(window.location.hash === "#referee-dependencies");
    target();
    window.addEventListener("hashchange", target);
    return () => window.removeEventListener("hashchange", target);
  }, []);
  useEffect(() => {
    if (!dependencyTargeted) return;
    dependencyCheck.current?.scrollIntoView({ block: "start" });
    dependencyCheck.current?.focus({ preventScroll: true });
  }, [dependencyTargeted]);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<RefereeCommand | null>(null);
  const writing = useRef(false);
  const endpoint = `/api/admin/tournaments/${slug}/matches/${data.fixture.id}/referee`;
  const teamName = (id: string | null, neutral = true) =>
    data.teams.find((t) => t.id === id)?.name ??
    refereeMessage(tr, neutral ? "Neutral tiebreaker" : "Not set");
  const appliedSkipBans = simulation
    ? simulationOrders.skipBans
    : data.session?.basis.skipBans;
  const skipBans = draftSkipBans ?? Boolean(appliedSkipBans);
  const banTeamId = skipBans ? null : firstBan || null;
  const skipBansChanged = skipBans !== Boolean(appliedSkipBans);
  const dirtyOrder =
    skipBansChanged ||
    banTeamId !== appliedOrders.firstBanTeamId ||
    firstPick !== (appliedOrders.firstPickTeamId ?? "");
  const stale = Boolean(
    data.session &&
    data.session.dependencyFingerprint !== data.dependencyFingerprint,
  );
  const readiness = data.readiness.filter(
    (message) => message !== dependencyChangedMessage,
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
    skipBans: appliedSkipBans,
    orders: appliedOrders,
    events: simulation ? [...data.events, ...simulationEvents] : data.events,
  };
  const conflicts = refereeOrderConflicts(model, {
    firstBanTeamId: banTeamId,
    firstPickTeamId: firstPick || null,
  });
  const map = data.maps.find((m) => m.id === selected) ?? null;
  function accept(next: RefereeWorkspace, preserveOrder = false) {
    const previous = newestSession.current;
    if ((next.session?.revision ?? 0) < (previous?.revision ?? 0)) return;
    newestSession.current = next.session;
    setData(next);
    if (!preserveOrder) setDraftSkipBans(null);
    setFirstBan((current) =>
      preserveOrder && current !== (previous?.firstBanTeamId ?? "")
        ? current
        : (next.session?.firstBanTeamId ?? ""),
    );
    setFirstPick((current) =>
      preserveOrder && current !== (previous?.firstPickTeamId ?? "")
        ? current
        : (next.session?.firstPickTeamId ?? ""),
    );
  }
  useSnapshotUpdates<RefereeWorkspace>(
    simulation || readOnly ? null : endpoint,
    (update) => {
      if (update.type === "access-lost") setAccessLost(true);
      if (update.type === "snapshot" && update.value)
        accept(update.value, true);
    },
    { pollMs: 10000, clearOnNotFound: true },
  );
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
        skipBans: initial.session?.basis.skipBans,
      });
      setDraftSkipBans(null);
      setFirstBan(initial.session?.firstBanTeamId ?? "");
      setFirstPick(initial.session?.firstPickTeamId ?? "");
      setIrcDraft("");
      setIrcSelection(null);
      setSentCommands([]);
      setSyncEvents([]);
      setInspectedMapId(null);
      setOpenRecordIds(new Set());
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
    if (
      action?.action === "reconfirm_dependencies" &&
      (uncertain || readOnly || !data.canRecord || simulation)
    )
      return false;
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
        const payload = validateRefereeAction(
          model,
          parsed,
          data.round.exhibition,
        );
        if (payload.type === "order_set") {
          setSimulationOrders({
            firstBanTeamId: payload.firstBanTeamId,
            firstPickTeamId: payload.firstPickTeamId,
            skipBans: payload.skipBans,
          });
          setDraftSkipBans(null);
        }
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
    try {
      let latest = data;
      if (action?.action === "reconfirm_dependencies") {
        const response = await fetch(endpoint, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error ?? "Unable to reload the referee workspace.",
          );
        latest = body as RefereeWorkspace;
        accept(latest);
        if (
          !latest.session ||
          latest.session.dependencyFingerprint === latest.dependencyFingerprint
        ) {
          setNotice(tr("Reloaded saved referee state."));
          return true;
        }
        if (latest.projection.activeSelections.length)
          throw new Error(
            "Withdraw recorded steps before confirming changed dependencies.",
          );
      }
      const payload = action
        ? ({
            ...action,
            requestKey: crypto.randomUUID(),
            expectedRevision: latest.session?.revision ?? 0,
            dependencyFingerprint: latest.dependencyFingerprint,
          } as RefereeCommand)
        : pending.current;
      if (!payload) return false;
      pending.current = payload;
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
  const showSkipBans =
    data.round.exhibition &&
    (appliedSkipBans ||
      (data.policy?.steps.some((step) => step.kind === "ban") &&
        data.policy.steps.some((step) => step.kind !== "ban")));
  const canEditOrder = data.canRecord && !readOnly && !stale;
  const showOrderEditor =
    canEditOrder &&
    (dirtyOrder || (orderEditorOpen ?? state.activeSelections.length === 0));
  const orderEditorId = `${controlId}-order-editor`;
  const previewSkipsBans = showOrderEditor ? skipBans : appliedSkipBans;
  const previewOrders = showOrderEditor
    ? { firstBanTeamId: banTeamId, firstPickTeamId: firstPick || null }
    : appliedOrders;
  const redTeam = data.teams.find(
    (team) => team.id === data.fixture.homeTeamId,
  );
  const blueTeam = data.teams.find(
    (team) => team.id === data.fixture.awayTeamId,
  );
  const teamsBySide = [
    ...(redTeam ? [{ team: redTeam, side: "red" as const }] : []),
    ...(blueTeam ? [{ team: blueTeam, side: "blue" as const }] : []),
  ];
  const nextTeamSide = refereeTeamSide(data.fixture, state.nextStep?.teamId);
  const poolSelections = new Map(
    state.activeSelections.map((selection) => [selection.entryId, selection]),
  );
  const inspectedMap = data.maps.find((entry) => entry.id === inspectedMapId);
  const inspectedSelection =
    inspectedMap && poolSelections.get(inspectedMap.id);
  const mapAction = state.nextStep?.kind;
  const neutralPick = mapAction === "tb" || inspectedMap?.category === "TB";
  const inspectorId = `${controlId}-map-inspector`;
  let mapActionDisabled = disabled || stale || dirtyOrder;
  let mapActionError: string | undefined;
  if (inspectedMap && !inspectedSelection && mapAction && !mapActionDisabled) {
    try {
      validateRefereeAction(model, {
        action: "record_selection",
        entryId: inspectedMap.id,
      });
    } catch (error) {
      mapActionDisabled = true;
      if (error instanceof Error)
        mapActionError = refereeMessage(tr, error.message);
    }
  }
  const exPick = state.activeSelections.find(
    (s) => s.id === state.lastSelectionId,
  );
  const currentPick = exPick?.attempts.length ? exPick : undefined;
  const currentAttempt = currentPick?.attempts.at(-1);
  const attemptOpen =
    currentAttempt?.status === "pending" ||
    currentAttempt?.status === "playing";
  const resultActions =
    currentPick && currentAttempt ? (
      <div className={styles.recordActions}>
        {currentAttempt.status === "pending" && (
          <button
            type="button"
            className="secondary"
            disabled={disabled || stale}
            onClick={() =>
              send({ action: "start_attempt", pickId: currentPick.id })
            }
          >
            {tr("Record actual start")}
          </button>
        )}
        {teamsBySide.map(({ team, side }) => (
          <button
            type="button"
            key={side}
            data-winner-side={side}
            disabled={disabled || stale}
            onClick={() =>
              send({
                action: "resolve_attempt",
                pickId: currentPick.id,
                status: "completed",
                winnerTeamId: team.id,
              })
            }
          >
            {tr("Record win: {team}", {
              team: tr(side === "red" ? "Red team" : "Blue team"),
            })}
          </button>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={disabled || stale}
          onClick={() =>
            send({
              action: "resolve_attempt",
              pickId: currentPick.id,
              status: "tied",
              winnerTeamId: null,
            })
          }
        >
          {tr("Record tie")}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={disabled || stale}
          onClick={() =>
            send({
              action: "resolve_attempt",
              pickId: currentPick.id,
              status: "aborted",
              winnerTeamId: null,
            })
          }
        >
          {tr("Record abort")}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={
            disabled ||
            stale ||
            ["pending", "playing"].includes(currentAttempt.status) ||
            (basis.policy?.maxReplaysPerMap !== undefined &&
              currentPick.attempts.length - 1 >= basis.policy.maxReplaysPerMap)
          }
          onClick={() =>
            send({ action: "replay_attempt", pickId: currentPick.id })
          }
        >
          {tr("Record replay")}
        </button>
      </div>
    ) : null;
  const mpBinding = mpStatus.binding;
  const activeMp =
    !simulation &&
    !readOnly &&
    data.canRecord &&
    mpBinding?.enabled &&
    mpBinding.matchId === ircRoomId
      ? mpBinding
      : null;
  const mpOutcomes = new Map(
    mpStatus.outcomeSources?.map((source) => [source.eventId, source]),
  );
  const recordItems = state.activeSelections.map((selection) => {
    const attempt = selection.attempts.at(-1);
    const outcome =
      attempt &&
      model.events.findLast(
        ({ payload }) =>
          payload.type === "attempt_resolved" &&
          payload.attemptId === attempt.id,
      );
    const source = outcome && mpOutcomes.get(outcome.id);
    const unresolved =
      attempt?.status === "pending" || attempt?.status === "playing";
    const issue =
      attempt &&
      activeMp?.issues.find((item) => {
        if (item.attemptId) return item.attemptId === attempt.id;
        return (
          item.reason !== "unmatched" &&
          item.beatmapId === selection.beatmapId &&
          state.activeSelections.filter(
            (other) =>
              other.kind !== "ban" && other.beatmapId === item.beatmapId,
          ).length === 1
        );
      });
    const review =
      !!source?.review ||
      (unresolved &&
        (!!issue || (!!activeMp && selection.attempts.length > 1)));
    const waiting =
      unresolved && !!activeMp && !mpStatus.error && !activeMp.error;
    const status = review
      ? tr("Manual review")
      : waiting
        ? tr("Awaiting MP")
        : null;
    const map = data.maps.find((entry) => entry.id === selection.entryId);
    return { selection, attempt, outcome, source, issue, review, status, map };
  });
  function toggleRecordDetails(id: string) {
    setOpenRecordIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
  function attemptSummary(
    attempt: RefereeAttempt,
    superseded = false,
    status = refereeMessage(tr, attempt.status),
  ) {
    return (
      <>
        <span className={styles.recordContext}>
          {tr("Attempt {number}", { number: attempt.number })}
        </span>
        <span>{status}</span>
        {attempt.winnerTeamId && (
          <strong
            data-team={refereeTeamSide(data.fixture, attempt.winnerTeamId)}
          >
            {tr("Winner")}: {teamName(attempt.winnerTeamId)}
          </strong>
        )}
        {superseded && (
          <span className={styles.recordContext}>
            {tr("Superseded by replay")}
          </span>
        )}
      </>
    );
  }
  function renderRecordDetails(
    item: (typeof recordItems)[number],
    titleId: string,
  ) {
    const { selection, attempt, outcome, source, issue, review, status, map } =
      item;
    return (
      <>
        <h3 id={titleId} className={styles.recordHeading}>
          {selection.category}
          {map?.position}
          {" · "}
          {map?.metadata.title || selection.kind.toUpperCase()}
        </h3>
        <p className={styles.recordContext}>
          {selection.teamId && (
            <span
              className={styles.teamInk}
              data-team={refereeTeamSide(data.fixture, selection.teamId)}
            >
              {teamName(selection.teamId, false)} ·{" "}
            </span>
          )}
          {selection.kind.toUpperCase()}
          {attempt && (
            <> · {selection.exMode ? tr("EX mode") : tr("Normal mode")}</>
          )}
        </p>
        {attempt && (
          <p className={styles.recordResult}>
            {attemptSummary(attempt, false, status ?? undefined)}
          </p>
        )}
        {outcome &&
          !review &&
          (source || (mpStatus.sourceRevision ?? -1) >= outcome.ordinal) && (
            <p className={styles.recordContext}>
              {source ? tr("Scored by MP") : tr("Recorded by referee")}
            </p>
          )}
        {review && (
          <p className={styles.recordContext}>
            {refereeMpIssueLabel(
              tr,
              issue?.reason ?? (source?.review ? "source_changed" : "replay"),
            )}
          </p>
        )}
        {selection.attempts.slice(0, -1).map((previous) => (
          <p className={styles.recordPrevious} key={previous.id}>
            {attemptSummary(previous, true)}
          </p>
        ))}
        {selection.id === currentPick?.id &&
          data.canRecord &&
          !readOnly &&
          !stale &&
          resultActions}
      </>
    );
  }
  function historyDetail(event: RefereeEvent) {
    const p = event.payload;
    if (p.type === "order_set") {
      const ban = p.skipBans
        ? tr("Bans skipped")
        : `${tr("First Ban team")}: ${teamName(p.firstBanTeamId)}`;
      return `${ban} · ${tr("First Pick team")}: ${teamName(p.firstPickTeamId)}`;
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
    const pickId = "selectionId" in p ? p.selectionId : p.pickId;
    const selection = state.selections.find((item) => item.id === pickId);
    if (!selection) return "";
    const step = `${tr("Step {number}", { number: selection.stepIndex + 1 })} · ${selection.category} · ${selection.beatmapId}`;
    if ("selectionId" in p) return step;
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
  const renderSummary = (
    syncControl: ReactNode = null,
    syncFeedback: ReactNode = null,
  ) => (
    <section
      className={`panel ${styles.pinnedSummary}`}
      aria-label={tr("Referee records")}
    >
      <div className={styles.summaryHeading}>
        <h3>{tr("Referee temporary score")}</h3>
        {state.complete && (
          <span className="badge">{tr("Temporary series complete")}</span>
        )}
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
                disabled={disabled || stale || !data.rules?.exPlayersPerTeam}
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
          <button
            type="button"
            className="secondary"
            disabled={
              disabled || readOnly || !lastRestorableSelectionId(model.events)
            }
            onClick={() => send({ action: "restore_last" })}
          >
            {tr("Restore withdrawn Ban / Pick")}
          </button>
          {syncControl}
        </div>
      </div>
      <div className={styles.summaryScore}>
        {redTeam && blueTeam ? (
          <>
            <div className={styles.summaryTeam} data-team="red">
              <span>{redTeam.name}</span>
              <strong>{state.score[redTeam.id] ?? 0}</strong>
            </div>
            <span className={styles.scoreDivider} aria-hidden="true">
              :
            </span>
            <div className={styles.summaryTeam} data-team="blue">
              <span>{blueTeam.name}</span>
              <strong>{state.score[blueTeam.id] ?? 0}</strong>
            </div>
          </>
        ) : (
          <span>{tr("Teams not resolved")}</span>
        )}
      </div>
      <dl className={styles.summaryRows}>
        <div>
          <dt>{tr("BP sequence")}</dt>
          <dd
            tabIndex={state.activeSelections.length ? 0 : undefined}
            aria-label={tr("BP sequence")}
          >
            {state.activeSelections.length
              ? state.activeSelections.map((s) => (
                  <span
                    key={s.id}
                    className={styles.bpStep}
                    data-team={refereeTeamSide(data.fixture, s.teamId)}
                  >
                    {teamName(s.teamId)} {s.kind.toUpperCase()} {s.category}
                    {data.maps.find((m) => m.id === s.entryId)?.position}
                  </span>
                ))
              : "—"}
          </dd>
        </div>
        {state.activeSelections.some((s) => s.attempts.length > 1) && (
          <div>
            <dt>{tr("Replay history")}</dt>
            <dd tabIndex={0} aria-label={tr("Replay history")}>
              {state.activeSelections.some((s) => s.attempts.length > 1)
                ? state.activeSelections
                    .filter((s) => s.attempts.length > 1)
                    .map((s) => (
                      <span key={s.id}>
                        {s.category}
                        {
                          data.maps.find((m) => m.id === s.entryId)?.position
                        } ·{" "}
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
            <dd tabIndex={0} aria-label={tr("Map outcomes")}>
              {state.activeSelections.some((s) => s.kind !== "ban")
                ? state.activeSelections
                    .filter((s) => s.kind !== "ban")
                    .map((s) => {
                      const attempt = s.attempts.at(-1);
                      return (
                        <span key={s.id}>
                          {s.category}
                          {
                            data.maps.find((m) => m.id === s.entryId)?.position
                          }{" "}
                          ·{" "}
                          {attempt?.winnerTeamId ? (
                            <span
                              className={styles.teamInk}
                              data-team={refereeTeamSide(
                                data.fixture,
                                attempt.winnerTeamId,
                              )}
                            >
                              {teamName(attempt.winnerTeamId)}
                            </span>
                          ) : (
                            refereeMessage(tr, attempt?.status ?? "pending")
                          )}
                        </span>
                      );
                    })
                : "—"}
            </dd>
          </div>
        )}
      </dl>
      {syncFeedback}
    </section>
  );
  const matchHeader = (
    <header className={styles.matchHeader}>
      <div className={styles.matchIdentity}>
        <p className="eyebrow">{tr("REFEREE WORKSPACE")}</p>
        <h1>{data.fixture.label}</h1>
        <p className="muted">
          {[
            data.round.name,
            data.rules &&
              `${data.rules.playersPerTeam}v${data.rules.playersPerTeam}`,
            data.series?.type === "first_to" && `BO${data.series.wins * 2 - 1}`,
            data.policy?.maxReplaysPerMap !== undefined &&
              tr("Up to {count} replays per map", {
                count: data.policy.maxReplaysPerMap,
              }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {!accessLost && (
        <div className={styles.matchActions}>
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
          <button type="button" disabled={busy} onClick={refresh}>
            {tr("Reload saved state")}
          </button>
        </div>
      )}
    </header>
  );
  if (accessLost)
    return (
      <div className={styles.workspace}>
        {matchHeader}
        <p className="notice" role="alert">
          {tr(
            "Staff access is unavailable. Sign in again or contact the organizer.",
          )}
        </p>
      </div>
    );
  return (
    <div className={styles.workspace} ref={workspace}>
      {matchHeader}
      <nav
        ref={stageNav}
        className={styles.stageNav}
        aria-label={tr("Referee stages")}
      >
        {[
          tr("Pre-match preparation"),
          tr("BP stage"),
          tr("Post-match calculation"),
        ].map((label, index) => (
          <a
            key={stageIds[index]}
            href={`#${stageIds[index]}`}
            aria-current={
              activeStage === stageIds[index] ? "location" : undefined
            }
            onClick={() => setActiveStage(stageIds[index])}
          >
            {label}
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
        {(stale || dependencyTargeted) && (
          <section
            id="referee-dependencies"
            ref={dependencyCheck}
            tabIndex={-1}
            aria-label={tr("Recheck fixture dependencies")}
            className={`notice ${styles.dependencyCheck}`}
          >
            {stale ? (
              <>
                <p>{refereeMessage(tr, dependencyChangedMessage)}</p>
                <button
                  type="button"
                  disabled={
                    disabled ||
                    readOnly ||
                    simulation ||
                    state.activeSelections.length > 0
                  }
                  onClick={() => {
                    setDependencyTargeted(true);
                    void send({ action: "reconfirm_dependencies" });
                  }}
                >
                  {tr("Recheck fixture dependencies")}
                </button>
                {state.activeSelections.length > 0 && (
                  <p>
                    {refereeMessage(
                      tr,
                      "Withdraw recorded steps before confirming changed dependencies.",
                    )}
                  </p>
                )}
                {(!data.canRecord || readOnly) && (
                  <p>
                    {tr("Read-only access. Referee records cannot be changed.")}
                  </p>
                )}
              </>
            ) : (
              <p role="status">{tr("Reloaded saved referee state.")}</p>
            )}
          </section>
        )}

        <section
          id="referee-preparation"
          className={styles.stage}
          aria-labelledby="referee-preparation-title"
        >
          <header className={styles.stageHeading}>
            <h2 id="referee-preparation-title">
              {tr("Pre-match preparation")}
            </h2>
          </header>
          <RefereeCommands
            key={`preparation-${data.session?.revision ?? 0}`}
            stage="preparation"
            onPrepare={(text) => {
              prepareCommand(text);
              ircComposer.current?.focus({ preventScroll: true });
            }}
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
          className={`${styles.stage} ${styles.bpStage}`}
          aria-labelledby="referee-bp-title"
        >
          <header className={styles.stageHeading}>
            <h2 id="referee-bp-title">{tr("BP stage")}</h2>
          </header>
          <div className={`panel ${styles.orderSettings}`}>
            {!data.canRecord && (
              <p className="notice">
                {tr("Read-only access. Referee records cannot be changed.")}
              </p>
            )}
            {readiness.length > 0 && (
              <ul className="notice">
                {readiness.map((message, i) => (
                  <li key={i}>{refereeMessage(tr, message)}</li>
                ))}
              </ul>
            )}
            <div className={styles.orderHeader}>
              <h3>{tr("Ban / Pick order")}</h3>
              {!showOrderEditor && (
                <dl className={styles.appliedOrder}>
                  <div>
                    <dt>{tr("First Ban team")}</dt>
                    <dd
                      className={styles.teamInk}
                      data-team={refereeTeamSide(
                        data.fixture,
                        appliedSkipBans ? null : appliedOrders.firstBanTeamId,
                      )}
                    >
                      {appliedSkipBans
                        ? tr("Skip bans")
                        : teamName(appliedOrders.firstBanTeamId, false)}
                    </dd>
                  </div>
                  <div>
                    <dt>{tr("First Pick team")}</dt>
                    <dd
                      className={styles.teamInk}
                      data-team={refereeTeamSide(
                        data.fixture,
                        appliedOrders.firstPickTeamId,
                      )}
                    >
                      {teamName(appliedOrders.firstPickTeamId, false)}
                    </dd>
                  </div>
                </dl>
              )}
              {canEditOrder && (
                <button
                  type="button"
                  className={`secondary ${styles.orderToggle}`}
                  aria-expanded={showOrderEditor}
                  aria-controls={orderEditorId}
                  disabled={busy || dirtyOrder}
                  onClick={() => setOrderEditorOpen(!showOrderEditor)}
                >
                  {showOrderEditor ? tr("Close") : tr("Edit")}
                </button>
              )}
            </div>
            <div
              id={orderEditorId}
              className={styles.orderEditor}
              hidden={!showOrderEditor}
            >
              <div className={styles.orders}>
                <div className={styles.orderColumn}>
                  <label className="field" htmlFor={`${controlId}-first-ban`}>
                    <span id={`${controlId}-first-ban-label`}>
                      {tr("First Ban team")}
                    </span>
                    <select
                      id={`${controlId}-first-ban`}
                      aria-labelledby={`${controlId}-first-ban-label`}
                      value={skipBans ? "" : firstBan}
                      disabled={disabled || stale || skipBans}
                      onChange={(e) => {
                        setFirstBan(e.target.value);
                        setIrcSelection(null);
                      }}
                    >
                      <option value="">
                        {skipBans ? tr("Bans skipped") : tr("Not set")}
                      </option>
                      {data.teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {showSkipBans && (
                    <PublicationSwitch
                      label={tr("Skip bans")}
                      checked={skipBans}
                      disabled={
                        disabled || stale || state.activeSelections.length > 0
                      }
                      onChange={(checked) => {
                        setDraftSkipBans(checked);
                        setIrcSelection(null);
                      }}
                    />
                  )}
                </div>
                <div className={styles.orderColumn}>
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
              </div>
              <div className={styles.orderActions}>
                <button
                  type="button"
                  disabled={
                    disabled ||
                    stale ||
                    !dirtyOrder ||
                    (!skipBans && !banTeamId) ||
                    (skipBansChanged && state.activeSelections.length > 0) ||
                    !firstPick ||
                    conflicts.length > 0
                  }
                  onClick={() =>
                    send({
                      action: "set_order",
                      firstBanTeamId: banTeamId,
                      firstPickTeamId: firstPick,
                      ...(data.round.exhibition ? { skipBans } : {}),
                    })
                  }
                >
                  {tr("Apply order")}
                </button>
                {dirtyOrder && (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setDraftSkipBans(null);
                        setFirstBan(appliedOrders.firstBanTeamId ?? "");
                        setFirstPick(appliedOrders.firstPickTeamId ?? "");
                      }}
                    >
                      {tr("Discard unsaved order")}
                    </button>
                    <span className="small muted">
                      {tr("Order preview — not saved")}
                    </span>
                  </>
                )}
              </div>
              {conflicts.length > 0 && (
                <p role="status">
                  {tr("Withdraw conflicting steps in reverse order: {steps}", {
                    steps: conflicts.join(", "),
                  })}
                </p>
              )}
            </div>
            {data.policy && (
              <details className={styles.sequencePreview}>
                <summary>{tr("Preview Ban / Pick sequence")}</summary>
                <ol
                  className={styles.sequence}
                  role="list"
                  aria-label={tr("Preview Ban / Pick sequence")}
                >
                  {data.policy.steps.map((step, index) => {
                    if (previewSkipsBans && step.kind === "ban") return null;
                    const actor = resolveRefereeActor(
                      step.actor,
                      previewOrders,
                      data.teams.map((t) => t.id),
                    );
                    const side = refereeTeamSide(data.fixture, actor);
                    return (
                      <li
                        key={index}
                        className={styles.sequenceRow}
                        data-team={side}
                      >
                        <div className={styles.sequenceStep}>
                          <span
                            className={styles.sequenceNumber}
                            aria-hidden="true"
                          >
                            {index + 1}
                          </span>
                          <span className={styles.sequenceKind}>
                            {step.kind.toUpperCase()}
                          </span>
                          <span className={styles.sequenceTeam}>
                            {teamName(actor, step.actor === "neutral")}
                            {step.kind === "tb"
                              ? ` · ${step.tiedAt}:${step.tiedAt}`
                              : ""}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </details>
            )}
          </div>
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
          {!simulation && data.canRecord && !readOnly ? (
            <RefereeMp
              endpoint={`${endpoint}/mp`}
              disabled={disabled}
              roomId={ircRoomId}
              status={mpStatus}
              setStatus={setMpStatus}
              onWorkspace={(next) => accept(next, true)}
            >
              {renderSummary}
            </RefereeMp>
          ) : (
            renderSummary()
          )}
          <div className={styles.bpFlow}>
            <section
              className={`panel ${styles.pool}`}
              aria-labelledby="referee-pool"
            >
              <h2 id="referee-pool">{tr("Round mappool")}</h2>

              <p
                role="status"
                className={`${styles.sequencePreview} ${styles.sequenceRow} ${styles.sequenceTeam}`}
                data-team={nextTeamSide}
              >
                {state.nextStep
                  ? tr("Step {number}: {action} · {team}", {
                      number: state.nextStep.index + 1,
                      action: state.nextStep.kind.toUpperCase(),
                      team:
                        nextTeamSide !== "neutral"
                          ? `${tr(nextTeamSide === "red" ? "Red team" : "Blue team")} ${teamName(state.nextStep.teamId)}`
                          : teamName(
                              state.nextStep.teamId,
                              state.nextStep.kind === "tb",
                            ),
                    })
                  : tr("No further configured step")}
              </p>
              <div className={styles.poolGrid}>
                {Array.from(
                  new Set(data.maps.map((entry) => entry.category)),
                ).map((category) => (
                  <section
                    className={styles.poolGroup}
                    key={category}
                    aria-label={category}
                    data-mod={category}
                  >
                    {data.maps
                      .filter((entry) => entry.category === category)
                      .map((entry) => {
                        const used = poolSelections.get(entry.id);
                        const open = inspectedMapId === entry.id;
                          const tileId = `${controlId}-map-${entry.id}`;
                          const code = `${entry.category}${entry.position}`;
                        return (
                          <button
                              id={tileId}
                            className={`secondary ${styles.poolTile}`}
                            key={entry.id}
                            type="button"
                              aria-label={code}
                            aria-expanded={open}
                            aria-controls={inspectorId}
                              aria-describedby={used ? `${tileId}-status` : undefined}
                            data-selection={used?.kind}
                            data-team={
                              used && refereeTeamSide(data.fixture, used.teamId)
                            }
                            onClick={() =>
                              setInspectedMapId(open ? null : entry.id)
                            }
                          >
                              {code}
                              {used && (
                                <span id={`${tileId}-status`} hidden>
                                  {teamName(used.teamId, used.kind === "tb")} · {used.kind.toUpperCase()}
                                </span>
                              )}
                          </button>
                        );
                      })}
                  </section>
                ))}
              </div>
              <div
                id={inspectorId}
                className={styles.poolDetail}
                ref={mapInspector}
                tabIndex={-1}
                role="group"
                aria-labelledby={`${inspectorId}-title`}
                hidden={!inspectedMap}
                onKeyDown={(event) => {
                  if (event.key !== "Escape" || !inspectedMap) return;
                  event.preventDefault();
                  document
                    .getElementById(`${controlId}-map-${inspectedMap.id}`)
                    ?.focus();
                  setInspectedMapId(null);
                }}
              >
                {inspectedMap && (
                  <>
                    <strong id={`${inspectorId}-title`}>
                      {inspectedMap.category}
                      {inspectedMap.position} · {inspectedMap.metadata.title}
                    </strong>
                    <small>
                      {inspectedMap.metadata.artist} ·{" "}
                      {inspectedMap.metadata.difficulty}
                    </small>
                    {inspectedSelection ? (
                      <span
                        className={`${styles.poolContext} ${styles.teamInk}`}
                        data-team={refereeTeamSide(
                          data.fixture,
                          inspectedSelection.teamId,
                        )}
                      >
                        {teamName(
                          inspectedSelection.teamId,
                          inspectedSelection.kind === "tb",
                        )}{" "}
                        · {inspectedSelection.kind.toUpperCase()}
                      </span>
                    ) : (
                      mapAction &&
                      (neutralPick || nextTeamSide !== "neutral") && (
                        <button
                          type="button"
                          className={`secondary ${styles.poolAction}`}
                          data-team={neutralPick ? undefined : nextTeamSide}
                          aria-label={
                            neutralPick
                              ? undefined
                              : `${tr(nextTeamSide === "red" ? "Red team" : "Blue team")} ${mapAction.toUpperCase()}`
                          }
                          disabled={mapActionDisabled}
                          onClick={() => {
                            document
                              .getElementById(
                                `${controlId}-map-${inspectedMap.id}`,
                              )
                              ?.focus({ preventScroll: true });
                            void send({
                              action: "record_selection",
                              entryId: inspectedMap.id,
                            });
                          }}
                        >
                          {neutralPick ? (
                            tr("referee_neutral_pick")
                          ) : (
                            <>
                              {tr(
                                nextTeamSide === "red"
                                  ? "referee_pool_red_short"
                                  : "referee_pool_blue_short",
                              )}{" "}
                              {mapAction.toUpperCase()}
                            </>
                          )}
                        </button>
                      )
                    )}
                    {mapActionError && <small>{mapActionError}</small>}
                  </>
                )}
              </div>
              {state.issues.map((message, i) => (
                <p className="small muted" key={i}>
                  {refereeMessage(tr, message)}
                </p>
              ))}
            </section>
            <section
              id="referee-record-editor"
              className={`panel ${styles.recordControls}`}
              aria-labelledby="referee-record-title"
            >
              <h2 id="referee-record-title">
                {tr("Record and correct outcomes")}
              </h2>
              {recordItems.length ? (
                <div className={styles.recordColumns} aria-hidden="true">
                  <span>#</span>
                  <span>{tr("Ban / Pick team")}</span>
                  <span className={styles.recordMap}>
                    {tr("Action / Beatmap")}
                  </span>
                </div>
              ) : (
                <p className="muted">{tr("No Ban or Pick recorded yet.")}</p>
              )}
              <ul className={styles.recordList}>
                {recordItems.map(
                  (item) => {
                    const { selection, attempt, status, review, map } = item;
                    const open = openRecordIds.has(selection.id);
                    const rowId = `${controlId}-record-${selection.id}`;
                    const detailsId = `${rowId}-details`;
                    const titleId = `${detailsId}-title`;
                    const team = selection.teamId
                      ? teamName(selection.teamId, false)
                      : "";
                    const winningTeamId = status ? null : attempt?.winnerTeamId;
                    const winner = winningTeamId
                      ? teamName(winningTeamId, false)
                      : null;
                    const side = refereeTeamSide(
                      data.fixture,
                      selection.teamId,
                    );
                    const outcome =
                      status ??
                      winner ??
                      (attempt
                        ? refereeMessage(tr, attempt.status)
                        : tr("Banned"));
                    return (
                      <li
                        key={selection.id}
                        onKeyDown={(event) => {
                          if (event.key !== "Escape" || !open) return;
                          event.preventDefault();
                          document
                            .getElementById(rowId)
                            ?.focus({ preventScroll: true });
                          toggleRecordDetails(selection.id);
                        }}
                      >
                        <button
                          id={rowId}
                          type="button"
                          className={styles.recordRow}
                          aria-expanded={open}
                          aria-controls={detailsId}
                          data-current={
                            attemptOpen && selection.id === currentPick?.id
                              ? ""
                              : undefined
                          }
                          onClick={() => toggleRecordDetails(selection.id)}
                        >
                          <span className={styles.recordStep}>
                            {selection.stepIndex + 1}.
                          </span>{" "}
                          <span
                            className={`${styles.recordTeam} ${styles.teamInk}`}
                            data-team={side}
                          >
                            {team}
                          </span>{" "}
                          <span className={styles.recordMap}>
                            {selection.kind.toUpperCase()}{" "}
                            <strong>
                              {selection.category}
                              {map?.position}
                            </strong>{" "}
                            {selection.exMode && (
                              <span
                                className={styles.recordEx}
                                title={tr("EX mode")}
                              >
                                EX
                              </span>
                            )}
                          </span>{" "}
                          <span className={styles.recordOutcomeLine}>
                            <span className={styles.recordOutcomeLabel}>
                              {winner ? tr("Winner") : tr("Status")}
                            </span>{" "}
                            <span
                              aria-live={
                                selection.id === currentPick?.id
                                  ? "polite"
                                  : undefined
                              }
                              className={`${styles.recordOutcome} ${styles.teamInk}`}
                              data-team={refereeTeamSide(
                                data.fixture,
                                winner && !status
                                  ? attempt?.winnerTeamId
                                  : null,
                              )}
                              data-review={review ? "" : undefined}
                            >
                              {outcome}
                            </span>
                          </span>
                        </button>
                        <section
                          id={detailsId}
                          className={styles.recordDetails}
                          aria-labelledby={open ? titleId : undefined}
                          hidden={!open}
                        >
                          {open && renderRecordDetails(item, titleId)}
                        </section>
                      </li>
                    );
                  },
                )}
              </ul>
              <details className={styles.recordHistory}>
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
            </section>
          </div>
        </section>
        <section
          id="referee-post-match"
          className={styles.stage}
          aria-labelledby="referee-post-match-title"
        >
          <header className={styles.stageHeading}>
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
        id={ircId}
        composerRef={ircComposer}
        syncEvents={syncEvents}
        onSynced={(id) =>
          setSyncEvents((current) => current.filter((e) => e.id !== id))
        }
        fixtureId={data.fixture.id}
        key={simulationEpoch}
        endpoint={`${endpoint}/irc`}
        onRoomChange={setIrcRoomId}
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
            accept(next, true);
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
        matchComplete={state.complete}
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
