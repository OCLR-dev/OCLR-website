"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import type { Contributor } from "@/lib/contributor-model";
import { ReadOnlyFields } from "./staff-read-only";
import { Avatar } from "./avatar";
type Draft = Omit<Contributor, "osuId"> & { osuId: string };
export function ContributorManager({
  initial,
}: {
  initial: { entries: Contributor[]; revision: number };
}) {
  const tr = useAppTranslations();
  const router = useRouter();
  const drafts = (entries: Contributor[]): Draft[] =>
    entries.map((entry) => ({ ...entry, osuId: String(entry.osuId) }));
  const [entries, setEntries] = useState(() => drafts(initial.entries));
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const values = entries.map((entry) => ({
    ...entry,
    osuId: Number(entry.osuId),
  }));
  const changed = JSON.stringify(values) !== JSON.stringify(saved.entries);
  function edit(id: string, patch: Partial<Draft>) {
    setEntries((rows) =>
      rows.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
    setFeedback("");
  }
  function move(index: number, direction: number) {
    setEntries((rows) => {
      const next = [...rows];
      [next[index], next[index + direction]] = [
        next[index + direction],
        next[index],
      ];
      return next;
    });
    setFeedback("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/admin/contributors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: values,
          expectedRevision: saved.revision,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(tr(body.error));
        return;
      }
      setSaved(body);
      setEntries(drafts(body.entries));
      setFeedback(tr("Contributors saved."));
      router.refresh();
    } catch {
      setError(tr("This request could not be completed. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ReadOnlyFields>
      <form
        className="form-stack contributor-manager"
        onSubmit={save}
        aria-busy={busy}
      >
        <p className="muted">
          {tr(
            "Changes take effect only when you save. Public entries appear on About. Contributor entries do not grant staff access.",
          )}
        </p>
        <fieldset className="form-stack" disabled={busy}>
          <legend className="sr-only">{tr("Contributors")}</legend>
          {entries.length === 0 && (
            <p className="muted">{tr("No contributors")}</p>
          )}
          {entries.map((entry, index) => (
            <fieldset className="settings-card form-stack" key={entry.id}>
              <legend>
                {tr("Contributor {number}", { number: index + 1 })}
              </legend>
              <div className="contributor-identity">
                {/^[1-9]\d*$/.test(entry.osuId) &&
                  Number.isSafeInteger(Number(entry.osuId)) && (
                    <Avatar osuId={Number(entry.osuId)} username={entry.name} />
                  )}
                <strong>{entry.name || tr("New contributor")}</strong>
                <span className="badge">
                  {entry.published ? tr("Public") : tr("Hidden from About")}
                </span>
              </div>
              <div className="contributor-fields">
                <label className="field">
                  <span>{tr("Display name")}</span>
                  <input
                    required
                    maxLength={80}
                    value={entry.name}
                    onChange={(event) =>
                      edit(entry.id, { name: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>{tr("osu! user ID")}</span>
                  <input
                    required
                    inputMode="numeric"
                    pattern="[1-9][0-9]*"
                    maxLength={16}
                    value={entry.osuId}
                    onChange={(event) =>
                      edit(entry.id, { osuId: event.target.value })
                    }
                  />
                </label>
              </div>
              <label className="contributor-public">
                <input
                  type="checkbox"
                  checked={entry.published}
                  onChange={(event) =>
                    edit(entry.id, { published: event.target.checked })
                  }
                />
                <span>{tr("Show on About")}</span>
              </label>
              <div className="actions">
                <button
                  className="secondary"
                  type="button"
                  disabled={index === 0}
                  aria-label={tr("Move contributor {number} up", {
                    number: index + 1,
                  })}
                  onClick={() => move(index, -1)}
                >
                  {tr("Move up")}
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={index === entries.length - 1}
                  aria-label={tr("Move contributor {number} down", {
                    number: index + 1,
                  })}
                  onClick={() => move(index, 1)}
                >
                  {tr("Move down")}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setEntries((rows) =>
                      rows.filter((row) => row.id !== entry.id),
                    );
                    setFeedback("");
                  }}
                >
                  {tr("Remove")}
                </button>
              </div>
            </fieldset>
          ))}
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={entries.length >= 100}
              onClick={() => {
                setEntries((rows) => [
                  ...rows,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    osuId: "",
                    published: false,
                  },
                ]);
                setFeedback("");
              }}
            >
              {tr("Add contributor")}
            </button>
            <button type="submit" disabled={!changed || busy}>
              {busy ? tr("Saving…") : tr("Save contributors")}
            </button>
          </div>
        </fieldset>
        {feedback && (
          <p className="notice" role="status">
            {feedback}
          </p>
        )}
        {error && (
          <div className="notice error-text" role="alert">
            <p>{error}</p>
            <button
              className="secondary"
              type="button"
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
