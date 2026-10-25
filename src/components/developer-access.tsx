"use client";

import { useState, type FormEvent } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  developerApiScopes,
  type DeveloperApiScope,
  type DeveloperTokenMetadata,
} from "@/lib/developer-api-model";

export function DeveloperAccess({
  backend,
  origins,
  initialTokens,
}: {
  backend: string;
  origins: string[];
  initialTokens: DeveloperTokenMetadata[];
}) {
  const tr = useAppTranslations();
  const [origin, setOrigin] = useState(origins[0] ?? "");
  const [scopes, setScopes] = useState<DeveloperApiScope[]>([
    ...developerApiScopes,
  ]);
  const [tokens, setTokens] = useState(initialTokens);
  const [issued, setIssued] = useState<{ id: string; token: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [openedAt] = useState(Date.now);
  const labels: Record<DeveloperApiScope, string> = {
    "identity:read": tr("Your API identity"),
    "tournaments:read": tr("Public tournament information"),
    "tournaments:private:read": tr("Private tournament information"),
    "profiles:read": tr("Saved osu! profiles"),
  };
  const date = (value: string) =>
    new Intl.DateTimeFormat(tr.locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setIssued(null);
    try {
      const response = await fetch("/api/developer/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, scopes }),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        return;
      }
      setTokens((previous) => [result.access, ...previous]);
      setIssued({ id: result.access.id, token: result.token });
    } catch {
      setError(
        "Connection interrupted. Refresh to check the saved state before retrying.",
      );
    } finally {
      setPending(false);
    }
  }
  async function revoke(id: string) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/developer/tokens/${id}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        return;
      }
      setTokens((previous) =>
        previous.map((entry) => (entry.id === id ? result : entry)),
      );
      if (issued?.id === id) setIssued(null);
    } catch {
      setError(
        "Connection interrupted. Refresh to check the saved state before retrying.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="stack developer-access">
      <section aria-labelledby="developer-create">
        <h2 id="developer-create">{tr("Create read-only access")}</h2>
        <p className="muted">
          {tr(
            "Use this backend from your local frontend. Access ends within one hour or when this login session ends.",
          )}
        </p>
        <p>
          <strong>{tr("Backend")}</strong> <code>{backend}</code>
        </p>
        <p className="notice">
          {tr(
            "This token can only read data, even if your account has other roles.",
          )}
        </p>
        <p>
          <a className="context-link" href="/api/v1/openapi.json">
            {tr("View API specification")}
          </a>
        </p>
        <form className="form-stack" onSubmit={create}>
          <label className="field">
            {tr("Local origin")}
            <select
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
              disabled={pending}
              required
            >
              {origins.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>{tr("Read scopes")}</legend>
            <div className="stack">
              {developerApiScopes.map((scope) => (
                <label key={scope} className="check-field">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    disabled={pending}
                    onChange={(event) =>
                      setScopes((previous) =>
                        event.target.checked
                          ? [...previous, scope]
                          : previous.filter((value) => value !== scope),
                      )
                    }
                  />
                  <span>
                    {labels[scope]} <code>{scope}</code>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="muted small">
            {tr(
              "Private data requires an active Developer grant. Use the API specification to choose a resource and its read scope.",
            )}
          </p>
          <div className="actions">
            <button disabled={pending || !origin || !scopes.length}>
              {pending ? tr("Saving…") : tr("Create token")}
            </button>
          </div>
        </form>
      </section>
      {error && (
        <p className="notice error-text" role="alert">
          {tr(error)}
        </p>
      )}
      {issued && (
        <section
          className="notice"
          role="status"
          aria-labelledby="developer-issued"
        >
          <h2 id="developer-issued">{tr("Copy your token now")}</h2>
          <p>
            {tr(
              "It is shown only once. Keep it private and out of source code, URLs and screenshots.",
            )}
          </p>
          <label className="field">
            {tr("New API token")}
            <textarea
              readOnly
              value={issued.token}
              rows={3}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setIssued(null)}
            >
              {tr("Hide token")}
            </button>
          </div>
        </section>
      )}
      <section aria-labelledby="developer-existing">
        <h2 id="developer-existing">{tr("Your API access")}</h2>
        <p className="muted small">
          {tr("Up to 50 recent entries are shown. Times are in UTC.")}
        </p>
        {tokens.length ? (
          <div className="stack">
            {tokens.map((entry) => (
              <article className="panel" key={entry.id}>
                <p>
                  <strong>{entry.origin}</strong>
                </p>
                <p className="muted small">
                  {tr("Expires {date}", { date: date(entry.expiresAt) })}
                </p>
                <p className="small">
                  {entry.scopes.map((scope) => labels[scope]).join(" · ")}
                </p>
                {entry.revokedAt ? (
                  <p>{tr("Revoked")}</p>
                ) : new Date(entry.expiresAt).getTime() <= openedAt ? (
                  <p>{tr("Expired")}</p>
                ) : (
                  <button
                    className="secondary"
                    type="button"
                    disabled={pending}
                    onClick={() => void revoke(entry.id)}
                  >
                    {tr("Revoke token")}
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">
            {tr("No developer API access has been created.")}
          </p>
        )}
      </section>
    </div>
  );
}
