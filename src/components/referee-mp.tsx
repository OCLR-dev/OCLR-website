"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { RefereeWorkspace } from "@/lib/referee-workspace";
import type { RefereeMpView } from "@/lib/referee-mp";
import styles from "./referee-panel.module.css";

async function request(
  endpoint: string,
  command: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<RefereeMpView> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw Error();
  return response.json();
}

export function RefereeMp({
  endpoint,
  disabled,
  roomId,
  onWorkspace,
  children,
}: {
  endpoint: string;
  disabled: boolean;
  roomId: number | null;
  onWorkspace: (w: RefereeWorkspace) => void;
  children: (control: ReactNode, feedback: ReactNode) => ReactNode;
}) {
  const tr = useAppTranslations();
  const [binding, setBinding] = useState<RefereeMpView["binding"]>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const current = useRef({ onWorkspace, disabled });
  const flight = useRef(false);
  const manual = useRef(false);
  const generation = useRef(0);
  const invalidate = useCallback(() => ++generation.current, []);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    current.current = { onWorkspace, disabled };
  }, [onWorkspace, disabled]);
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      if (stopped) return;
      if (flight.current || manual.current || current.current.disabled) {
        timer = setTimeout(poll, 2000);
        return;
      }
      flight.current = true;
      const run = generation.current;
      let delay = 30000;
      try {
        let result = await request(
          endpoint,
          { action: "status" },
          controller.signal,
        );
        if (stopped || run !== generation.current || current.current.disabled)
          return;
        if (
          result.binding?.enabled &&
          roomId &&
          result.binding.matchId !== roomId
        ) {
          result = await request(
            endpoint,
            {
              action: "bind_room",
              expectedRoomId: roomId,
              expectedRevision: result.binding.revision,
              expectedSessionRevision: result.workspace.session?.revision ?? 0,
              dependencyFingerprint: result.workspace.dependencyFingerprint,
            },
            controller.signal,
          );
        }
        if (stopped || run !== generation.current || current.current.disabled)
          return;
        if (
          result.binding?.enabled &&
          roomId &&
          result.binding.matchId === roomId &&
          Date.parse(result.binding.nextPollAt) <= Date.now()
        ) {
          result = await request(
            endpoint,
            {
              action: "sync",
              expectedRevision: result.binding.revision,
              expectedRoomId: roomId,
            },
            controller.signal,
          );
        }
        if (stopped || run !== generation.current) return;
        setBinding(result.binding);
        setError(false);
        current.current.onWorkspace(result.workspace);
        if (result.binding?.enabled)
          delay = Math.max(
            3000,
            Date.parse(result.binding.nextPollAt) - Date.now(),
          );
      } catch {
        if (!stopped && run === generation.current) {
          setError(true);
          delay = 60000;
        }
      } finally {
        flight.current = false;
        if (!stopped)
          timer = setTimeout(
            poll,
            document.hidden ? 60000 : Math.min(60000, delay),
          );
      }
    }
    void poll();
    return () => {
      stopped = true;
      invalidate();
      controller.abort();
      clearTimeout(timer);
    };
  }, [endpoint, refresh, roomId, invalidate]);
  async function change() {
    if (manual.current || disabled) return;
    const enable = !binding?.enabled;
    if (enable && !roomId) return;
    manual.current = true;
    const run = invalidate();
    setBusy(true);
    setError(false);
    try {
      let result = await request(endpoint, { action: "status" });
      // A room change cancels starting an obsolete room, but an explicit stop
      // must still disable this fixture's binding.
      if (enable && run !== generation.current) return;
      if (
        enable &&
        (!result.binding?.enabled || result.binding.matchId !== roomId)
      ) {
        result = await request(endpoint, {
          action: "bind_room",
          expectedRoomId: roomId,
          expectedRevision: result.binding?.revision ?? 0,
          expectedSessionRevision: result.workspace.session?.revision ?? 0,
          dependencyFingerprint: result.workspace.dependencyFingerprint,
        });
      } else if (!enable && result.binding?.enabled) {
        result = await request(endpoint, {
          action: "unbind",
          expectedRevision: result.binding.revision,
        });
      }
      if (run !== generation.current) return;
      setBinding(result.binding);
      current.current.onWorkspace(result.workspace);
      setRefresh((n) => n + 1);
    } catch {
      if (run === generation.current) {
        setError(true);
        setRefresh((n) => n + 1);
      }
    } finally {
      manual.current = false;
      setBusy(false);
    }
  }
  const control = (
    <button
      type="button"
      className={`secondary ${styles.mpSyncToggle}`}
      aria-pressed={Boolean(binding?.enabled)}
      title={
        binding?.enabled
          ? tr("Stop MP sync")
          : !roomId
            ? tr("Connect the local IRC app to this fixture first.")
            : tr("Automatic sync")
      }
      disabled={disabled || busy || (!binding?.enabled && !roomId)}
      onClick={() => void change()}
    >
      {binding?.enabled && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m3 8 3 3 7-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {busy ? tr("Saving…") : tr("Automatic sync")}
    </button>
  );
  const feedback = (
    <div className={styles.mpSync}>
      <div className={styles.mpSyncActions}>
        {!!roomId && (
          <a
            href={`https://osu.ppy.sh/community/matches/${roomId}`}
            target="_blank"
            rel="noreferrer"
          >
            MP {roomId}
          </a>
        )}
        {binding?.lastCheckedAt && binding.matchId === roomId && (
          <span className="small muted">
            {tr("Last checked: {time}", {
              time: new Date(binding.lastCheckedAt).toLocaleTimeString(),
            })}
          </span>
        )}
      </div>
      {(error || binding?.error === "provider") && (
        <p role="alert">
          {tr(
            "MP sync is unavailable. Check the link or connection; saved results are retained.",
          )}
        </p>
      )}
      {binding?.error === "dependencies" && (
        <p role="alert">
          {tr(
            "Refresh the referee workspace and resolve its readiness issues first.",
          )}
        </p>
      )}
      {!!binding?.issues.length && (
        <details>
          <summary>
            {tr("Manual review required: {count}", {
              count: binding.issueCount,
            })}
          </summary>
          <a
            href="#referee-record-editor"
            onClick={() => {
              const records = document.getElementById("referee-record-editor");
              if (records instanceof HTMLDetailsElement) records.open = true;
            }}
          >
            {tr("Review referee records")}
          </a>
          <ul
            tabIndex={0}
            aria-label={tr("Manual review required: {count}", {
              count: binding.issueCount,
            })}
          >
            {binding.issues.map((issue, index) => (
              <li key={index}>
                {issue.gameId ? `Game ${issue.gameId}` : "MP"}
                {issue.beatmapId ? ` · BID ${issue.beatmapId}` : ""} ·{" "}
                {issue.reason === "replay"
                  ? tr("Replay or repeated beatmap")
                  : issue.reason === "source_changed"
                    ? tr("Source changed; automatic point withdrawn")
                    : issue.reason === "unmatched"
                      ? tr("No matching recorded pick")
                      : issue.reason === "incomplete"
                        ? tr("Incomplete MP data")
                        : issue.reason === "already_used"
                          ? tr("This MP game is already counted")
                          : tr(
                              "Check the map, rosters, Mods and scoring rules",
                            )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
  return children(
    control,
    roomId || error || binding?.error || binding?.issues.length
      ? feedback
      : null,
  );
}
