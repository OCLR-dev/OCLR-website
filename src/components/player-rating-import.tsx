"use client";

import { useAppTranslations } from "@/i18n/shared";
import {
  importedRatingsEdition,
  importPlayerRatingsWrite,
  playerRatingCsvLimit,
} from "@/lib/player-rating-import-contract";
import { useState, type FormEvent } from "react";
import type { z } from "zod";
import { PendingButtonLabel } from "./pending-button-label";

type Result = z.infer<typeof importPlayerRatingsWrite.response>;

export function PlayerRatingImport() {
  const tr = useAppTranslations();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const file = fields.get("file");
    setError("");
    setResult(undefined);
    if (!(file instanceof File) || !file.size) {
      setError(tr("Choose a CSV export to import."));
      return;
    }
    if (file.size > playerRatingCsvLimit) {
      setError(tr("The request is too large."));
      return;
    }
    setPending(true);
    try {
      const response = await fetch(
        importPlayerRatingsWrite.path.replace(
          "{edition}",
          importedRatingsEdition,
        ),
        {
          method: importPlayerRatingsWrite.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: fields.get("source"),
            csv: await file.text(),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setError(
          tr(
            data.error ??
              "This request could not be completed. Please try again.",
          ),
        );
        return;
      }
      setResult(importPlayerRatingsWrite.response.parse(data));
      form.reset();
    } catch {
      setError(tr("This request could not be completed. Please try again."));
    } finally {
      setPending(false);
    }
  }
  return (
    <details className="panel spaced">
      <summary>{tr("Import SIP or ETX ratings")}</summary>
      <form className="form-stack spaced" onSubmit={submit} aria-busy={pending}>
        <p className="small muted">
          {tr(
            "Import updates matching accepted players on the public S11 list. SIP matches current usernames and ETX matches osu! IDs.",
          )}
        </p>
        <label className="field">
          <span>{tr("Rating source")}</span>
          <select name="source" required disabled={pending}>
            <option value="sip">{"SIP (SkillIssue)"}</option>
            <option value="etx">{"ETX (Elitebotix)"}</option>
          </select>
        </label>
        <label className="field">
          <span>{tr("CSV export")}</span>
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            disabled={pending}
          />
        </label>
        <div className="actions">
          <button type="submit" disabled={pending}>
            <PendingButtonLabel pending={pending}>
              {tr("Import ratings")}
            </PendingButtonLabel>
          </button>
        </div>
        {error && (
          <p className="notice error-text" role="alert">
            {error}
          </p>
        )}
        {result && (
          <div role="status" className="small">
            <p>
              {tr(
                "Matched {matched} players, updated {updated} ratings, skipped {unmatched} unmatched rows and {missing} rows without a rating.",
                {
                  matched: result.matched,
                  updated: result.updated,
                  unmatched: result.unmatched,
                  missing: result.missing,
                },
              )}
            </p>
            {result.unmatchedRows.length > 0 && (
              <p>
                {tr("First unmatched CSV rows: {rows}", {
                  rows: result.unmatchedRows.join(", "),
                })}
              </p>
            )}
          </div>
        )}
      </form>
    </details>
  );
}
