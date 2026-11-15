"use client";
import { refereeMessage } from "@/i18n/referee";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { RefereeReconciliationWorkspace } from "@/lib/referee-reconciliation";
import type { RefereeReconciliationRequest } from "@/lib/referee-write-contracts";
import { reconciliationBatchLimit } from "@/lib/request-body-limits";
import {
  reconciliationOptions,
  noGameLink,
  unavailableGameLink,
} from "@/lib/referee-reconciliation-model";
import styles from "./referee-reconciliation.module.css";

export function RefereeReconciliation({
  slug,
  fixtureId,
}: {
  slug: string;
  fixtureId: string;
}) {
  const tr = useAppTranslations();
  const [data, setData] = useState<RefereeReconciliationWorkspace | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<RefereeReconciliationRequest | null>(
    null,
  );
  const readGeneration = useRef(0);
  const url = `/api/admin/tournaments/${slug}/matches/${fixtureId}/referee/reconciliation`;
  const load = useCallback(() => {
    const generation = ++readGeneration.current;
    return fetch(url, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (generation !== readGeneration.current) return;
        if (!response.ok) throw new Error(body.error);
        setData(body);
      })
      .catch((e) => {
        if (generation === readGeneration.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
  }, [url]);
  useEffect(() => {
    const reads = readGeneration;
    void load();
    return () => {
      reads.current++;
    };
  }, [load]);
  const rows = data ? reconciliationOptions(data.rows, data.sources) : [];
  const rowsWithChoices = rows.map((row) => {
    const draft = choices[row.attemptId];
    const value =
      (draft === noGameLink && row.link?.importId) ||
      row.games.some((game) => game.value === draft)
        ? draft
        : row.savedValue;
    const game = row.games.find((game) => game.value === value);
    const change = game
      ? {
          attemptId: row.attemptId,
          importId: game.importId,
          sourceFingerprint: game.fingerprint,
          gameId: game.id,
        }
      : value === noGameLink && row.link?.importId
        ? {
            attemptId: row.attemptId,
            importId: null,
            sourceFingerprint: null,
            gameId: null,
          }
        : null;
    return { ...row, value, change };
  });
  const readyIds = rowsWithChoices.flatMap((row) =>
    row.change && (row.value !== row.savedValue || row.status === "stale")
      ? [row.attemptId]
      : [],
  );
  const selectedIds = readyIds.filter((id) => selected.includes(id));
  const allReadySelected =
    selectedIds.length > 0 &&
    selectedIds.length === Math.min(readyIds.length, reconciliationBatchLimit);
  const suggestions = rowsWithChoices.flatMap((row) =>
    row.suggestion && choices[row.attemptId] === undefined
      ? [[row.attemptId, row.suggestion] as const]
      : [],
  );

  function selectSuggestedGames() {
    setChoices({
      ...choices,
      ...Object.fromEntries(suggestions),
    });
    setSelected(
      [...new Set([...selectedIds, ...suggestions.map(([id]) => id)])].slice(
        0,
        reconciliationBatchLimit,
      ),
    );
  }

  async function save(attemptIds: string[]) {
    if (!data?.canRecord || busy) return;
    let request = pending;
    if (!request) {
      const links = rowsWithChoices.flatMap((row) =>
        row.change && attemptIds.includes(row.attemptId) ? [row.change] : [],
      );
      if (!links.length || links.length !== attemptIds.length) return;
      const version = {
        requestKey: crypto.randomUUID(),
        expectedRevision: data.revision,
        expectedSessionRevision: data.sessionRevision,
        dependencyFingerprint: data.dependencyFingerprint,
      };
      request =
        links.length === 1
          ? { ...version, ...links[0] }
          : { ...version, links };
    }
    const savedIds = new Set(
      "links" in request
        ? request.links.map((link) => link.attemptId)
        : [request.attemptId],
    );
    // A read started before this write must not restore its older workspace.
    readGeneration.current++;
    setPending(request);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status < 500) setPending(null);
        throw new Error(body.error);
      }
      setPending(null);
      setData(body.workspace);
      setChoices((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => !savedIds.has(id)),
        ),
      );
      setSelected((current) => current.filter((id) => !savedIds.has(id)));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : tr("The request could not be completed."),
      );
    } finally {
      setBusy(false);
    }
  }
  const team = (id: string | null) =>
    data?.teams.find((t) => t.id === id)?.name ?? tr("Not available");
  const statuses = {
    unmatched: tr("Not linked to an MP game"),
    stale: tr("Record or source changed; confirm the link again"),
    missing: tr("Saved MP game is missing"),
    incomplete: tr("Incomplete game or referee record"),
    different_map: tr("Different beatmap"),
    different_result: tr("Result differs; review required"),
    matched: tr("Recorded result matches this MP game"),
  };
  return (
    <section
      className={`panel ${styles.reconciliation}`}
      aria-labelledby="referee-reconciliation-heading"
    >
      <header className={styles.header}>
        <h2 id="referee-reconciliation-heading">
          {tr("Post-match reconciliation")}
        </h2>
        <div className={styles.actions}>
          <button
            type="button"
            className="secondary"
            disabled={busy || pending !== null}
            onClick={() => {
              setError("");
              void load();
            }}
          >
            {tr("Refresh reconciliation")}
          </button>
          <Link
            className="button secondary"
            href={`/admin/tournaments/${slug}/matches/${fixtureId}`}
          >
            {tr("Open MP review")}
          </Link>
        </div>
      </header>
      <p className="small muted">
        {tr(
          "Choose a saved MP game for each attempt, then select the rows to save together. Choose replay games individually.",
        )}
      </p>
      {error && (
        <p role="alert" className="notice">
          {refereeMessage(tr, error)}
        </p>
      )}
      {pending && !busy && (
        <div className="notice">
          <p>
            {tr(
              "The previous save has an unknown outcome. Retry the same request before editing links.",
            )}
          </p>
          <button type="button" onClick={() => save([])}>
            {tr("Retry save")}
          </button>
        </div>
      )}
      {!data && !error && <p>{tr("Loading…")}</p>}
      {data && (
        <>
          <div className={styles.summary}>
            <p className={styles.score}>
              {tr("Referee provisional score")}:{" "}
              {data.teams
                .map((t) => `${t.name} ${data.ledgerScore[t.id] ?? 0}`)
                .join(" · ")}
            </p>
            {data.official ? (
              <p className="small muted">
                {tr("Saved result revision")}: {data.official.revision} ·{" "}
                {data.official.publishedRevision === data.official.revision
                  ? tr("Published result")
                  : tr("Not published")}
                {data.official.series &&
                  ` · ${data.official.series.homeWins} – ${data.official.series.awayWins}`}
              </p>
            ) : (
              <p className="small muted">{tr("No result submitted")}</p>
            )}
          </div>
          {!data.rows.length && (
            <p>
              {tr(
                "Record a Pick and its attempts before reconciling MP games.",
              )}
            </p>
          )}
          {data.canRecord && rowsWithChoices.length > 0 && (
            <div className={styles.toolbar}>
              <div className={styles.actions}>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || pending !== null || !readyIds.length}
                  onClick={() =>
                    setSelected(
                      allReadySelected
                        ? []
                        : readyIds.slice(0, reconciliationBatchLimit),
                    )
                  }
                >
                  {allReadySelected
                    ? tr("Clear selection")
                    : tr("Select all ready rows")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || pending !== null || !suggestions.length}
                  onClick={selectSuggestedGames}
                >
                  {tr("Select unique matches")}
                </button>
              </div>
              <div className={styles.actions}>
                <span className="small muted" aria-live="polite">
                  {tr("{value0} selected", { value0: selectedIds.length })}
                </span>
                <button
                  type="button"
                  disabled={busy || pending !== null || !selectedIds.length}
                  onClick={() => save(selectedIds)}
                >
                  {tr("Save selected links")}
                </button>
              </div>
            </div>
          )}
          <div className={styles.rows}>
            {rowsWithChoices.map((row) => {
              const title = `${row.category} · ${row.beatmapId} · ${tr(
                "Attempt {value0}",
                { value0: row.attemptNumber },
              )}`;
              const checked = selectedIds.includes(row.attemptId);
              return (
                <article className={styles.row} key={row.attemptId}>
                  <div className={styles.attempt}>
                    {data.canRecord && (
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          aria-label={tr("Select {value0}", { value0: title })}
                          checked={checked}
                          disabled={
                            busy ||
                            pending !== null ||
                            !readyIds.includes(row.attemptId) ||
                            (!checked &&
                              selectedIds.length >= reconciliationBatchLimit)
                          }
                          onChange={(event) =>
                            setSelected(
                              event.target.checked
                                ? [...selectedIds, row.attemptId]
                                : selectedIds.filter(
                                    (id) => id !== row.attemptId,
                                  ),
                            )
                          }
                        />
                      </label>
                    )}
                    <div className={styles.details}>
                      <div className={styles.metadata}>
                        <h3>{title}</h3>
                        <p className="small muted">
                          {tr("Picked by")}: {team(row.pickTeamId)} ·{" "}
                          {tr("Recorded winner")}: {team(row.winnerTeamId)}
                        </p>
                      </div>
                      <div className={styles.metadata}>
                        <p className={styles.status} role="status">
                          {statuses[row.status]}
                        </p>
                        {row.link?.importId &&
                          (!data.canRecord || row.status !== "matched") && (
                            <p className="small muted">
                              {tr("Saved game link")}: {row.link.gameId} ·{" "}
                              {tr("MP winner")}: {team(row.sourceWinnerTeamId)}
                            </p>
                          )}
                      </div>
                    </div>
                  </div>
                  {data.canRecord && (
                    <div className={styles.linkControls}>
                      <select
                        className={styles.gameField}
                        aria-label={`${tr("Choose the exact saved MP game")} · ${title}`}
                        disabled={busy || pending !== null}
                        value={row.value}
                        onChange={(event) => {
                          const value = event.target.value;
                          setChoices((current) => {
                            const next = { ...current };
                            if (value === row.savedValue)
                              delete next[row.attemptId];
                            else next[row.attemptId] = value;
                            return next;
                          });
                          if (
                            value === row.savedValue &&
                            row.status !== "stale"
                          ) {
                            setSelected((current) =>
                              current.filter((id) => id !== row.attemptId),
                            );
                          }
                        }}
                      >
                        {!row.link?.importId && (
                          <option value="">
                            {tr("Choose the exact saved MP game")}
                          </option>
                        )}
                        {row.savedValue === unavailableGameLink && (
                          <option value={unavailableGameLink}>
                            {tr("Saved game link")}: {row.link?.gameId}
                          </option>
                        )}
                        {row.link?.importId && (
                          <option value={noGameLink}>
                            {tr("No game link")}
                          </option>
                        )}
                        {row.games.map((game) => (
                          <option key={game.value} value={game.value}>
                            MP {game.matchId} · {tr("Game")} {game.id} ·{" "}
                            {team(game.winnerTeamId)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={`secondary ${styles.save}`}
                        disabled={busy || pending !== null || !row.change}
                        onClick={() => save([row.attemptId])}
                      >
                        {tr("Save game link")}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {data.history.length > 0 && (
            <details>
              <summary>{tr("Reconciliation history")}</summary>
              <ul>
                {data.history.map((entry) => (
                  <li key={entry.id}>
                    {tr("Saved result revision")}: {entry.revision} ·{" "}
                    {tr("Game")} {entry.gameId ?? "—"} ·{" "}
                    {tr("Referee record revision")}: {entry.sessionRevision}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
