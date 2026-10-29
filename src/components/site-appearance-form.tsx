"use client";
import { ReadOnlyFields } from "./staff-read-only";
import { appearanceLabel } from "@/i18n/appearance";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import {
  publicAppearances,
  readSiteAppearance,
  type Appearance,
  type PublicAppearance,
} from "@/lib/preferences";

export function SiteAppearanceForm({
  initialAppearance,
  revision,
}: {
  initialAppearance: Appearance;
  revision: number;
}) {
  const tr = useAppTranslations();
  const router = useRouter();
  const [appearance, setAppearance] = useState(
    readSiteAppearance(initialAppearance),
  );
  const [saved, setSaved] = useState({
    appearance: initialAppearance,
    revision,
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultAppearance: appearance,
          expectedRevision: saved.revision,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(tr(body.error));
        return;
      }
      setSaved({ appearance: body.defaultAppearance, revision: body.revision });
      setFeedback(tr("Website appearance saved."));
      router.refresh();
    } catch {
      setError(tr("This request could not be completed. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ReadOnlyFields>
      <form className="form-stack" onSubmit={save} aria-busy={busy}>
        <fieldset className="settings-card form-stack" disabled={busy}>
          <legend>{tr("Default website appearance")}</legend>
          <p className="muted" id="site-appearance-description">
            {tr(
              "Used when no tournament default is configured. Explicit visitor appearance and light/dark preferences remain independent.",
            )}
          </p>
          <p className="muted small">
            {tr(
              "Season themes can only be configured for individual tournaments.",
            )}
          </p>
          <label className="field">
            <span>{tr("Design")}</span>
            <select
              aria-label={tr("Design")}
              value={appearance}
              onChange={(event) =>
                setAppearance(event.target.value as PublicAppearance)
              }
              aria-describedby="site-appearance-description"
            >
              {publicAppearances.map((value) => (
                <option key={value} value={value}>
                  {appearanceLabel(value, tr)}
                </option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button
              type="submit"
              disabled={busy || appearance === saved.appearance}
            >
              {busy ? tr("Saving…") : tr("Save")}
            </button>
          </div>
        </fieldset>
        {feedback && (
          <p role="status" className="notice">
            {feedback}
          </p>
        )}
        {error && (
          <div role="alert" className="notice error-text">
            <p>{error}</p>
            <button
              type="button"
              className="secondary"
              onClick={() => window.location.reload()}
            >
              {tr("Refresh")}
            </button>
          </div>
        )}
      </form>
    </ReadOnlyFields>
  );
}
