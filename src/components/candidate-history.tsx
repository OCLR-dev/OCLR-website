"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { CandidateHistory as History } from "@/lib/mappool-history";
import { mappoolDisplayName } from "@/lib/mappool-label";
import { parseBeatmapId } from "@/lib/mappool-model";
import { WorkbenchActionIcon } from "./workbench-action-icon";
import styles from "./mappool-workbench.module.css";

export function CandidateHistory({
  slug,
  candidate,
}: {
  slug: string;
  candidate?: { id: string; beatmapId: number };
}) {
  const tr = useAppTranslations();
  const titleId = useId();
  const defaultError = tr("Could not check historical mappool usage.");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [invalidQuery, setInvalidQuery] = useState(false);
  const [beatmapId, setBeatmapId] = useState<number | null>(null);
  const open = beatmapId !== null;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<History | null>(null);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const node = dialog.current!;
    const opener = trigger.current;
    node.showModal();
    return () => {
      node.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);
  function close() {
    controller.current?.abort();
    setBeatmapId(null);
  }
  async function search(id: number) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBeatmapId(id);
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const base = `/api/admin/tournaments/${slug}/mappool-workbench`;
      const response = await fetch(
        candidate ? `${base}/${candidate.id}/history` : `${base}?beatmap=${id}`,
        { cache: "no-store", signal: request.signal },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? defaultError);
      if (!request.signal.aborted) setResult(data);
    } catch (error) {
      if (!request.signal.aborted)
        setError(
          error instanceof TypeError ? defaultError : (error as Error).message,
        );
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      {candidate ? (
        <button
          ref={trigger}
          type="button"
          className={`secondary ${styles.iconButton}`}
          aria-label={tr("Check history")}
          title={tr("Check history")}
          onClick={() => void search(candidate.beatmapId)}
        >
          <WorkbenchActionIcon kind="history" />
        </button>
      ) : (
        <form
          role="search"
          aria-label={tr("Historical mappool usage")}
          className={styles.historySearch}
          onSubmit={(event) => {
            event.preventDefault();
            const id = parseBeatmapId(query);
            setInvalidQuery(id === null);
            if (id !== null) void search(id);
          }}
        >
          <label className="field">
            <span>{tr("Beatmap ID or difficulty URL")}</span>
            <input
              type="search"
              maxLength={250}
              value={query}
              aria-invalid={invalidQuery}
              aria-describedby={
                invalidQuery ? `${titleId}-query-error` : undefined
              }
              onChange={(event) => {
                setQuery(event.target.value);
                setInvalidQuery(false);
              }}
            />
          </label>
          <button ref={trigger} className="secondary" disabled={!query.trim()}>
            {tr("Check history")}
          </button>
          {invalidQuery && (
            <p
              id={`${titleId}-query-error`}
              className="small error"
              role="alert"
            >
              {tr("Invalid BID")}
            </p>
          )}
        </form>
      )}
      {beatmapId !== null && (
        <dialog
          ref={dialog}
          className={`map-dialog ${styles.historyDialog}`}
          aria-labelledby={titleId}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <div className={styles.historyHeading}>
            <h3 id={titleId}>{tr("Historical mappool usage")}</h3>
            <p className="small muted">
              {tr("BID")} {beatmapId} ·{" "}
              {tr("Published historical mappools only.")}
            </p>
            <button type="button" className="secondary" onClick={close}>
              {tr("Close")}
            </button>
          </div>
          {busy && <p role="status">{tr("Checking history…")}</p>}
          {error && (
            <>
              <p className="error" role="alert">
                {tr(error)}
              </p>
              <button type="button" onClick={() => void search(beatmapId)}>
                {tr("Retry")}
              </button>
            </>
          )}
          {result &&
            (result.matches.length ? (
              <ul className={styles.historyMatches}>
                {result.matches.map((match) => (
                  <li
                    key={`${match.editionSlug}/${match.poolId}/${match.slot}`}
                  >
                    <a
                      className="text-link"
                      href={`/tournaments/${match.editionSlug}/mappools/${match.poolId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {match.editionName}
                    </a>
                    <p>
                      {[
                        ...new Set(
                          (match.roundName
                            ? [match.roundName, match.poolName]
                            : [
                                mappoolDisplayName(
                                  tr,
                                  match.poolName,
                                  match.poolId,
                                ),
                              ]
                          ).filter(Boolean),
                        ),
                      ].join(" · ")}{" "}
                      · <strong>{match.slot}</strong>
                      {match.matchedBy === "original" && (
                        <> · {tr("Original BID")}</>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status">{tr("No historical records found.")}</p>
            ))}
        </dialog>
      )}
    </>
  );
}
