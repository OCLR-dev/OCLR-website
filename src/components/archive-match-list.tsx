"use client";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";

export function ArchiveMatchList({
  matches,
  recordedOnly = false,
  reviewMode = false,
}: {
  matches: {
    id: string;
    stage: string;
    recorded: boolean;
    content: ReactNode;
  }[];
  recordedOnly?: boolean;
  reviewMode?: boolean;
}) {
  const tr = useAppTranslations();
  const query = useSearchParams();
  const [status, setStatus] = useState(
    recordedOnly || query?.get("status") === "recorded" ? "recorded" : "all",
  );
  const [stage, setStage] = useState("");
  const visible = matches.filter(
    (m) =>
      (!stage || m.stage === stage) &&
      (status === "all" || m.recorded === (status === "recorded")),
  );
  return (
    <div className="archive-fixtures">
      <div className="archive-fixture-toolbar">
        {reviewMode ? (
          <div
            className="archive-status-tabs"
            role="group"
            aria-label={tr("Match status")}
          >
            {[
              ["all", tr("All matches")],
              ["recorded", tr("Recorded results")],
              ["unconfirmed", tr("Unconfirmed records")],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
              >
                {label}{" "}
                <span>
                  {
                    matches.filter(
                      (m) =>
                        (!stage || m.stage === stage) &&
                        (value === "all" ||
                          m.recorded === (value === "recorded")),
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">
            {tr("Recorded results")} {matches.length}
          </p>
        )}
        <label className="archive-stage-filter">
          {tr("Stage")}
          <select
            aria-label={tr("Stage")}
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="">{tr("All stages")}</option>
            {[...new Set(matches.map((m) => m.stage))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="archive-match-list" aria-live="polite">
        {visible.length ? (
          visible.map((m) => m.content)
        ) : (
          <p className="muted">{tr("No matches in this view.")}</p>
        )}
      </div>
    </div>
  );
}
