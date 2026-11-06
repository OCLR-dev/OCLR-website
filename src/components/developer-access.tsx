"use client";

import { InfoNote } from "@/components/info-note";

import { LoadingRegion } from "./loading-region";

import { useState, type FormEvent } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  developerApiScopes,
  isDeveloperPort,
  maxDeveloperPorts,
  type DeveloperApiScope,
  type DeveloperTokenMetadata,
} from "@/lib/developer-api-model";

export function DeveloperAccess({
  backend,
  allowedPorts,
  initialTokens,
}: {
  backend: string;
  allowedPorts: number[] | null;
  initialTokens: DeveloperTokenMetadata[];
}) {
  const tr = useAppTranslations();
  const [ports, setPorts] = useState<number[]>(
    allowedPorts === null ? [3000] : allowedPorts.slice(0, 1),
  );
  const [portInput, setPortInput] = useState("");
  const [portError, setPortError] = useState("");
  const [scopes, setScopes] = useState<DeveloperApiScope[]>([
    ...developerApiScopes,
  ]);
  const [tokens, setTokens] = useState(initialTokens);
  const [issued, setIssued] = useState<{ id: string; token: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
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
  function addPort() {
    const value = portInput.trim();
    const port = Number(value);
    if (!/^[0-9]{1,5}$/.test(value) || !isDeveloperPort(port)) {
      setPortError(tr("Enter a port between 1 and 65535."));
      return;
    }
    if (ports.includes(port)) {
      setPortError(tr("This port is already in the list."));
      return;
    }
    if (allowedPorts !== null && !allowedPorts.includes(port)) {
      setPortError(tr("This port is not allowed by the server."));
      return;
    }
    if (ports.length >= maxDeveloperPorts) {
      setPortError(tr("You can add up to 20 local ports."));
      return;
    }
    setPorts((previous) => [...previous, port]);
    setPortInput("");
    setPortError("");
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !ports.length) return;
    if (portInput.trim()) {
      setPortError(
        tr("Add the entered port to the list before creating a token."),
      );
      return;
    }
    setActiveAction("create");
    setPending(true);
    setError("");
    setIssued(null);
    try {
      const response = await fetch("/api/developer/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ports, scopes }),
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
    if (pending) return;
    setActiveAction(id);
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
      {pending && <LoadingRegion />}
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
          <fieldset
            className="developer-ports"
            disabled={pending || allowedPorts?.length === 0}
          >
            <legend>{tr("Allowed local ports")}</legend>
            <p id="developer-ports-help" className="muted small">
              {tr(
                "Add the ports used by your local frontends. One token can serve multiple development sessions.",
              )}
            </p>
            <p className="muted small">
              {tr(
                "localhost, 127.0.0.1 and [::1] share the same port list for HTTP and HTTPS.",
              )}
            </p>
            {allowedPorts !== null && (
              <p className="small">
                {allowedPorts.length
                  ? tr("Server-allowed ports: {ports}", {
                      ports: allowedPorts.join(", "),
                    })
                  : tr("The server has disabled local developer access.")}
              </p>
            )}
            <div className="developer-port-entry">
              <label className="field" htmlFor="developer-port-input">
                {tr("Add local port")}
                <input
                  id="developer-port-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="5173"
                  value={portInput}
                  aria-describedby={`developer-ports-help${portError ? " developer-port-error" : ""}`}
                  aria-invalid={Boolean(portError)}
                  onChange={(event) => {
                    setPortInput(event.target.value);
                    setPortError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addPort();
                    }
                  }}
                />
              </label>
              <button type="button" className="secondary" onClick={addPort}>
                {tr("Add port")}
              </button>
            </div>
            {portError && (
              <p
                id="developer-port-error"
                className="error-text small"
                role="alert"
              >
                {portError}
              </p>
            )}
            {ports.length ? (
              <ul
                className="developer-port-list"
                aria-label={tr("Allowed local ports")}
              >
                {ports.map((port) => (
                  <li key={port}>
                    <code>{port}</code>
                    <button
                      type="button"
                      className="secondary"
                      aria-label={tr("Remove port {port}", { port })}
                      onClick={() => {
                        setPorts((previous) =>
                          previous.filter((value) => value !== port),
                        );
                        setPortError("");
                      }}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">
                {tr("Add at least one local port.")}
              </p>
            )}
            <p className="muted small">
              {tr("You can add up to 20 local ports.")}
            </p>
          </fieldset>
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
            <button
              disabled={
                pending ||
                !ports.length ||
                !scopes.length ||
                Boolean(portInput.trim())
              }
              aria-busy={pending && activeAction === "create"}
            >
              {tr("Create token")}
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
        <InfoNote>
          <p className="muted small">
            {tr("Up to 50 recent entries are shown. Times are in UTC.")}
          </p>
        </InfoNote>
        {tokens.length ? (
          <div className="stack">
            {tokens.map((entry) => (
              <article className="panel" key={entry.id}>
                <p>
                  <strong>{tr("Allowed local ports")}</strong>{" "}
                  <span className="developer-port-values">
                    {entry.ports.join(" · ")}
                  </span>
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
                    aria-busy={pending && activeAction === entry.id}
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
