"use client";

import { useState, type FormEvent } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  chatPromptLimit,
  maximumChatOutputTokens,
  updateChatPromptWrite,
} from "@/lib/chat-prompt-contract";

type ChatPrompt = { prompt: string; maxOutputTokens: number; revision: number };

export function SiteChatPromptForm({ initial }: { initial: ChatPrompt }) {
  const tr = useAppTranslations();
  const [saved, setSaved] = useState(initial);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [tokens, setTokens] = useState(String(initial.maxOutputTokens));
  const maxOutputTokens = Number(tokens);
  const changed =
    prompt.trim() !== saved.prompt || maxOutputTokens !== saved.maxOutputTokens;
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || stale || !changed) return;
    setBusy(true);
    setFeedback("");
    setError("");
    try {
      const response = await fetch(updateChatPromptWrite.path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          maxOutputTokens,
          expectedRevision: saved.revision,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setStale(response.status === 409);
        setError(tr(body.error));
        return;
      }
      const next = updateChatPromptWrite.response
        .required({ maxOutputTokens: true })
        .parse(body);
      setSaved(next);
      setPrompt(next.prompt);
      setTokens(String(next.maxOutputTokens));
      setFeedback(tr("Liru chat settings saved."));
    } catch {
      setError(tr("This request could not be completed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={save} aria-busy={busy}>
      <fieldset className="settings-card form-stack" disabled={busy}>
        <legend>{tr("Liru chat settings")}</legend>
        <label className="field">
          <span>{tr("Custom prompt")}</span>
          <textarea
            rows={6}
            maxLength={chatPromptLimit}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            aria-describedby="liru-prompt-help"
          />
        </label>
        <small id="liru-prompt-help">
          {tr(
            "Adjust the tone and format of Liru’s replies. Leave blank to use the built-in settings. Keep passwords, API keys and private information out of this field.",
          )}
        </small>
        <label className="field">
          <span>{tr("Output limit per reply (tokens)")}</span>
          <input
            type="number"
            min={1}
            max={maximumChatOutputTokens}
            step={1}
            required
            value={tokens}
            aria-describedby="liru-output-help"
            onChange={(event) => setTokens(event.target.value)}
          />
        </label>
        <small id="liru-output-help">
          {tr(
            "Choose 1 to 16,384. The default is 2,048. Changes apply to the next question. Choose a limit supported by your model.",
          )}
        </small>
        <div className="actions">
          <button type="submit" disabled={stale || !changed}>
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
