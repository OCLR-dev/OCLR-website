"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import { contributionDescriptionOptions } from "@/i18n/contributor-descriptions";
import type { Contributor } from "@/lib/contributor-model";
import type { UpdateContributorsInput } from "@/lib/staff-administration-write-contracts";
import type { ExplicitReadData } from "@/lib/explicit-read-contracts";
import { ReadOnlyFields } from "./staff-read-only";
import { Avatar } from "./avatar";
import { CountryFlag } from "./country-flag";
type Draft = Omit<Contributor, "osuId"> & { osuId: string };
export function ContributorManager({
  initial,
}: {
  initial: ExplicitReadData<"contributorsForAdmin">;
}) {
  const tr = useAppTranslations();
  const descriptionOptions = contributionDescriptionOptions(tr);
  const router = useRouter();
  const countries = new Map(
    initial.entries.map(({ osuId, countryCode }) => [osuId, countryCode]),
  );
  const editable = (directory: typeof initial) => ({
    revision: directory.revision,
    entries: directory.entries.map(
      ({ id, name, osuId, published, description }) => ({
        id,
        name,
        osuId,
        published,
        description,
      }),
    ),
  });
  const drafts = (entries: Contributor[]): Draft[] =>
    entries.map((entry) => ({ ...entry, osuId: String(entry.osuId) }));
  const [saved, setSaved] = useState(() => editable(initial));
  const [entries, setEntries] = useState(() => drafts(saved.entries));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const values = entries.map((entry) => ({
    ...entry,
    osuId: Number(entry.osuId),
  }));
  const changed = JSON.stringify(values) !== JSON.stringify(saved.entries);
  const savedDescriptions = new Map(
    saved.entries.map(({ id, description }) => [id, description]),
  );
  function descriptionChoices(id: string) {
    const savedDescription = savedDescriptions.get(id);
    return savedDescription && !descriptionOptions.has(savedDescription)
      ? ([[savedDescription, savedDescription], ...descriptionOptions] as const)
      : descriptionOptions;
  }
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
        } satisfies UpdateContributorsInput),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(tr(body.error));
        return;
      }
      const directory = editable(body as typeof initial);
      setSaved(directory);
      setEntries(drafts(directory.entries));
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
        <p className="muted contributor-intro">
          {tr(
            "Changes take effect only when you save. Public entries appear on About. Contributor entries do not grant staff access.",
          )}
        </p>
        <fieldset className="contributor-list" disabled={busy}>
          <legend className="sr-only">{tr("Contributors")}</legend>
          {entries.length === 0 && (
            <p className="muted">{tr("No contributors")}</p>
          )}
          {entries.map((entry, index) => (
            <fieldset className="settings-card contributor-row" key={entry.id}>
              <legend className="sr-only">
                {tr("Contributor {number}", { number: index + 1 })}
              </legend>
              <div className="contributor-avatar">
                {/^[1-9]\d*$/.test(entry.osuId) &&
                  Number.isSafeInteger(Number(entry.osuId)) && (
                    <>
                      <span aria-hidden="true">
                        <Avatar
                          osuId={Number(entry.osuId)}
                          username={entry.name}
                        />
                      </span>
                      <CountryFlag
                        code={countries.get(Number(entry.osuId))}
                        size="small"
                      />
                    </>
                  )}
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
                <label className="field contributor-description-field">
                  <span>{tr("Contribution description")}</span>
                  <select
                    value={entry.description ?? ""}
                    onChange={(event) =>
                      edit(entry.id, {
                        description: event.target.value || undefined,
                      })
                    }
                  >
                    <option value="">{tr("None")}</option>
                    {Array.from(
                      descriptionChoices(entry.id),
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <div className="contributor-row-footer">
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
                <div className="actions contributor-row-actions">
                  <button
                    className="secondary contributor-move"
                    type="button"
                    disabled={index === 0}
                    aria-label={tr("Move contributor {number} up", {
                      number: index + 1,
                    })}
                    title={tr("Move up")}
                    onClick={() => move(index, -1)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="m6 12 6-6 6 6M12 6v12" />
                    </svg>
                  </button>
                  <button
                    className="secondary contributor-move"
                    type="button"
                    disabled={index === entries.length - 1}
                    aria-label={tr("Move contributor {number} down", {
                      number: index + 1,
                    })}
                    title={tr("Move down")}
                    onClick={() => move(index, 1)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="m6 12 6 6 6-6M12 6v12" />
                    </svg>
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
              </div>
            </fieldset>
          ))}
          <div className="actions contributor-toolbar">
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
            {changed && !busy && (
              <span className="muted" role="status">
                {tr("Unsaved changes")}
              </span>
            )}
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
