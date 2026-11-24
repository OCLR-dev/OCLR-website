"use client";

import { ApiAccessHistory } from "./api-access-history";

import { ApiAccessForm } from "./api-access-form";
import styles from "./api-access-form.module.css";
import { LoadingRegion } from "./loading-region";

import { useState, type FormEvent } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  streamingOriginAllowed,
  type StreamingOrigins,
} from "@/lib/streaming-origin-model";
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
  initialOrigin,
  initialTokens,
}: {
  editionSlug: string;
  backend: string;
  origins: StreamingOrigins;
  initialOrigin?: string;
  initialTokens: StreamingTokenMetadata[];
}) {
  const tr = useAppTranslations();
  const [origin, setOrigin] = useState(
    initialOrigin ?? origins?.[0] ?? "http://127.0.0.1:3001",
  );
  const [tokens, setTokens] = useState(initialTokens);
  const [issued, setIssued] = useState<{ id: string; token: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const labels: Record<StreamingApiScope, string> = {
    "streaming:read": tr("Streaming API access"),
  };
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !streamingOriginAllowed(origin, origins)) return;
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
      <ApiAccessForm
        backend={backend}
        editionSlug={editionSlug}
        onSubmit={create}
        description={
          <>
            <p>
              {tr(
                "Only your next assigned fixture, its published mappool and stage are available.",
              )}
            </p>
            <p>
              {tr(
                "Access stays active while used. It ends after one hour without a successful streaming read, or when this login session ends.",
              )}
            </p>
          </>
        }
      >
        <div className={styles.controls}>
          <label className="field">
            {tr("Local origin")}
            {origins === null ? (
              <input
                type="url"
                value={origin}
                onChange={(event) => {
                  setOrigin(event.target.value);
                  setIssued(null);
                }}
                disabled={pending}
                required
                maxLength={200}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="streaming-origin-help"
              />
            ) : (
              <select
                aria-describedby="streaming-origin-help"
                value={origin}
                onChange={(event) => {
                  setOrigin(event.target.value);
                  setIssued(null);
                }}
                disabled={pending}
                required
              >
                {[
                  ...new Set([
                    ...(streamingOriginAllowed(origin, origins)
                      ? [origin]
                      : []),
                    ...origins,
                  ]),
                ].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            )}
          </label>
          <button
            disabled={pending || !streamingOriginAllowed(origin, origins)}
            aria-busy={pending && activeAction === "create"}
          >
            {tr("Create token")}
          </button>
        </div>
        <p className="muted" id="streaming-origin-help">
          {tr(
            "Enter the console address including its port, without a path or trailing slash. If the protocol or port changes, create new access. localhost and 127.0.0.1 share access on the same protocol and port.",
          )}
        </p>
        {origin && !streamingOriginAllowed(origin, origins) && (
          <p role="alert" className="notice error-text">
            {tr("Choose a valid local origin and read scopes.")}
          </p>
        )}
      </ApiAccessForm>
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
      <ApiAccessHistory
        entries={tokens.map((entry) => ({
          id: entry.id,
          title: entry.origin,
          scopeText: entry.scopes.map((scope) => labels[scope]).join(" · "),
          expiresAt: entry.expiresAt,
          revokedAt: entry.revokedAt,
        }))}
        emptyMessage={tr("No streaming API access has been created.")}
        expiryText={(date) => tr("Idle access ends {date}", { date })}
        pending={pending}
        activeAction={activeAction}
        onRevoke={revoke}
      />
    </div>
  );
}
