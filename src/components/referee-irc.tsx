"use client";
import { useEffect, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { RefereeWorkspace } from "@/lib/referee";
import { refereeMessage } from "@/i18n/referee";
import { desktopLaunchUrl } from "@/lib/desktop-launch";
import styles from "./referee-panel.module.css";

type RelayView = {
  connection: null | {
    id: string;
    roomId: number;
    ircUsername: string;
    status: "connected" | "disconnected" | "revoked";
    lastSeenAt: string | null;
    connected: boolean;
    bpSync?: boolean;
  };
  messages: { id: string; sender: string; text: string; at: string }[];
  commands: {
    id: string;
    requestKey: string;
    text: string;
    target: string;
    status:
      | "queued"
      | "sending"
      | "sent"
      | "notified"
      | "confirmed"
      | "failed"
      | "unknown"
      | "record_failed";
    recordError: string | null;
    createdAt: string;
  }[];
  workspace: RefereeWorkspace;
};
type QueueRequest = {
  action: "queue";
  requestKey: string;
  text: string;
};
export function RefereeIrc({
  syncEvents = [],
  onSynced,
  draft,
  fixtureId,
  simulation,
  disabled,
  startSeconds,
  timers,
  selectedMods,
  recordedSelectionLabel,
  onChange,
  onPrepare,
  onConfirm,
  endpoint,
  onWorkspace,
  onQueued,
  onConfirmed,
}: {
  syncEvents?: readonly { id: string; text: string }[];
  onSynced?: (eventId: string) => void;
  draft: string;
  fixtureId: string;
  simulation: boolean;
  disabled: boolean;
  startSeconds: number | null;
  timers: readonly (number | null | undefined)[];
  selectedMods: string | null;
  recordedSelectionLabel: string | null;
  onChange: (text: string) => void;
  onPrepare: (text: string) => void;
  onConfirm: () => Promise<boolean>;
  endpoint: string;
  onWorkspace: (workspace: RefereeWorkspace) => void;
  onQueued: () => void;
  onConfirmed: (commands: string[]) => void;
}) {
  const tr = useAppTranslations();
  const [history, setHistory] = useState<
    { text: string; time: string; selection: string | null }[]
  >([]);
  const [relay, setRelay] = useState<RelayView | null>(null),
    [sending, setSending] = useState(false),
    [error, setError] = useState<"load" | "send" | "uncertain" | null>(null);
  const [retry, setRetry] = useState<QueueRequest | null>(null);
  const inFlight = useRef(false),
    log = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onWorkspace, onConfirmed });
  useEffect(() => {
    callbacks.current = { onWorkspace, onConfirmed };
  }, [onWorkspace, onConfirmed]);
  function applyView(view: RelayView) {
    setRelay(view);
    callbacks.current.onWorkspace(view.workspace);
    callbacks.current.onConfirmed(
      view.commands.filter((c) => c.status === "confirmed").map((c) => c.text),
    );
  }
  useEffect(() => {
    if (simulation) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw Error();
        const view = (await response.json()) as RelayView;
        if (controller.signal.aborted) return;
        setRelay(view);
        callbacks.current.onWorkspace(view.workspace);
        callbacks.current.onConfirmed(
          view.commands
            .filter((c) => c.status === "confirmed")
            .map((c) => c.text),
        );
        setError((value) => (value === "load" ? null : value));
      } catch {
        if (!controller.signal.aborted) {
          setRelay(null);
          setError((value) => value ?? "load");
        }
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void poll(), document.hidden ? 10000 : 2000);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [endpoint, simulation]);
  const syncQueue = useRef(syncEvents);
  syncQueue.current = syncEvents;
  const syncDone = useRef(new Set<string>()),
    syncBusy = useRef(false),
    syncPaused = useRef(false);
  const [syncError, setSyncError] = useState(false),
    [syncRetry, setSyncRetry] = useState(0);
  const [syncDetail, setSyncDetail] = useState("");
  const syncCallback = useRef(onSynced);
  syncCallback.current = onSynced;
  useEffect(() => {
    let active = true;
    async function drain() {
      if (syncBusy.current || syncPaused.current) return;
      syncBusy.current = true;
      try {
        for (;;) {
          const item = syncQueue.current.find(
            (e) => !syncDone.current.has(e.id),
          );
          if (!item) break;
          if (simulation) {
            setHistory((current) => [
              ...current,
              {
                text: item.text,
                selection: null,
                time: new Date().toLocaleTimeString(),
              },
            ]);
          } else {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "sync_selection",
                eventId: item.id,
              }),
            });
            if (!response.ok) {
              const body = await response.json().catch(() => ({}));
              throw new Error(
                body.error ||
                  "Unable to send this command. Check its contents and try again.",
              );
            }
            const view = await response.json();
            if (active) applyView(view);
          }
          syncDone.current.add(item.id);
          syncCallback.current?.(item.id);
        }
        setSyncError(false);
      } catch (error) {
        setSyncDetail(
          refereeMessage(
            tr,
            error instanceof Error && !(error instanceof TypeError)
              ? error.message
              : "Unable to send this command. Check its contents and try again.",
          ),
        );
        syncPaused.current = true;
        setSyncError(true);
      } finally {
        syncBusy.current = false;
      }
    }
    void drain();
    return () => {
      active = false;
    };
    // Requests are generated only by successful BP saves; polling never replays history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncEvents, endpoint, simulation, syncRetry]);
  const launchUrl = desktopLaunchUrl(fixtureId);
  const connected = !!relay?.connection?.connected;
  const statusLabels = {
    notified: tr("BP notification sent to local IRC"),
    queued: tr("Queued for local IRC"),
    sending: tr("Sending to IRC"),
    sent: tr("Sent; awaiting room confirmation"),
    confirmed: tr("Confirmed by IRC"),
    failed: tr("Command failed"),
    unknown: tr("Outcome unknown; check the room"),
    record_failed: tr("IRC confirmed; referee record needs review"),
  };
  const failureReasons: Record<string, string> = {
    "Automatic BP sync stopped. Check the saved BP event and preceding IRC step.":
      tr(
        "Automatic BP sync stopped. Check the saved BP event and preceding IRC step.",
      ),
    "The saved BP event changed. Reload before syncing.": tr(
      "The saved BP event changed. Reload before syncing.",
    ),
    "relay:local_rejected": tr(
      "The local app rejected this command before sending. Check operation records and room state in OCLR IRC.",
    ),
    "relay:pending_operation": tr(
      "A previous room operation needs review in OCLR IRC before sending another command.",
    ),
    "relay:room_checks": tr(
      "The local app could not verify current room settings or referee access. Refresh them in OCLR IRC.",
    ),
    "relay:bancho_rejected": tr(
      "BanchoBot rejected this command. Check the room reply in OCLR IRC.",
    ),
    "relay:reply_timeout": tr(
      "No matching BanchoBot reply was confirmed. Check the room before sending another command.",
    ),
    "relay:invalid_command": tr(
      "This command is not supported by the local IRC relay.",
    ),
    "relay:target_changed": tr(
      "The local room or connection changed before this command could be sent.",
    ),
  };
  async function submit() {
    if (
      inFlight.current ||
      disabled ||
      !draft.trim() ||
      /[\r\n\u0000]/.test(draft) ||
      (!simulation && !connected && !retry)
    )
      return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      if (simulation) {
        const text = draft,
          label = recordedSelectionLabel;
        if (!(await onConfirm())) {
          setError("send");
          return;
        }
        setHistory((items) => [
          ...items,
          { text, selection: label, time: new Date().toLocaleTimeString() },
        ]);
      } else {
        const request = retry ?? {
          action: "queue" as const,
          requestKey: crypto.randomUUID(),
          text: draft,
        };
        setRetry(request);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        if (!response.ok) {
          if (response.status < 500) {
            setRetry(null);
            setError("send");
          } else setError("uncertain");
          return;
        }
        applyView(await response.json());
        setRetry(null);
        onQueued();
      }
      requestAnimationFrame(() =>
        log.current?.scrollTo({ top: log.current.scrollHeight }),
      );
    } catch {
      setError(simulation ? "send" : "uncertain");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }
  async function disconnect() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      if (!response.ok) throw Error();
      applyView(await response.json());
      setRetry(null);
    } catch {
      setError("send");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }
  const locked = disabled || sending || !!retry;
  return (
    <aside className={`panel ${styles.irc}`} aria-label={tr("IRC console")}>
      <header>
        <h2>{"IRC"}</h2>
        <span className="badge">
          {simulation
            ? tr("Simulation only")
            : connected
              ? tr("IRC connected")
              : tr("IRC not connected")}
        </span>
      </header>
      {syncEvents.length > 0 && (
        <div role="status" className={styles.syncStatus}>
          <span>
            {syncError
              ? tr(
                  "BP saved. IRC sync is pending. Check the connection and retry safely.",
                )
              : tr("Syncing saved BP to IRC…")}
          </span>
          {syncError && syncDetail && (
            <span className="small">{syncDetail}</span>
          )}
          {syncError && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                syncPaused.current = false;
                setSyncError(false);
                setSyncRetry((n) => n + 1);
              }}
            >
              {tr("Retry IRC sync")}
            </button>
          )}
        </div>
      )}
      {simulation ? (
        <p className="small muted">
          {tr("No real IRC connection. Simulated sends do not reach osu!.")}
        </p>
      ) : (
        <>
          {!connected && launchUrl && (
            <p>
              <a className="button secondary" href={launchUrl}>
                {tr("Open OCLR IRC")}
              </a>
            </p>
          )}
          {relay?.connection && (
            <div className={styles.ircConnection}>
              <span className="small">
                {relay.connection.ircUsername} ·{" "}
                {relay.connection.roomId
                  ? `#mp_${relay.connection.roomId}`
                  : "BanchoBot"}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={disabled || sending}
                onClick={() => void disconnect()}
              >
                {tr("Disconnect relay")}
              </button>
            </div>
          )}
          <details className={styles.ircHelp}>
            <summary>{tr("Connection setup")}</summary>
            <p className="small muted">
              {tr(
                "BP saves sync automatically: Ban announces; Pick announces, changes the map and applies saved Mods.",
              )}
            </p>
            {!connected && (
              <p className="small muted">
                {tr(
                  "If the app does not open, install the latest OCLR IRC and launch it once, then try again.",
                )}{" "}
                <a
                  href="https://github.com/OCLR-dev/OCLR-IRC/actions/workflows/test-builds.yml"
                  target="_blank"
                  rel="noreferrer"
                >
                  {tr("Get OCLR IRC")}
                </a>
              </p>
            )}
            <ol>
              <li>{tr("Open oclr-irc and sign in to osu! IRC locally.")}</li>
              <li>
                {tr(
                  "Authorize OCLR in the browser and select this assigned match.",
                )}
              </li>
              <li>
                {tr(
                  "Confirm the accounts and enable website IRC. You can then create a room from this page.",
                )}
              </li>
            </ol>
            <p>
              {tr(
                "IRC credentials stay in the desktop app. The launch link does not sign you in or send commands.",
              )}
            </p>
            <a href="/desktop/sessions">{tr("Manage desktop sessions")}</a>
          </details>
        </>
      )}
      <div
        className={styles.ircLog}
        role="log"
        aria-label={
          simulation ? tr("Simulated IRC history") : tr("IRC room projection")
        }
        ref={log}
      >
        {simulation ? (
          history.map((line, index) => (
            <div className={styles.ircMessage} key={index}>
              <time>{line.time}</time>
              <code>{line.text}</code>
              <small>
                {tr("Simulation confirmed")}
                {line.selection ? ` · ${line.selection}` : ""}
              </small>
            </div>
          ))
        ) : (
          <>
            {relay?.messages.map((line) => (
              <div className={styles.ircMessage} key={line.id}>
                <small>
                  {line.sender} ·{" "}
                  <time dateTime={line.at}>
                    {new Date(line.at).toLocaleTimeString()}
                  </time>
                </small>
                <code>{line.text}</code>
              </div>
            ))}
            {relay?.commands.length ? (
              <details open className={styles.ircReceipts}>
                <summary>{tr("Command status")}</summary>
                {relay.commands.map((command) => (
                  <div className={styles.ircMessage} key={command.id}>
                    <code>{command.text}</code>
                    <small>{statusLabels[command.status]}</small>
                    {command.recordError &&
                      failureReasons[command.recordError] && (
                        <small>{failureReasons[command.recordError]}</small>
                      )}
                  </div>
                ))}
              </details>
            ) : null}
          </>
        )}
        {((!simulation && !relay?.messages.length && !relay?.commands.length) ||
          (simulation && !history.length)) && (
          <p className="muted">
            {tr("Choose a command or pool map on the left.")}
          </p>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className={styles.ircComposer}
      >
        {recordedSelectionLabel && (
          <p className="small" role="status">
            {tr("Recorded: {value0}", { value0: recordedSelectionLabel })}
          </p>
        )}
        <label htmlFor="referee-irc-input">{tr("IRC command")}</label>
        <input
          id="referee-irc-input"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          disabled={locked}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="submit"
          disabled={
            disabled ||
            sending ||
            !draft.trim() ||
            (!simulation && !connected && !retry) ||
            (!simulation &&
              (relay?.connection?.roomId === 0
                ? !/^!mp make .+$/u.test(draft)
                : /^!mp make(?:\s|$)/i.test(draft)))
          }
        >
          {sending
            ? tr("Sending…")
            : retry
              ? tr("Retry same command")
              : simulation
                ? tr("Simulate send")
                : tr("Send to local IRC")}
        </button>
        {!simulation &&
          /^!mp make(?:\s|$)/i.test(draft) &&
          relay?.connection?.roomId !== 0 && (
            <p className="small muted">
              {tr("Create and join the room in oclr-irc first.")}
            </p>
          )}
        {error && (
          <p role="alert">
            {error === "load"
              ? tr(
                  "IRC projection is unavailable. Sending is paused until it reconnects.",
                )
              : error === "uncertain"
                ? tr(
                    "The queue response was lost. Retry the same request; do not resend it as a new command.",
                  )
                : tr(
                    "Unable to send this command. Check its contents and try again.",
                  )}
          </p>
        )}
      </form>
      <footer className={styles.ircQuick} aria-label={tr("Quick commands")}>
        {[
          ...new Set(
            timers.filter(
              (seconds): seconds is number =>
                typeof seconds === "number" && seconds > 0,
            ),
          ),
        ].map((seconds) => (
          <button
            key={seconds}
            type="button"
            className="secondary"
            disabled={locked}
            onClick={() => onPrepare(`!mp timer ${seconds}`)}
          >
            {seconds}s
          </button>
        ))}
        {[
          ...(startSeconds ? [`!mp start ${startSeconds}`] : []),
          "!mp aborttimer",
          ...(selectedMods ? [selectedMods] : []),
          "!mp abort",
        ].map((text) => (
          <button
            key={text}
            type="button"
            className="secondary"
            disabled={locked}
            onClick={() => onPrepare(text)}
          >
            {text}
          </button>
        ))}
      </footer>
    </aside>
  );
}
