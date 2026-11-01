"use client";
import { useEffect, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { RefereeWorkspace } from "@/lib/referee";
import type { RefereeMpView } from "@/lib/referee-mp";

export function RefereeMp({
  endpoint,
  workspace,
  disabled,
  onWorkspace,
}: {
  endpoint: string;
  workspace: RefereeWorkspace;
  disabled: boolean;
  onWorkspace: (w: RefereeWorkspace) => void;
}) {
  const tr = useAppTranslations();
  const [binding, setBinding] = useState<RefereeMpView["binding"]>(null);
  const [match, setMatch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const current = useRef({ workspace, onWorkspace, disabled });
  const flight = useRef(false);
  const manual = useRef(false);
  const generation = useRef(0);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    current.current = { workspace, onWorkspace, disabled };
  }, [workspace, onWorkspace, disabled]);
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
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status" }),
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw Error();
        let result = (await response.json()) as RefereeMpView;
        if (stopped || run !== generation.current) return;
        if (
          result.binding?.enabled &&
          Date.parse(result.binding.nextPollAt) <= Date.now()
        ) {
          const sync = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "sync",
              expectedRevision: result.binding.revision,
            }),
            signal: controller.signal,
          });
          if (!sync.ok) throw Error();
          result = (await sync.json()) as RefereeMpView;
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
      controller.abort();
      clearTimeout(timer);
    };
  }, [endpoint, refresh]);
  async function change(action: "bind" | "unbind") {
    if (manual.current || disabled) return;
    manual.current = true;
    generation.current++;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          expectedRevision: binding?.revision ?? 0,
          ...(action === "bind"
            ? {
                match,
                expectedSessionRevision: workspace.session?.revision ?? 0,
                dependencyFingerprint: workspace.dependencyFingerprint,
              }
            : {}),
        }),
      });
      if (!response.ok) throw Error();
      const result = (await response.json()) as RefereeMpView;
      setBinding(result.binding);
      onWorkspace(result.workspace);
      setMatch("");
      setRefresh((n) => n + 1);
    } catch {
      setError(true);
    } finally {
      manual.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="panel" open={binding?.enabled || undefined}>
      <summary>
        {tr("MP result sync")}
        {!!binding?.issues.length && (
          <>
            {" "}
            ·{" "}
            {tr("Manual review required: {count}", {
              count: binding.issueCount,
            })}
          </>
        )}
      </summary>
      <div className="form-stack">
        {binding?.enabled ? (
          <div className="actions">
            <a
              href={`https://osu.ppy.sh/community/matches/${binding.matchId}`}
              target="_blank"
              rel="noreferrer"
            >
              MP {binding.matchId}
            </a>
            <button
              type="button"
              className="secondary"
              disabled={disabled || busy}
              onClick={() => void change("unbind")}
            >
              {tr("Stop MP sync")}
            </button>
          </div>
        ) : (
          <form
            className="actions"
            onSubmit={(e) => {
              e.preventDefault();
              void change("bind");
            }}
          >
            <label className="field">
              <span>{tr("MP link")}</span>
              <input
                type="url"
                placeholder="https://osu.ppy.sh/community/matches/…"
                value={match}
                onChange={(e) => setMatch(e.target.value)}
                disabled={disabled || busy}
              />
            </label>
            <button type="submit" disabled={disabled || busy || !match.trim()}>
              {tr("Bind MP link")}
            </button>
          </form>
        )}
        {binding?.enabled && (
          <p className="small muted">
            {tr(
              "Finished games sync while this panel is open. Replays and unusual results need manual review.",
            )}
          </p>
        )}
        {binding?.lastCheckedAt && (
          <p className="small muted">
            {tr("Last checked: {time}", {
              time: new Date(binding.lastCheckedAt).toLocaleTimeString(),
            })}
          </p>
        )}
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
              "Match settings changed. Review the referee records and bind the MP link again.",
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
                const records = document.getElementById(
                  "referee-record-editor",
                );
                if (records instanceof HTMLDetailsElement) records.open = true;
              }}
            >
              {tr("Review referee records")}
            </a>
            <ul>
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
    </details>
  );
}
