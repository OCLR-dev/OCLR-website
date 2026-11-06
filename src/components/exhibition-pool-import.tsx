"use client";
import { useEffect, useId, useState } from "react";
import type { HistoricalPoolChoice } from "@/lib/exhibition-pools";
import { useAppTranslations } from "@/i18n/shared";
import { ConfirmMutation } from "./confirm-mutation";
import { Spinner } from "./spinner";

export function ExhibitionPoolImport({
  slug,
  pool,
  onFeedback,
}: {
  slug: string;
  pool: { id: string; version: number; fmMode: string | null };
  onFeedback: (message: string, failed?: boolean) => void;
}) {
  const tr = useAppTranslations();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<HistoricalPoolChoice[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [edition, setEdition] = useState("");
  const [poolId, setPoolId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selectionError, setSelectionError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/admin/tournaments/${slug}/mappools/history`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not load historical mappools.");
        if (!controller.signal.aborted) setSources(data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [open, slug, attempt]);
  const editions = [
    ...new Map(
      (sources ?? []).map((source) => [source.editionSlug, source.editionName]),
    ).entries(),
  ];
  const currentEdition = editions.some(([slug]) => slug === edition)
    ? edition
    : editions[0]?.[0];
  const pools = (sources ?? []).filter(
    (source) => source.editionSlug === currentEdition,
  );
  const source = pools.find((source) => source.poolId === poolId) ?? pools[0];
  const maps = (source?.maps ?? []).filter((map) =>
    `${map.slot} ${map.beatmapId} ${map.title}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  function reset() {
    setSelectionError("");
    setSelected([]);
    setQuery("");
  }
  return (
    <details
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        if (nextOpen) {
          // A slot key can now identify a different map. Require a fresh
          // selection for each newly fetched source snapshot.
          setSources(null);
          setError("");
          reset();
        }
        setOpen(nextOpen);
      }}
      className="mappool-setup"
    >
      <summary>{tr("Choose from historical mappools")}</summary>
      {open && (
        <div className="form-stack spaced">
          <p className="muted small">
            {tr(
              "Choose up to 50 maps. Maps are appended in their original categories using current verified metadata; historical pools stay unchanged.",
            )}
          </p>
          {error ? (
            <div role="alert">
              <p className="error-text">{tr(error)}</p>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setError("");
                  setAttempt(attempt + 1);
                }}
              >
                {tr("Retry")}
              </button>
            </div>
          ) : !sources ? (
            <p role="status">
              <Spinner compact /> {tr("Loading historical mappools…")}
            </p>
          ) : !source ? (
            <p>{tr("No published historical mappools available.")}</p>
          ) : (
            <>
              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setSources(null);
                    setAttempt(attempt + 1);
                    reset();
                  }}
                >
                  {tr("Refresh historical mappools")}
                </button>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>{tr("Source tournament")}</span>
                  <select
                    value={currentEdition}
                    onChange={(event) => {
                      setEdition(event.target.value);
                      setPoolId("");
                      reset();
                    }}
                  >
                    {editions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{tr("Source mappool")}</span>
                  <select
                    value={source.poolId}
                    onChange={(event) => {
                      setPoolId(event.target.value);
                      reset();
                    }}
                  >
                    {pools.map((source) => (
                      <option key={source.poolId} value={source.poolId}>
                        {source.poolName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>{tr("Search maps")}</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={!maps.length}
                  onClick={() => {
                    const merged = [
                      ...new Set([...selected, ...maps.map((map) => map.key)]),
                    ];
                    if (merged.length > 50) {
                      setSelectionError(tr("Choose up to 50 maps."));
                      return;
                    }
                    setSelectionError("");
                    setSelected(merged);
                  }}
                >
                  {tr("Select all visible maps")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={!selected.length}
                  onClick={() => {
                    setSelectionError("");
                    setSelected([]);
                  }}
                >
                  {tr("Clear selection")}
                </button>
                <span role="status" className="muted small">
                  {tr("{count} maps selected", { count: selected.length })}
                </span>
              </div>
              {selectionError && <p role="alert">{selectionError}</p>}
              <fieldset
                className="form-stack"
                aria-labelledby={`${id}-maps`}
                style={{ maxHeight: "24rem", overflowY: "auto", minWidth: 0 }}
              >
                <legend id={`${id}-maps`}>
                  {source.editionName} · {source.poolName}
                </legend>
                {maps.map((map) => (
                  <label key={map.key} className="check-field">
                    <input
                      type="checkbox"
                      checked={selected.includes(map.key)}
                      disabled={
                        !selected.includes(map.key) && selected.length >= 50
                      }
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, map.key]
                            : selected.filter((key) => key !== map.key),
                        )
                      }
                    />
                    <span>
                      <strong>{map.slot}</strong> · {map.title}{" "}
                      <span className="muted small">
                        {tr("Beatmap ID")} {map.beatmapId}
                      </span>
                    </span>
                  </label>
                ))}
                {!maps.length && (
                  <p className="muted">{tr("No matching maps.")}</p>
                )}
              </fieldset>
              {source.maps.some(
                (map) => selected.includes(map.key) && map.category === "FM",
              ) &&
                !pool.fmMode && (
                  <p className="notice">
                    {tr("Configure FM before importing FM slots.")}
                  </p>
                )}
              <div className="actions">
                <ConfirmMutation
                  label={tr("Add selected maps")}
                  title={tr("Add selected maps")}
                  requireConfirmation={false}
                  canConfirm={
                    selected.length > 0 &&
                    selected.length <= 50 &&
                    (Boolean(pool.fmMode) ||
                      !source.maps.some(
                        (map) =>
                          selected.includes(map.key) && map.category === "FM",
                      ))
                  }
                  url={`/api/admin/tournaments/${slug}/mappools`}
                  payload={{
                    action: "history_import",
                    poolId: pool.id,
                    expectedVersion: pool.version,
                    sourceEdition: source.editionSlug,
                    sourcePool: source.poolId,
                    sourceFingerprint: source.fingerprint,
                    sourceKeys: selected,
                    confirmed: true,
                  }}
                  onError={(message) => onFeedback(message, true)}
                  onSuccess={() => {
                    reset();
                    onFeedback("Historical maps added.");
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}
    </details>
  );
}
