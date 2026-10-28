"use client";
import { LoadingRegion } from "./loading-region";
import { useStaffReadOnly } from "./staff-read-only";
import { useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { modeNames } from "@/lib/osu-profile-model";
import { type BadgeClassification } from "@/lib/bws-model";
import type { staffBws } from "@/lib/bws";
import { BwsSummary } from "./bws-summary";
export function BwsReview({ slug, id }: { slug: string; id: string }) {
  const readOnly = useStaffReadOnly();
  const tr = useAppTranslations();
  const mode = "osu";
  const [data, setData] = useState<Awaited<ReturnType<typeof staffBws>> | null>(
    null,
  );
  const [classifications, setClassifications] = useState<BadgeClassification[]>(
    [],
  );
  const [error, setError] = useState("");
  const [activeRequest, setActiveRequest] = useState<"load" | "save" | null>(
    null,
  );
  const pending = activeRequest !== null;
  async function request(save = false) {
    if (pending) return;
    setActiveRequest(save ? "save" : "load");
    setError("");
    try {
      const response = await fetch(
        `/api/admin/tournaments/${slug}/registrations/${id}/bws${save ? "" : `?mode=${mode}`}`,
        save
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode,
                fingerprint: data!.fingerprint,
                expectedVersion: data!.version,
                classifications,
                confirmed: true,
              }),
            }
          : undefined,
      );
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        return;
      }
      setData(result);
      setClassifications(result.classifications);
    } catch {
      setError("The action could not be completed.");
    } finally {
      setActiveRequest(null);
    }
  }
  return (
    <section className="panel form-stack bws-review">
      {pending && <LoadingRegion />}
      <h2>{tr("Badge-weighted seeding")}</h2>
      <p className="small muted">{"osu!standard"}</p>
      <div className="actions">
        <button
          type="button"
          className="secondary"
          disabled={pending}
          aria-busy={activeRequest === "load"}
          onClick={() => request()}
        >
          {tr("Load BWS profile")}
        </button>
      </div>
      {data && (
        <>
          <BwsSummary value={data.summary} />
          {data.snapshot.profile.badges?.length ? (
            <>
              <p className="small muted">
                {tr(
                  "Classify only previous tournament prize badges in their actual ruleset. Contributor, mapper and contest awards are not tournament prizes.",
                )}
              </p>
              <ol className="badge-review-list">
                {data.snapshot.profile.badges.map((b, i) => (
                  <li key={i}>
                    <div>
                      <strong>{b.description}</strong>
                      <p className="muted small">{b.awardedAt}</p>
                      {b.url && (
                        <a
                          className="text-link"
                          href={b.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {tr("Badge source")}
                        </a>
                      )}
                    </div>
                    <label className="field">
                      <span>
                        {tr("Badge {number} classification", { number: i + 1 })}
                      </span>
                      <select
                        value={classifications[i]}
                        disabled={readOnly || pending}
                        onChange={(e) =>
                          setClassifications(
                            classifications.map((c, j) =>
                              i === j
                                ? (e.target.value as BadgeClassification)
                                : c,
                            ),
                          )
                        }
                      >
                        {(["unknown", "other", "osu"] as const).map((c) => (
                          <option key={c} value={c}>
                            {c === "unknown"
                              ? tr("Pending review")
                              : c === "other"
                                ? tr("Not eligible")
                                : tr("Tournament prize — {mode}", {
                                    mode: modeNames[c],
                                  })}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                disabled={
                  readOnly ||
                  pending ||
                  data.snapshot.stale ||
                  !!data.snapshot.notice
                }
                aria-busy={activeRequest === "save"}
                onClick={() => request(true)}
              >
                {tr("Save badge review")}
              </button>
            </>
          ) : null}
        </>
      )}
      {error && (
        <p className="notice error-text" role="alert">
          {tr(error)}
        </p>
      )}
    </section>
  );
}
