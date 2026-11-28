"use client";

import { useId, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { MappoolActionIcon } from "./mappool-action-icon";
import { MappoolReplayDialog } from "./mappool-replay-dialog";
import { MappoolReplayPlayer } from "./mappool-replay-player";

export function PublicMappoolReplayButton({
  assetsUrl,
  beatmapMd5,
  slot,
  title,
  difficulty,
}: {
  assetsUrl: string;
  beatmapMd5: string;
  slot: string;
  title: string;
  difficulty: string;
}) {
  const tr = useAppTranslations();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={trigger}
        className="button secondary mappool-icon-action"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${tr("Open replay player")} · ${slot}`}
        title={tr("Open replay player")}
        onClick={() => setOpen(true)}
      >
        <MappoolActionIcon kind="play" />
      </button>
      {open && (
        <MappoolReplayDialog
          id={id}
          slot={slot}
          map={`${title} · ${difficulty}`}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        >
          <MappoolReplayPlayer
            replayUrl={`${assetsUrl}/replay.osr`}
            assetsUrl={assetsUrl}
            beatmapMd5={beatmapMd5}
            filename={title}
          />
        </MappoolReplayDialog>
      )}
    </>
  );
}
