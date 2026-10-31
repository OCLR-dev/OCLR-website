"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import type { RoundRefereeRule } from "@/lib/round-referee-policy";
import type { RefereeMap } from "@/lib/referee-model";
import { s11RefereeDefaults } from "@/lib/referee-defaults";
import { RefereePolicyEditor } from "./referee-policy-editor";
import { ReadOnlyFields } from "./staff-read-only";

export function RoundRefereePolicy({
  slug,
  rule,
  maps,
  season,
  roundVersion,
}: {
  slug: string;
  rule: RoundRefereeRule;
  maps: RefereeMap[];
  season?: string | null;
  roundVersion: number;
}) {
  const tr = useAppTranslations();
  const router = useRouter();
  const [saved, setSaved] = useState(rule);
  const [savedRoundVersion, setSavedRoundVersion] = useState(roundVersion);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    message: string;
  } | null>(null);
  const defaults = s11RefereeDefaults(season ?? null, rule.series);
  return (
    <div className="form-stack">
      {!saved.policy && (
        <p className="notice">
          {defaults
            ? tr(
                "S11 rule defaults are an editable draft. Confirm the BP order and missing settings, then save to apply them to this round.",
              )
            : tr(
                "No referee policy is saved for this round. S11 defaults require configured BO11 or BO13 scoring rules.",
              )}
        </p>
      )}
      {!saved.policy && defaults && (
        <p className="muted small">
          {tr(
            "S11 rules do not specify room size or the start countdown. The per-team disconnect replay allowance is not a per-map replay limit; leave it unset unless separately approved.",
          )}
        </p>
      )}
      {!saved.policy && defaults && (
        <p className="muted small">
          {tr(
            "Review category Ban limits, disconnect replays, pauses and EX conditions against the published rules.",
          )}
        </p>
      )}
      <ReadOnlyFields>
        <RefereePolicyEditor
          key={`${saved.revision}-${savedRoundVersion}`}
          policy={saved.policy}
          defaults={defaults}
          maps={maps}
          series={saved.series}
          busy={busy}
          onSave={async (policy) => {
            setBusy(true);
            setFeedback(null);
            try {
              const response = await fetch(
                `/api/admin/tournaments/${slug}/rounds/${rule.roundId}/referee-policy`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    expectedRevision: saved.revision,
                    policy,
                  }),
                },
              );
              const body = await response.json();
              if (!response.ok)
                throw new Error(
                  body.error ?? "Unable to save referee changes.",
                );
              setSaved({
                ...saved,
                revision: body.revision,
                policy: body.policy,
                series: body.series === undefined ? saved.series : body.series,
              });
              if (body.roundVersion !== undefined)
                setSavedRoundVersion(body.roundVersion);
              setFeedback({
                error: false,
                message: tr("Round referee policy saved."),
              });
              router.refresh();
            } catch (error) {
              setFeedback({
                error: true,
                message: tr(
                  error instanceof Error
                    ? error.message
                    : "Unable to save referee changes.",
                ),
              });
            } finally {
              setBusy(false);
            }
          }}
        />
      </ReadOnlyFields>
      {saved.series?.type !== "first_to" && (
        <a
          className="button secondary"
          href={`/admin/tournaments/${slug}/matches`}
        >
          {tr("Configure scoring rules")}
        </a>
      )}
      {feedback && (
        <p role={feedback.error ? "alert" : "status"}>{feedback.message}</p>
      )}
    </div>
  );
}
