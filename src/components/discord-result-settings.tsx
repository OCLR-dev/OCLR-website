"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { Locale } from "@/i18n/config";
import {
  updateDiscordResultSettingsWrite,
  type DiscordResultSettings,
} from "@/lib/discord-result-contract";

export function DiscordResultSettingsForm({
  initial,
  edition,
}: {
  initial: DiscordResultSettings;
  edition: string;
}) {
  const tr = useAppTranslations();
  const help = useId();
  const [saved, setSaved] = useState(initial);
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [locale, setLocale] = useState(initial.locale);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const changed =
    Boolean(url.trim()) ||
    remove ||
    saved.enabled !== enabled ||
    saved.locale !== locale;
  const canSave =
    changed &&
    !stale &&
    (!enabled ||
      (saved.available && (saved.configured || Boolean(url.trim()))));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canSave) return;
    setBusy(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(
        updateDiscordResultSettingsWrite.path.replace(
          "{edition}",
          encodeURIComponent(edition),
        ),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: saved.revision,
            enabled,
            locale,
            webhookUrl: url,
            remove,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setStale(response.status === 409);
        setError(tr(body.error));
        return;
      }
      const next = updateDiscordResultSettingsWrite.response.parse(body);
      setSaved(next);
      setEnabled(next.enabled);
      setLocale(next.locale);
      setUrl("");
      setRemove(false);
      setFeedback(tr("Discord notification settings saved."));
    } catch {
      setError(tr("This request could not be completed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={save} aria-busy={busy}>
      <fieldset className="settings-card form-stack" disabled={busy || stale}>
        <legend>{tr("Discord result notifications")}</legend>
        <p className="muted small">
          {tr(
            "Send newly published match results to the Discord channel for this tournament.",
          )}
        </p>
        {!saved.available && (
          <p className="notice">
            {tr(
              "Ask a site operator to configure Discord result notification storage.",
            )}
          </p>
        )}
        <label className="field">
          <span>{tr("Discord webhook URL")}</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            maxLength={512}
            disabled={!saved.available || remove}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-describedby={help}
          />
        </label>
        <small id={help} className="muted">
          {saved.configured
            ? tr("A webhook is configured. Leave the field blank to keep it.")
            : tr("Paste the webhook URL from the Discord channel settings.")}
        </small>
        <label className="field">
          <span>{tr("Discord message language")}</span>
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
          >
            <option value="zh-Hans">简体中文</option>
            <option value="zh-Hant">繁體中文</option>
            <option value="en">{tr("English")}</option>
          </select>
        </label>
        <label className="actions">
          <input
            type="checkbox"
            checked={enabled}
            disabled={remove || (!saved.available && !enabled)}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          {tr("Enable Discord result notifications")}
        </label>
        {saved.configured && (
          <label className="actions">
            <input
              type="checkbox"
              checked={remove}
              onChange={(event) => {
                const removing = event.target.checked;
                setRemove(removing);
                if (removing) {
                  setEnabled(false);
                  setUrl("");
                }
              }}
            />
            {tr("Remove the saved webhook")}
          </label>
        )}
        <div className="actions">
          <button type="submit" disabled={!canSave}>
            {busy ? tr("Saving…") : tr("Save")}
          </button>
        </div>
      </fieldset>
      {saved.recent.length > 0 && (
        <section className="notice form-stack">
          <h3>{tr("Recent Discord deliveries")}</h3>
          {saved.attentionCount > 0 && (
            <p>
              {tr("{count} Discord deliveries need review", {
                count: saved.attentionCount,
              })}
            </p>
          )}
          <ul>
            {saved.recent.map((delivery, index) => (
              <li key={`${delivery.fixtureId}-${index}`}>
                <Link
                  href={`/admin/tournaments/${edition}/matches/${delivery.fixtureId}`}
                >
                  {delivery.fixtureLabel}
                </Link>
                {" · "}
                {tr(`discord_delivery_${delivery.status}`)}
                {delivery.failure && (
                  <p>{tr(`discord_failure_${delivery.failure}`)}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {feedback && (
        <p role="status" className="notice">
          {feedback}
        </p>
      )}
      {error && (
        <div role="alert" className="notice error-text">
          <p>{error}</p>
          {stale && (
            <button
              className="secondary"
              type="button"
              onClick={() => window.location.reload()}
            >
              {tr("Refresh")}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
