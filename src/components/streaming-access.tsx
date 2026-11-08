"use client";

import { InfoNote } from "@/components/info-note";

import { LoadingRegion } from "./loading-region";

import { useState, type FormEvent } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  type StreamingApiScope,
  type StreamingTokenMetadata,
} from "@/lib/streaming-api-model";
import {
  createStreamingAccessWrite,
  revokeStreamingAccessWrite,
  type CreateStreamingAccessInput,
} from "@/lib/streaming-write-contract";

export function StreamingAccess({
  editionSlug,
  backend,
  origins,
  initialTokens,
}: {
  editionSlug: string;
  backend: string;
  origins: string[];
  initialTokens: StreamingTokenMetadata[];
}) {
  const tr = useAppTranslations();
  const [origin, setOrigin] = useState(origins[0] ?? "");
  const [tokens, setTokens] = useState(initialTokens);
  const [issued, setIssued] = useState<{ id: string; token: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [openedAt] = useState(Date.now);
  const labels: Record<StreamingApiScope, string> = {
    "streaming:read": tr("Streaming API access"),
  };
  const date = (value: string) =>
    new Intl.DateTimeFormat(tr.locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setActiveAction("create");
    setPending(true);
    setError("");
    setIssued(null);
    try {
      const input: CreateStreamingAccessInput = { origin, editionSlug };
      const response = await fetch(createStreamingAccessWrite.path, {
        method: createStreamingAccessWrite.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(createStreamingAccessWrite.error.parse(body).error);
        return;
      }
      const result = createStreamingAccessWrite.response.parse(body);
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
      const response = await fetch(
        revokeStreamingAccessWrite.path.replace("{tokenId}", id),
        {
          method: revokeStreamingAccessWrite.method,
          cache: "no-store",
        },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(revokeStreamingAccessWrite.error.parse(body).error);
        return;
      }
      const result = revokeStreamingAccessWrite.response.parse(body);
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
            "Access stays active while used. It ends after one hour without a successful streaming read, or when this login session ends.",
          )}
        </p>
        <p>
          <strong>{tr("Backend")}</strong> <code>{backend}</code> ·{" "}
          <strong>{editionSlug}</strong>
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
          <p className="muted">
            {tr(
              "Only your next assigned fixture, its published mappool and stage are available.",
            )}
          </p>
          <div className="actions">
            <button
              disabled={pending || !origin}
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
                  <strong>{entry.origin}</strong>
                </p>
                <p className="muted small">
                  {tr("Idle access ends {date}", {
                    date: date(entry.expiresAt),
                  })}
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
            {tr("No streaming API access has been created.")}
          </p>
        )}
      </section>
    </div>
  );
}
