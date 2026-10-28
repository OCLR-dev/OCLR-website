"use client";

import { useAppTranslations } from "@/i18n/shared";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { usePendingRefresh } from "./use-pending-refresh";
import { LoadingRegion } from "./loading-region";
import type { MappoolWorkspace } from "@/lib/mappools";
import { slotLabel, type MappoolCategory } from "@/lib/mappool-model";
import { BeatmapDetails } from "./beatmap-details";

type Entry = MappoolWorkspace["entries"][number];
type Target = { id: string; after: boolean };
export function MappoolOrder({
  url,
  pool,
  category,
  entries,
  editable,
  onFeedback,
  renderActions,
  renderAttachments,
}: {
  url: string;
  pool: MappoolWorkspace["pools"][number];
  category: MappoolCategory;
  entries: Entry[];
  editable: boolean;
  onFeedback: (message: string, failed?: boolean) => void;
  renderActions: (entry: Entry) => ReactNode;
  renderAttachments?: (entry: Entry) => ReactNode;
}) {
  const tr = useAppTranslations();

  const { refreshing, refresh } = usePendingRefresh();
  const helpId = useId();
  const list = useRef<HTMLOListElement>(null);
  const [order, setOrder] = useState(entries.map((e) => e.id));
  const [version, setVersion] = useState(pool.version);
  const [requestPending, setBusy] = useState(false);
  const saving = useRef(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const pointer = useRef<{
    id: string;
    x: number;
    y: number;
    version: number;
  } | null>(null);
  const frame = useRef(0);
  const busy = requestPending || refreshing;
  if (version !== pool.version) {
    setVersion(pool.version);
    setOrder(entries.map((e) => e.id));
    setDragging(null);
    setTarget(null);
  }
  useEffect(
    () => () => {
      pointer.current = null;
      cancelAnimationFrame(frame.current);
    },
    [pool.version],
  );
  const changed = order.some((id, i) => id !== entries[i]?.id);
  const canMove = editable && !busy;
  const ordered = order.flatMap((id) => entries.filter((e) => e.id === id));
  function cancelDrag() {
    pointer.current = null;
    cancelAnimationFrame(frame.current);
    setDragging(null);
    setTarget(null);
  }
  function focusHandle(id: string) {
    requestAnimationFrame(() =>
      list.current
        ?.querySelector<HTMLButtonElement>(
          `[data-map-entry="${id}"] .mappool-drag-handle`,
        )
        ?.focus({ preventScroll: true }),
    );
  }
  function move(id: string, position: number) {
    if (!canMove || !order.includes(id)) return;
    const next = order.filter((value) => value !== id);
    next.splice(position, 0, id);
    if (next.every((value, i) => value === order[i])) return;
    setOrder(next);
    onFeedback(
      `${slotLabel(category, position + 1)} selected for beatmap ${entries.find((e) => e.id === id)!.beatmapId}. Save order to apply.`,
    );
    focusHandle(id);
  }
  function findTarget(): Target | null {
    const p = pointer.current;
    if (!p || p.version !== pool.version) return null;
    const hit = document
      .elementFromPoint(p.x, p.y)
      ?.closest<HTMLElement>("[data-map-entry]");
    if (!hit || !list.current?.contains(hit) || hit.dataset.mapEntry === p.id)
      return null;
    const rect = hit.getBoundingClientRect();
    return {
      id: hit.dataset.mapEntry!,
      after: p.y > rect.top + rect.height / 2,
    };
  }
  function trackDrag() {
    const p = pointer.current;
    if (!p || p.version !== pool.version) {
      cancelDrag();
      return;
    }
    const rect = list.current?.getBoundingClientRect();
    if (rect && p.x >= rect.left && p.x <= rect.right) {
      const delta = p.y < 100 ? -14 : p.y > innerHeight - 80 ? 14 : 0;
      if (delta) window.scrollBy(0, delta);
    }
    const next = findTarget();
    setTarget((previous) =>
      previous?.id === next?.id && previous?.after === next?.after
        ? previous
        : next,
    );
    frame.current = requestAnimationFrame(trackDrag);
  }
  function start(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!canMove || saving.current || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = {
      id,
      x: event.clientX,
      y: event.clientY,
      version: pool.version,
    };
    setDragging(id);
    frame.current = requestAnimationFrame(trackDrag);
  }
  function drop(event: PointerEvent<HTMLButtonElement>) {
    const p = pointer.current;
    if (p) {
      p.x = event.clientX;
      p.y = event.clientY;
    }
    const destination = findTarget();
    cancelDrag();
    if (!p || !destination || p.version !== pool.version) return;
    const remaining = order.filter((id) => id !== p.id);
    const index = remaining.indexOf(destination.id);
    if (index >= 0) move(p.id, index + Number(destination.after));
  }
  async function save() {
    if (!canMove || !changed || saving.current || pointer.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reorder",
          poolId: pool.id,
          expectedVersion: pool.version,
          category,
          entryIds: order,
          confirmed: true,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "The order could not be saved.");
      }
      onFeedback(`${category} order saved.`);
      refresh();
    } catch (error) {
      setOrder(entries.map((e) => e.id));
      onFeedback(
        `Order could not be confirmed. Refreshing the saved order. ${error instanceof Error ? error.message : "Check your connection before retrying."}`,
        true,
      );
      refresh();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {busy && <LoadingRegion />}
      {editable && (
        <div className="mappool-order-toolbar">
          <p id={helpId} className="sr-only">
            {tr(
              "Drag to a drop indicator, or use Arrow Up / Down, Home / End on a handle. Move buttons and the position picker also change the preview.",
            )}
          </p>
          <p className="muted small">
            {tr(
              "Drag a handle, use Move up / down, or choose a position. Save once to apply the order.",
            )}
          </p>
          <div className="actions">
            <button
              type="button"
              disabled={!changed || busy || !!dragging}
              aria-busy={busy}
              onClick={save}
            >
              {tr("Save order")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!changed || busy || !!dragging}
              onClick={() => {
                setOrder(entries.map((e) => e.id));
                onFeedback("Saved order restored.");
              }}
            >
              {tr("Reset order")}
            </button>
          </div>
          {changed && (
            <p className="small muted">
              {tr("Unsaved order · ")}
              {category} {tr(" slots will be renumbered.")}
            </p>
          )}
        </div>
      )}
      <ol
        ref={list}
        className="mappool-order"
        aria-label={tr("{value0} map order", { value0: category })}
      >
        {ordered.map((entry, index) => {
          const label = slotLabel(
            category,
            changed ? index + 1 : entry.position,
          );
          const dropClass =
            target?.id === entry.id
              ? target.after
                ? " drop-after"
                : " drop-before"
              : "";
          return (
            <li
              key={entry.id}
              data-map-entry={entry.id}
              data-beatmap-id={entry.beatmapId}
              className={`mappool-entry-controls${dragging === entry.id ? " is-dragging" : ""}${dropClass}`}
            >
              {editable && (
                <div className="mappool-order-controls">
                  <button
                    type="button"
                    className="secondary mappool-drag-handle"
                    aria-label={tr("Move {value0}", { value0: label })}
                    aria-describedby={helpId}
                    disabled={!canMove}
                    onPointerDown={(event) => start(event, entry.id)}
                    onPointerMove={(event) => {
                      if (pointer.current) {
                        pointer.current.x = event.clientX;
                        pointer.current.y = event.clientY;
                      }
                    }}
                    onPointerUp={drop}
                    onPointerCancel={cancelDrag}
                    onLostPointerCapture={cancelDrag}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") cancelDrag();
                      const position =
                        event.key === "ArrowUp"
                          ? index - 1
                          : event.key === "ArrowDown"
                            ? index + 1
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? ordered.length - 1
                                : null;
                      if (
                        position !== null &&
                        !dragging &&
                        position >= 0 &&
                        position < ordered.length
                      ) {
                        event.preventDefault();
                        move(entry.id, position);
                      }
                    }}
                  >
                    <span aria-hidden="true">⠿</span>
                  </button>
                  <strong>{label}</strong>
                  <div className="actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={!canMove || !!dragging || index === 0}
                      aria-label={tr("Move {value0} up", { value0: label })}
                      onClick={() => move(entry.id, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={
                        !canMove || !!dragging || index === ordered.length - 1
                      }
                      aria-label={tr("Move {value0} down", { value0: label })}
                      onClick={() => move(entry.id, index + 1)}
                    >
                      ↓
                    </button>
                  </div>
                  <label className="mappool-position">
                    <span className="sr-only">
                      {tr("Position for ")}
                      {label}
                    </span>
                    <select
                      aria-label={tr("Position for {value0}", {
                        value0: label,
                      })}
                      disabled={!canMove || !!dragging}
                      value={index + 1}
                      onChange={(event) =>
                        move(entry.id, Number(event.target.value) - 1)
                      }
                    >
                      {ordered.map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <BeatmapDetails
                beatmapId={entry.beatmapId}
                metadata={entry.metadata}
                label={editable ? undefined : label}
                category={category}
              />
              {editable && (
                <fieldset
                  className="mappool-entry-actions"
                  aria-label={tr("Map actions for {value0}", { value0: label })}
                  disabled={changed || busy || !!dragging}
                >
                  {renderActions(entry)}
                </fieldset>
              )}
              {renderAttachments?.(entry)}
            </li>
          );
        })}
      </ol>
    </>
  );
}
