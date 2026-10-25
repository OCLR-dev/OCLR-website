"use client";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { draftOverlayUrl } from "@/lib/overlay-url";
const subscribe = () => () => {};
const browserOrigin = () => location.origin;
const serverOrigin = () => "";
export function ObsSourceLink({
  slug,
  origin,
}: {
  slug: string;
  origin?: string;
}) {
  const tr = useAppTranslations();
  const id = useId();
  const localOrigin = useSyncExternalStore(
    subscribe,
    browserOrigin,
    serverOrigin,
  );
  const resolvedOrigin = origin || localOrigin;
  const url = resolvedOrigin ? draftOverlayUrl(resolvedOrigin, slug) : "";
  const [feedback, setFeedback] = useState("");
  const field = useRef<HTMLInputElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setFeedback(tr("URL copied."));
    } catch {
      field.current?.focus();
      field.current?.select();
      setFeedback(tr("Copy failed. Select the URL and copy it manually."));
    }
  }
  return (
    <section className="obs-source-link">
      <div className="field">
        <label htmlFor={id}>{tr("OBS Browser Source / Overlay URL")}</label>
        <div className="obs-source-controls">
          <input
            id={id}
            ref={field}
            type="text"
            value={url}
            readOnly
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            className="secondary"
            disabled={!url}
            onClick={copy}
          >
            {tr("Copy URL")}
          </button>
        </div>
      </div>
      <p className="muted small">
        {tr("Only released draft information appears in the overlay.")}
      </p>
      <p className="small obs-copy-feedback" role="status">
        {feedback}
      </p>
    </section>
  );
}
