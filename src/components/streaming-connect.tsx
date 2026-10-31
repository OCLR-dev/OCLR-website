"use client";
import { useEffect, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
export function StreamingConnect({
  edition,
  origin,
  state,
}: {
  edition: string;
  origin: string;
  state: string;
}) {
  const tr = useAppTranslations();
  const [available, setAvailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const opener = window.opener;
    if (!opener) return;
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== origin ||
        event.source !== opener ||
        event.data?.state !== state
      )
        return;
      if (event.data.type === "oclr-streaming-hello") setAvailable(true);
      if (event.data.type === "oclr-streaming-connected") {
        clearTimeout(timer.current);
        setToken("");
        setPending(false);
        setDone(true);
        window.close();
      }
    };
    window.addEventListener("message", receive);
    opener.postMessage(
      { type: "oclr-streaming-ready", state, edition },
      origin,
    );
    return () => {
      window.removeEventListener("message", receive);
      clearTimeout(timer.current);
    };
  }, [edition, origin, state]);
  async function authorize() {
    if (pending || !available) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/streaming/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionSlug: edition, origin }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Connection failed. Please try again.",
        );
      setToken(result.token);
      window.opener?.postMessage(
        { type: "oclr-streaming-token", state, edition, token: result.token },
        origin,
      );
      timer.current = setTimeout(() => {
        setPending(false);
        setError(
          tr(
            "The console did not confirm the connection. Copy the token or start again from the console.",
          ),
        );
      }, 20000);
    } catch {
      setPending(false);
      setError(tr("Connection failed. Please try again."));
    }
  }
  return (
    <section className="panel form-stack">
      <p>
        <strong>{edition}</strong> · <code>{origin}</code>
      </p>
      <p>
        {tr(
          "Authorize this streaming console to read your assigned matches. Your match records will not be changed.",
        )}
      </p>
      <button
        disabled={!available || pending || done || !!token}
        onClick={() => void authorize()}
      >
        {tr("Authorize and connect Overlay")}
      </button>
      {!available && (
        <p role="status">
          {tr(
            "Start the connection from the streaming console. Manual token copying remains available.",
          )}
        </p>
      )}
      {pending && (
        <p role="status">{tr("Connecting to your streaming console…")}</p>
      )}
      {done && (
        <p role="status">
          {tr("Connected. Return to your streaming console.")}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {token && !done && (
        <details>
          <summary>{tr("Copy token manually")}</summary>
          <label className="field">
            {tr("New API token")}
            <textarea
              readOnly
              value={token}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </details>
      )}
      <a href={`/streaming/${edition}`}>{tr("Streaming API access")}</a>
    </section>
  );
}
