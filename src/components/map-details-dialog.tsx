"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { BeatmapCover } from "./beatmap-cover";
import { BeatmapActions } from "./beatmap-actions";

export function MapDetailsDialog({
  context,
  title,
  artist,
  subtitle,
  beatmapId,
  setId,
  children,
  previous,
  next,
  onPrevious,
  onNext,
  onClose,
  permalink,
}: {
  context: string;
  title: string;
  artist?: string;
  subtitle?: ReactNode;
  beatmapId: number | null | undefined;
  setId: number | null | undefined;
  children: ReactNode;
  previous: boolean;
  next: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  permalink?: ReactNode;
}) {
  const tr = useAppTranslations();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const node = dialog.current!;
    const trigger = document.activeElement;
    node.showModal();
    return () => {
      node.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="map-dialog"
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <span className="eyebrow">{context}</span>
        <button
          className="secondary"
          type="button"
          onClick={onClose}
          aria-label={tr("Close map details")}
        >
          {tr("Close")}
        </button>
      </header>
      <div className="map-dialog-body">
        <div className="map-detail-identity">
          <BeatmapCover setId={setId} />
          <div>
            {artist && <p className="map-detail-artist muted">{artist}</p>}
            <h2 id={heading}>{title}</h2>
            {subtitle && (
              <div className="map-detail-subtitle muted">{subtitle}</div>
            )}
          </div>
        </div>
        {children}
        <BeatmapActions beatmapId={beatmapId} setId={setId} />
        {permalink}
      </div>
      <footer className="map-dialog-navigation">
        <button
          className="secondary"
          type="button"
          disabled={!previous}
          onClick={onPrevious}
        >
          {tr("Previous map")}
        </button>
        <button
          className="secondary"
          type="button"
          disabled={!next}
          onClick={onNext}
        >
          {tr("Next map")}
        </button>
      </footer>
    </dialog>
  );
}
