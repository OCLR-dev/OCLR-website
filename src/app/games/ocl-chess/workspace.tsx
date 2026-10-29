"use client";
import { useEffect, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { chessPalette, type ChessState } from "@/lib/ocl-chess-model";
import "./workspace.css";
const endpoint = "/api/games/ocl-chess";
export function ChessCanvas() {
  const tr = useAppTranslations();
  const connectionError = tr(
    "Canvas connection lost. Your selection is preserved.",
  );
  const [state, setState] = useState<ChessState | null>(null),
    [error, setError] = useState(""),
    [offline, setOffline] = useState(false),
    [busy, setBusy] = useState(false);
  const [color, setColor] = useState(5),
    [point, setPoint] = useState({ x: 0, y: 0 }),
    [zoom, setZoom] = useState(4),
    [remaining, setRemaining] = useState(0);
  const [clear, setClear] = useState(false),
    [width, setWidth] = useState(1),
    [height, setHeight] = useState(1);
  const canvas = useRef<HTMLCanvasElement>(null),
    view = useRef<HTMLDivElement>(null);
  const pending = useRef<{
    requestId: string;
    x: number;
    y: number;
    color: number;
  } | null>(null);
  const [retry, setRetry] = useState(false);
  const deadline = useRef(0),
    writing = useRef(false),
    generation = useRef(0);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  useEffect(() => {
    const viewport = view.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      setZoom(
        Math.min(32, Math.max(2, Math.ceil(Math.max(width, height) / 128))),
      );
      observer.disconnect();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  function receive(data: ChessState) {
    setState((old) => (!old || data.revision >= old.revision ? data : old));
    deadline.current = Date.now() + Math.max(0, data.nextAt - data.serverTime);
    setRemaining(
      Math.max(0, Math.ceil((data.nextAt - data.serverTime) / 1000)),
    );
  }
  useEffect(() => {
    let stopped = false;
    let reading = false;
    const controller = new AbortController();
    async function poll() {
      if (!writing.current && !reading && !document.hidden) {
        reading = true;
        const g = generation.current;
        try {
          const response = await fetch(endpoint, {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(10000),
            ]),
          });
          if (!response.ok) throw Error();
          const data = await response.json();
          if (!stopped && g === generation.current) {
            receive(data);
            setOffline(false);
          }
        } catch {
          if (!stopped) setOffline(true);
        } finally {
          reading = false;
        }
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 3000),
      clock = setInterval(
        () =>
          setRemaining(
            Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)),
          ),
        250,
      );
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [connectionError]);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !state) return;
    for (let i = 0; i < 16384; i++) {
      ctx.fillStyle = chessPalette[parseInt(state.pixels[i], 16)];
      ctx.fillRect(i % 128, Math.floor(i / 128), 1, 1);
    }
  }, [state]);
  async function submit(command: object, admin = false) {
    if (writing.current) return;
    writing.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: admin ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429)
          pending.current = null;
        throw Error(data.error);
      }
      receive(data);
      pending.current = null;
      setClear(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? tr(e.message)
          : tr("Save could not be confirmed. Retry the same pixel."),
      );
    } finally {
      setRetry(!!pending.current);
      writing.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="chess-workspace">
      <header>
        <h1>{tr("OCL Chess")}</h1>
        <p>
          {tr(
            "Choose a cell and color, then confirm. Drag to explore the canvas.",
          )}
        </p>
      </header>
      <div className="chess-toolbar">
        <button
          onClick={() => setZoom((z) => Math.max(2, z / 2))}
          aria-label={tr("Zoom out")}
        >
          −
        </button>
        <span>{zoom}×</span>
        <button
          onClick={() => setZoom((z) => Math.min(32, z * 2))}
          aria-label={tr("Zoom in")}
        >
          +
        </button>
        <span>{state?.enabled ? tr("Canvas open") : tr("Canvas paused")}</span>
      </div>
      <div
        className="chess-viewport"
        ref={view}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const v = view.current!;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: v.scrollLeft,
            top: v.scrollTop,
            moved: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current,
            v = view.current;
          if (!d || !v) return;
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) d.moved = true;
          if (d.moved) {
            v.scrollLeft = d.left + d.x - e.clientX;
            v.scrollTop = d.top + d.y - e.clientY;
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved || busy || retry) return;
          const rect = canvas.current!.getBoundingClientRect();
          const x = Math.floor((e.clientX - rect.left) / zoom),
            y = Math.floor((e.clientY - rect.top) / zoom);
          if (x >= 0 && x < 128 && y >= 0 && y < 128) setPoint({ x, y });
        }}
      >
        <div
          style={{
            width: 128 * zoom,
            height: 128 * zoom,
            position: "relative",
            flexShrink: 0,
          }}
        >
          <canvas
            ref={canvas}
            width={128}
            height={128}
            style={{
              width: "100%",
              height: "100%",
              imageRendering: "pixelated",
            }}
            aria-label={tr("Shared pixel canvas")}
          />
          <div
            className="chess-selection"
            style={{
              left: point.x * zoom,
              top: point.y * zoom,
              width: zoom,
              height: zoom,
            }}
          />
        </div>
      </div>
      <div className="chess-controls">
        <div className="chess-palette" aria-label={tr("Pixel color")}>
          {chessPalette.map((hex, i) => (
            <button
              key={hex}
              aria-label={`${i + 1}: ${hex}`}
              aria-pressed={color === i}
              disabled={busy || retry}
              onClick={() => setColor(i)}
              style={{
                background: hex,
                color:
                  i === 3 || i === 5 || i === 13 || i === 15
                    ? "white"
                    : "black",
              }}
            >
              {color === i ? "✓" : i + 1}
            </button>
          ))}
        </div>
        <div className="chess-toolbar">
          <label>
            X{" "}
            <input
              type="number"
              disabled={busy || retry}
              min={0}
              max={127}
              value={point.x}
              onChange={(e) =>
                setPoint((p) => ({
                  ...p,
                  x: Math.max(0, Math.min(127, Number(e.target.value))),
                }))
              }
            />
          </label>
          <label>
            Y{" "}
            <input
              type="number"
              disabled={busy || retry}
              min={0}
              max={127}
              value={point.y}
              onChange={(e) =>
                setPoint((p) => ({
                  ...p,
                  y: Math.max(0, Math.min(127, Number(e.target.value))),
                }))
              }
            />
          </label>
          <span>{chessPalette[color]}</span>
          <button
            disabled={
              busy || !state?.signedIn || !state.enabled || remaining > 0
            }
            onClick={() => {
              pending.current ??= {
                ...point,
                color,
                requestId: crypto.randomUUID(),
              };
              void submit(pending.current);
            }}
          >
            {busy
              ? tr("Saving…")
              : retry
                ? tr("Retry pixel")
                : tr("Confirm pixel")}
          </button>
          <output>{remaining > 0 ? `${remaining}s` : tr("Ready")}</output>
        </div>
        {!state?.signedIn && (
          <a href="/login">{tr("Sign in with osu! to continue.")}</a>
        )}
        <p role="status">{offline ? connectionError : error}</p>
        {state?.admin && (
          <details className="chess-administration">
            <summary>{tr("Canvas administration")}</summary>
            <button
              disabled={busy}
              onClick={() =>
                void submit(
                  {
                    action: "toggle",
                    enabled: !state.enabled,
                    expectedRevision: state.revision,
                  },
                  true,
                )
              }
            >
              {state.enabled ? tr("Pause canvas") : tr("Open canvas")}
            </button>
            <p>{tr("Clear a rectangle starting at the selected cell.")}</p>
            <label>
              {tr("Width")}{" "}
              <input
                type="number"
                min={1}
                max={128 - point.x}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
            </label>
            <label>
              {tr("Height")}{" "}
              <input
                type="number"
                min={1}
                max={128 - point.y}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
              />
            </label>
            <button disabled={busy} onClick={() => setClear(true)}>
              {tr("Clear region")}
            </button>
            {clear && (
              <div role="alert">
                <p>
                  {tr("This removes saved pixels in the selected rectangle.")} (
                  {point.x}, {point.y}) {width}×{height}
                </p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void submit(
                      {
                        action: "clear",
                        ...point,
                        width,
                        height,
                        expectedRevision: state.revision,
                      },
                      true,
                    )
                  }
                >
                  {tr("Confirm clear")}
                </button>
                <button onClick={() => setClear(false)}>{tr("Cancel")}</button>
              </div>
            )}
          </details>
        )}
      </div>
    </section>
  );
}
