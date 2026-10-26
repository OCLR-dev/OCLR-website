"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type { TournamentStage } from "@/lib/tournament-stages";
import "./tournament-stage-scroll.css";

type Labels = {
  title: string;
  previous: string;
  next: string;
  current: string;
  past: string;
  upcoming: string;
  planned: string;
};

export function TournamentStageScroll({
  stages,
  labels,
  id,
}: {
  stages: TournamentStage[];
  labels: Labels;
  id?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    y: number;
    top: number;
    lastY: number;
    time: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [edges, setEdges] = useState({ top: true, bottom: stages.length <= 1 });
  const current = stages.findIndex((stage) => stage.state === "current");
  const rowHeight = useCallback(() => {
    return (
      viewport.current?.querySelector<HTMLElement>("li")?.offsetHeight ?? 64
    );
  }, []);
  const measure = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    const height = rowHeight();
    element.querySelectorAll<HTMLElement>("li").forEach((row, index) => {
      const distance = (index * height - element.scrollTop) / height;
      const clamped = Math.max(-2, Math.min(2, distance));
      row.style.setProperty("--wheel-rotation", `${clamped * -40}deg`);
      row.style.setProperty(
        "--wheel-opacity",
        String(Math.max(0.25, 1 - Math.abs(distance) * 0.42)),
      );
    });
    setEdges({
      top: element.scrollTop < 2,
      bottom:
        element.scrollTop + element.clientHeight >= element.scrollHeight - 2,
    });
  }, [rowHeight]);
  function moveTo(top: number) {
    viewport.current?.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    element.scrollTop = Math.max(0, current) * rowHeight();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [current, stages.length, measure, rowHeight]);
  function scroll(direction: number) {
    const element = viewport.current;
    if (element)
      moveTo(
        (Math.round(element.scrollTop / rowHeight()) + direction) * rowHeight(),
      );
  }
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    if (event.pointerType === "touch" || event.button !== 0) return;
    drag.current = {
      id: event.pointerId,
      y: event.clientY,
      top: event.currentTarget.scrollTop,
      lastY: event.clientY,
      time: event.timeStamp,
      velocity: 0,
      moved: false,
    };
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const distance = gesture.y - event.clientY;
    if (!gesture.moved && Math.abs(distance) < 5) return;
    if (!gesture.moved) {
      gesture.moved = true;
      event.currentTarget.dataset.dragging = "true";
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    suppressClick.current = true;
    gesture.velocity =
      (gesture.lastY - event.clientY) /
      Math.max(1, event.timeStamp - gesture.time);
    gesture.lastY = event.clientY;
    gesture.time = event.timeStamp;
    event.currentTarget.scrollTop = gesture.top + distance;
  }
  function endDrag(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!gesture.moved) return;
    const velocity =
      cancelled || event.timeStamp - gesture.time > 100 ? 0 : gesture.velocity;
    const projected = Math.max(
      0,
      Math.min(
        (stages.length - 1) * rowHeight(),
        event.currentTarget.scrollTop + velocity * 100,
      ),
    );
    moveTo(Math.round(projected / rowHeight()) * rowHeight());
  }
  return (
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      className="stage-scroll"
      aria-label={labels.title}
    >
      <div className="stage-scroll-heading">
        <div className="stage-scroll-controls">
          <button
            type="button"
            onClick={() => scroll(-1)}
            disabled={edges.top}
            aria-label={labels.previous}
            aria-controls="tournament-stage-list"
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            disabled={edges.bottom}
            aria-label={labels.next}
            aria-controls="tournament-stage-list"
          >
            <span aria-hidden="true">↓</span>
          </button>
        </div>
      </div>
      <div className="stage-scroll-drum">
        <div
          className="stage-scroll-viewport"
          id="tournament-stage-list"
          ref={viewport}
          onScroll={measure}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={(event) => endDrag(event)}
          onPointerCancel={(event) => endDrag(event, true)}
          onLostPointerCapture={(event) => endDrag(event, true)}
          onDragStart={(event) => event.preventDefault()}
          onClickCapture={(event) => {
            if (suppressClick.current && event.detail !== 0) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              if (event.key === "Home") moveTo(0);
              else if (event.key === "End")
                moveTo((stages.length - 1) * rowHeight());
              else scroll(event.key === "ArrowUp" ? -1 : 1);
            }
          }}
          tabIndex={0}
          role="region"
          aria-label={labels.title}
        >
          <ol>
            {stages.map((stage, index) => (
              <li
                key={stage.id}
                className={`stage-scroll-row is-${stage.state}`}
                aria-current={stage.state === "current" ? "step" : undefined}
              >
                <div className="stage-scroll-face">
                  <span className="stage-scroll-marker" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="stage-scroll-copy">
                    <div className="stage-scroll-title">
                      <h3>{stage.label}</h3>
                      <span className="stage-scroll-status">
                        {labels[stage.state]}
                      </span>
                    </div>
                    {stage.detail && <p>{stage.detail}</p>}
                  </div>
                  <Link
                    className="stage-scroll-action"
                    onFocus={() => {
                      suppressClick.current = false;
                      moveTo(index * rowHeight());
                    }}
                    href={stage.href}
                    aria-label={`${stage.label} · ${stage.action}`}
                  >
                    <span>{stage.action}</span>
                    <span aria-hidden="true"> →</span>
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
