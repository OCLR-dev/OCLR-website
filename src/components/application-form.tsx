"use client";

import type { EligibilityVerification } from "@/lib/eligibility-model";
import { EligibilitySummary } from "./eligibility-summary";
import { useAppTranslations } from "@/i18n/shared";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Edition } from "@/lib/editions";
export function ApplicationForm({
  edition,
  username,
  configurationVersion,
  verification = null,
  previousAttempt,
}: {
  edition: Edition;
  username: string;
  configurationVersion: number;
  verification?: EligibilityVerification | null;
  previousAttempt?: { attempt: number; expectedUpdatedAt: string };
}) {
  const tr = useAppTranslations();

  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const id = useId();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    let submitted = false;
    const element = event.currentTarget;
    const form = new FormData(element);
    setPending(true);
    setError("");
    setFieldError(null);
    try {
      const answers = Object.fromEntries(
        (edition.registration?.questions ?? []).map((q) => [
          q.id,
          String(form.get(`answer_${q.id}`) ?? ""),
        ]),
      );
      const result = await fetch(
        `/api/tournaments/${edition.slug}/registrations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(edition.rules
              ? {
                  rulesAcknowledged: form.get("rules") === "on",
                  rulesVersion: edition.rules.version,
                }
              : {}),
            ...(edition.eligibility
              ? { eligibilityAcknowledged: form.get("eligibility") === "on" }
              : {}),
            configurationVersion,
            ...(previousAttempt ? { reapply: previousAttempt } : {}),
            answers,
          }),
        },
      );
      if (!result.ok) {
        const data = await result.json();
        if (edition.registration?.questions.some((q) => q.id === data.field)) {
          setFieldError({ id: data.field, message: data.error });
          element
            .querySelector<HTMLElement>(`[name="answer_${data.field}"]`)
            ?.focus();
        } else setError(data.error ?? "Your application could not be saved.");
        return;
      }
      submitted = true;
      router.push("/dashboard?submitted=1");
      router.refresh();
    } catch {
      setError(
        "Your connection was interrupted. Check your dashboard before trying again.",
      );
    } finally {
      // Stay pending after success until the dashboard replaces this form.
      if (!submitted) setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="panel form-stack">
      <p>
        {tr("Applying individually as ")}
        <strong>{username}</strong>
        {tr(". Your osu! identity comes from your signed-in session.")}
      </p>
      {verification && <EligibilitySummary value={verification} />}
      {edition.registration?.publicIntroductionQuestionId && (
        <p className="notice">
          {tr(
            "Your self introduction will be public if your application is accepted. Other answers remain private.",
          )}
        </p>
      )}
      {edition.registration?.questions.map((q) => {
        const label = (
          <>
            {q.label}
            {q.required ? tr(" (required)") : tr(" (optional)")}
          </>
        );
        const invalid = fieldError?.id === q.id;
        const description = invalid ? `${id}-${q.id}-error` : undefined;
        const name = `answer_${q.id}`;
        return (
          <div key={q.id} className="application-answer">
            {q.type === "single_choice" ? (
              q.options.length > 6 ? (
                <label className="field">
                  <span>{label}</span>
                  <select
                    name={name}
                    required={q.required}
                    defaultValue=""
                    aria-invalid={invalid || undefined}
                    aria-describedby={description}
                  >
                    <option value="">
                      {q.required ? tr("Select an option") : tr("No answer")}
                    </option>
                    {q.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <fieldset
                  className="application-choices"
                  aria-describedby={description}
                >
                  <legend>{label}</legend>
                  <div className="application-choice-list">
                    {!q.required && (
                      <label className="check-field">
                        <input
                          type="radio"
                          name={name}
                          value=""
                          defaultChecked
                        />
                        <span>{tr("No answer")}</span>
                      </label>
                    )}
                    {q.options.map((option) => (
                      <label key={option.id} className="check-field">
                        <input
                          type="radio"
                          name={name}
                          value={option.id}
                          required={q.required}
                          aria-describedby={description}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )
            ) : (
              <label className="field">
                <span>{label}</span>
                <textarea
                  name={name}
                  required={q.required}
                  maxLength={q.maxLength}
                  rows={3}
                  aria-invalid={invalid || undefined}
                  aria-describedby={description}
                />
              </label>
            )}
            {invalid && (
              <p id={description} role="alert" className="small error-text">
                {tr(fieldError.message)}
              </p>
            )}
          </div>
        );
      })}
      {edition.rules && (
        <label className="check-field">
          <input name="rules" type="checkbox" required />
          <span>
            {tr("I have read and agree to the")}{" "}
            <Link
              className="text-link"
              href={`/tournaments/${edition.slug}/rules`}
              target="_blank"
              rel="noopener"
            >
              {tr("published rules (opens a new tab)")}
            </Link>
            {tr(", version ")}
            {edition.rules.version}.
          </span>
        </label>
      )}
      {edition.eligibility && (
        <label className="check-field">
          <input name="eligibility" type="checkbox" required />
          <span>
            {tr(
              "I have read the eligibility requirements and confirm I meet them.",
            )}
          </span>
        </label>
      )}
      <p className="small muted preserve-lines application-disclosure">
        {tr(
          "Applications are reviewed by tournament staff. Submitting is not acceptance or official osu! validation.\n\nIf accepted, your osu! username, osu! ID and accepted participation in this tournament appear automatically in its public Players directory. Application answers and staff review notes remain private.\n\nRead the",
        )}
        {tr.locale === "en" ? " " : ""}
        <span className="application-privacy-link">
          <Link href="/privacy" className="text-link">
            {tr("privacy notice")}
          </Link>
          {tr.locale === "en" ? " " : ""}
          {tr("before applying.")}
        </span>
      </p>
      {error && (
        <p className="notice error-text" role="alert">
          {tr(error)}
        </p>
      )}
      <button disabled={pending} type="submit">
        {pending
          ? tr("Saving application…")
          : tr("Submit individual application")}
      </button>
    </form>
  );
}
