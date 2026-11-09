"use client";

import { InfoNote } from "@/components/info-note";

import { ReadOnlyFields } from "./staff-read-only";
import { useAppTranslations } from "@/i18n/shared";

import { useEffect, useRef, useState } from "react";
import type { MappoolBatchPreview } from "@/lib/mappool-write-contracts";
import type { MappoolWorkspace } from "@/lib/mappool-reads";
import {
  categories,
  slotLabel,
  formatBeatmapDuration,
  formatBeatmapNumber,
  moveMappoolEntries,
  type MappoolCategory,
} from "@/lib/mappool-model";
import { ConfirmMutation } from "./confirm-mutation";
type Pool = MappoolWorkspace["pools"][number];
export function MappoolBatch({
  url,
  pool,
  entries,
  mode,
  onFeedback,
}: {
  mode: "import" | "batch";
  url: string;
  pool: Pool;
  entries: MappoolWorkspace["entries"];
  onFeedback: (message: string, failed?: boolean) => void;
}) {
  const tr = useAppTranslations();

  const [text, setText] = useState("");
  const [preview, setPreview] = useState<MappoolBatchPreview | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState<MappoolCategory>("NM"),
    [position, setPosition] = useState("1");
  const request = useRef<AbortController | null>(null);
  const [version, setVersion] = useState(pool.version);
  if (version !== pool.version) {
    setVersion(pool.version);
    setPreview(null);
    setSelected([]);
    setBusy(false);
  }
  useEffect(() => () => request.current?.abort(), [pool.version]);
  async function lookup() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const response = await fetch(`${url}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poolId: pool.id,
          expectedVersion: pool.version,
          text,
          category,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Batch preview failed.");
      if (!controller.signal.aborted) setPreview(data);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Batch preview failed.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const base = {
    poolId: pool.id,
    expectedVersion: pool.version,
    confirmed: true,
  };
  const ready =
    preview &&
    preview.version === pool.version &&
    preview.rows.length > 0 &&
    preview.rows.every((r) => !r.error && r.snapshot);
  let movePreview: typeof entries = [],
    moveError = "";
  if (selected.length) {
    try {
      movePreview = moveMappoolEntries(
        entries,
        entries.filter((e) => selected.includes(e.id)).map((e) => e.id),
        category,
        Number(position),
      );
    } catch (error) {
      moveError = (error as Error).message;
    }
  }
  return (
    <ReadOnlyFields>
      <section className="mappool-batch">
        {mode === "import" && (
          <div className="form-stack">
            <h3>{tr("Import multiple beatmaps")}</h3>
            <InfoNote>
              <p className="muted small">
                {tr(
                  "Paste up to 50 IDs or difficulty URLs. Slots append automatically; existing maps stay unchanged.",
                )}
              </p>
            </InfoNote>
            <label className="field">
              <span>{tr("Import category")}</span>
              <select
                aria-label={tr("Import category")}
                value={category}
                onChange={(event) => {
                  request.current?.abort();
                  setBusy(false);
                  setPreview(null);
                  setError("");
                  setCategory(event.target.value as MappoolCategory);
                }}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <details>
              <summary>{tr("Import format help")}</summary>
              <InfoNote>
                <p className="muted small">
                  {tr(
                    "Optional: prefix a row with NM1, HD1 or another explicit slot. Plain rows skip reserved slots.",
                  )}
                </p>
              </InfoNote>
            </details>
            <label className="field">
              <span>{tr("Map rows")}</span>
              <textarea
                aria-label={tr("Map rows")}
                rows={6}
                maxLength={16000}
                value={text}
                placeholder={tr(
                  "4184799\nhttps://osu.ppy.sh/beatmaps/123\nhttps://osu.ppy.sh/beatmapsets/2010589#osu/4184800",
                )}
                onChange={(e) => {
                  request.current?.abort();
                  setBusy(false);
                  setPreview(null);
                  setError("");
                  setText(e.target.value);
                }}
              />
            </label>
            <div className="actions">
              <button
                type="button"
                disabled={busy || !text.trim()}
                onClick={lookup}
              >
                {busy ? tr("Looking up beatmaps…") : tr("Preview batch")}
              </button>
            </div>
            {error && (
              <p role="alert" className="notice error-text">
                {error}
              </p>
            )}
            <div role="status" aria-live="polite">
              {busy
                ? tr("Retrieving official metadata…")
                : preview
                  ? tr("{value0} of {value1} rows ready.", {
                      value0: preview.rows.filter((r) => !r.error).length,
                      value1: preview.rows.length,
                    })
                  : ""}
            </div>
            {preview && (
              <>
                <div
                  className="table-scroll"
                  role="region"
                  aria-label={tr("Batch preview")}
                  tabIndex={0}
                >
                  <table>
                    <caption>
                      {tr("Batch preview — ")}
                      {pool.name}
                    </caption>
                    <thead>
                      <tr>
                        {[
                          "Row / slot",
                          "BID",
                          "Artist / title",
                          "Difficulty / mapper",
                          "Base SR",
                          "BPM / duration",
                          "Validation",
                        ].map((h) => (
                          <th key={h} scope="col">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r) => (
                        <tr key={r.line}>
                          <th scope="row">
                            {r.line} ·{" "}
                            {r.category && r.position
                              ? slotLabel(r.category, r.position)
                              : "—"}
                          </th>
                          <td>{r.beatmapId ?? "—"}</td>
                          <td>
                            {r.snapshot
                              ? `${r.snapshot.metadata.artist} — ${r.snapshot.metadata.title}`
                              : "—"}
                          </td>
                          <td>
                            {r.snapshot
                              ? `${r.snapshot.metadata.difficulty} · ${r.snapshot.metadata.mapper}`
                              : "—"}
                          </td>
                          <td>
                            {formatBeatmapNumber(r.snapshot?.metadata.stars, 2)}
                          </td>
                          <td>
                            {r.snapshot
                              ? tr("{value0} BPM · {value1}", {
                                  value0: formatBeatmapNumber(
                                    r.snapshot.metadata.bpm,
                                  ),
                                  value1: formatBeatmapDuration(
                                    r.snapshot.metadata.duration,
                                  ),
                                })
                              : "—"}
                          </td>
                          <td className={r.error ? "error-text" : ""}>
                            {r.error
                              ? tr(r.error)
                              : r.warning
                                ? tr(r.warning)
                                : tr("Ready")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ConfirmMutation
                  requireConfirmation={false}
                  label={tr("Import verified batch")}
                  title={tr("Import beatmaps")}
                  description={tr("Save the verified rows atomically.")}
                  url={url}
                  disabled={!ready}
                  onSuccess={() => {
                    setText("");
                    setPreview(null);
                    onFeedback("Beatmap batch imported.");
                  }}
                  onError={(message) =>
                    onFeedback(
                      `Batch was not saved. ${message} Preview the batch again.`,
                      true,
                    )
                  }
                  payload={{
                    ...base,
                    action: "batch_import",
                    text,
                    category,
                    rows: preview.rows.map((r) => ({
                      category: r.category,
                      position: r.position,
                      beatmap: String(r.beatmapId),
                      expectedMetadataFingerprint: r.snapshot?.fingerprint,
                    })),
                  }}
                />
              </>
            )}
          </div>
        )}
        {mode === "batch" &&
          (entries.length > 0 ? (
            <div className="form-stack">
              <h3>{tr("Manage multiple map slots")}</h3>
              <InfoNote>
                <p className="muted small">
                  {tr(
                    "Select up to 50 maps. Insert them at a position in the destination category; remaining maps shift and that category is renumbered.",
                  )}
                </p>
              </InfoNote>
              <div className="table-scroll">
                <table>
                  <caption>{tr("Saved map selection")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{tr("Select")}</th>
                      <th scope="col">{tr("Slot")}</th>
                      <th scope="col">{tr("Beatmap")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={tr("Select {value0}", {
                              value0: slotLabel(e.category, e.position),
                            })}
                            checked={selected.includes(e.id)}
                            onChange={(event) =>
                              setSelected(
                                event.target.checked
                                  ? [...selected, e.id]
                                  : selected.filter((id) => id !== e.id),
                              )
                            }
                          />
                        </td>
                        <th scope="row">{slotLabel(e.category, e.position)}</th>
                        <td>
                          {e.metadata.artist} — {e.metadata.title} [
                          {e.metadata.difficulty}] · {e.beatmapId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted small">
                {selected.length} {tr(" selected")}
              </p>
              <div className="filters">
                <label className="field">
                  <span>{tr("Move to category")}</span>
                  <select
                    aria-label={tr("Move to category")}
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as MappoolCategory)
                    }
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{tr("Insert at position")}</span>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                  />
                </label>
              </div>
              {moveError && (
                <p className="error-text" role="status">
                  {moveError}
                </p>
              )}
              {movePreview.length > 0 && (
                <details open>
                  <summary>{tr("Preview destination order")}</summary>
                  <ol className="mappool-move-preview">
                    {movePreview.map((e) => (
                      <li key={e.id}>
                        {slotLabel(e.category, e.position)} ·{" "}
                        {e.metadata.artist} — {e.metadata.title} · {e.beatmapId}
                        {selected.includes(e.id) ? tr(" (selected)") : ""}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              <div className="actions">
                <ConfirmMutation
                  loadingFeedback="button"
                  requireConfirmation={false}
                  label={tr("Move / renumber selected")}
                  title={tr("Move map slots")}
                  description={tr(
                    "Insert the selected maps and renumber the destination category.",
                  )}
                  url={url}
                  disabled={
                    !selected.length || selected.length > 50 || !!moveError
                  }
                  payload={{
                    ...base,
                    action: "batch_move",
                    entryIds: entries
                      .filter((e) => selected.includes(e.id))
                      .map((e) => e.id),
                    category,
                    position: Number(position),
                  }}
                />
                <ConfirmMutation
                  loadingFeedback="button"
                  requireConfirmation={false}
                  label={tr("Refresh selected metadata")}
                  title={tr("Refresh metadata")}
                  description={tr(
                    "Retrieve official metadata for every selected map; any failure leaves all saved maps unchanged.",
                  )}
                  url={url}
                  disabled={!selected.length || selected.length > 50}
                  payload={{
                    ...base,
                    action: "batch_refresh",
                    entryIds: selected,
                  }}
                />
                <ConfirmMutation
                  loadingFeedback="button"
                  label={tr("Remove selected maps")}
                  title={tr("Remove selected maps")}
                  description={tr(
                    "Remove {value0} selected map slots? This cannot be undone in the editor. Historical audit records are retained.",
                    { value0: selected.length },
                  )}
                  url={url}
                  disabled={!selected.length || selected.length > 50}
                  payload={{
                    ...base,
                    action: "batch_remove",
                    entryIds: selected,
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="muted small">
              {tr(
                "No maps to select. Add beatmaps in Maps or Bulk import first.",
              )}
            </p>
          ))}
      </section>
    </ReadOnlyFields>
  );
}
