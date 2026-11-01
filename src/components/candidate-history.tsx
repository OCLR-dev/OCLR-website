"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { CandidateHistory as History } from "@/lib/mappool-history";
import { WorkbenchActionIcon } from "./workbench-action-icon";
import styles from "./mappool-workbench.module.css";

export function CandidateHistory({
  slug,
  candidateId,
  beatmapId,
}: {
  slug: string;
  candidateId: string;
  beatmapId: number;
}) {
  const tr = useAppTranslations();
  const titleId = useId();
  const defaultError = tr("Could not check historical mappool usage.");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
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
    setOpen(false);
  }
  async function search() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setOpen(true);
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/tournaments/${slug}/mappool-workbench/${candidateId}/history`,
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
      <button
        ref={trigger}
        type="button"
        className={`secondary ${styles.iconButton}`}
        aria-label={tr("Check history")}
        title={tr("Check history")}
        onClick={() => void search()}
      >
        <WorkbenchActionIcon kind="history" />
      </button>
      {open && (
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
              <button type="button" onClick={() => void search()}>
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
                          [match.roundName, match.poolName].filter(Boolean),
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
