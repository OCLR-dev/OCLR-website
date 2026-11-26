"use client";

import { InfoNote } from "@/components/info-note";

import { LoadingRegion } from "./loading-region";
import { useStaffReadOnly } from "./staff-read-only";
import { useCallback, useEffect, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { modeNames } from "@/lib/osu-profile-model";
import { type BadgeClassification } from "@/lib/bws-model";
import type { ExplicitReadData } from "@/lib/explicit-read-contracts";
import { BwsSummary } from "./bws-summary";
type ReviewData = ExplicitReadData<"staffBws">;
type ReviewResult = { data: ReviewData } | { error: string };

async function fetchReview(
  slug: string,
  id: string,
  options?: RequestInit,
): Promise<ReviewResult> {
  const query = options?.method === "POST" ? "" : "?mode=osu";
  const fallback = "The action could not be completed.";
  try {
    const response = await fetch(
      `/api/admin/tournaments/${slug}/registrations/${id}/bws${query}`,
      options,
    );
    const result = await response.json();
    return response.ok ? { data: result } : { error: result.error ?? fallback };
  } catch {
    return { error: fallback };
  }
}

export function BwsReview({ slug, id }: { slug: string; id: string }) {
  const readOnly = useStaffReadOnly();
  const tr = useAppTranslations();
  const [data, setData] = useState<ReviewData | null>(null);
  const [classifications, setClassifications] = useState<BadgeClassification[]>(
    [],
  );
  const [error, setError] = useState("");
  const [activeRequest, setActiveRequest] = useState<"load" | "save" | null>(
    "load",
  );
  const pending = activeRequest !== null;
  const applyReview = useCallback((result: ReviewResult) => {
    if ("data" in result) {
      setData(result.data);
      setClassifications(result.data.classifications);
    } else {
      setError(result.error);
    }
    setActiveRequest(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void fetchReview(slug, id, { signal }).then((result) => {
      if (!signal.aborted) applyReview(result);
    });
    return () => controller.abort();
  }, [slug, id, applyReview]);

  function request(save = false) {
    if (pending || (save && !data)) return;
    setActiveRequest(save ? "save" : "load");
    setError("");
    void fetchReview(
      slug,
      id,
      save && data
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "osu",
              fingerprint: data.fingerprint,
              expectedVersion: data.version,
              classifications,
              confirmed: true,
            }),
          }
        : undefined,
    ).then(applyReview);
  }

  return (
    <section className="panel bws-review">
      {pending && <LoadingRegion />}
      <h2>{tr("Badge-weighted seeding")}</h2>
      {data && (
        <>
          <BwsSummary value={data.summary} />
          {data.snapshot.profile.badges?.length ? (
            <>
              <InfoNote>
                <p className="small muted">
                  {tr(
                    "Classify only previous tournament prize badges in their actual ruleset. Contributor, mapper and contest awards are not tournament prizes.",
                  )}
                </p>
              </InfoNote>
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
        <div className="bws-review-feedback">
          <p className="notice error-text" role="alert">
            {tr(error)}
          </p>
          {!data && (
            <button
              type="button"
              className="secondary"
              onClick={() => request()}
            >
              {tr("Retry")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
