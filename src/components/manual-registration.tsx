"use client";

import { InfoNote } from "@/components/info-note";

import { EligibilitySummary } from "./eligibility-summary";
import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import type { ManualRegistrationPreview } from "@/lib/manual-registration-write-contract";
import { Avatar } from "./avatar";
export function ManualRegistration({
  edition,
}: {
  edition: { slug: string; name: string };
}) {
  const tr = useAppTranslations();
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const [input, setInput] = useState("");
  const [inputType, setInputType] = useState<"id" | "username">("id");
  const [preview, setPreview] = useState<ManualRegistrationPreview | null>(
    null,
  );
  const [status, setStatus] = useState<"pending" | "accepted">("pending");
  const [published, setPublished] = useState(false);
  const [override, setOverride] = useState(false);
  const [eligibilityOverride, setEligibilityOverride] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<"lookup" | "save" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  function reset() {
    generation.current++;
    request.current?.abort();
    setInput("");
    setInputType("id");
    setPreview(null);
    setPending(null);
    setError("");
    setStatus("pending");
    setPublished(false);
    setOverride(false);
    setEligibilityOverride(false);
    setReason("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const current = ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    setPending(preview ? "save" : "lookup");
    setError("");
    try {
      const response = await fetch(
        `/api/admin/tournaments/${edition.slug}/registrations${preview ? "" : "/preview"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(
            preview
              ? {
                  input: String(preview.profile.osuId),
                  expectedRevision: preview.edition.revision,
                  status,
                  confirmed: true,
                  publicationAcknowledged: published,
                  overrideWindow: override,
                  overrideEligibility: eligibilityOverride,
                  exceptionReason: reason,
                }
              : { input, inputType },
          ),
        },
      );
      const result = await response.json();
      if (current !== generation.current) return;
      if (!response.ok) {
        setError(result.error || "The action could not be completed.");
        if (preview) setPreview(null);
        return;
      }
      if (!preview) {
        setPreview(result);
        return;
      }
      setSuccess(tr("Registrant added."));
      dialog.current?.close();
      router.push(
        `/admin/tournaments/${edition.slug}/registrations?q=${result.userId}`,
      );
      router.refresh();
    } catch {
      if (current === generation.current)
        setError(
          "Connection interrupted. Refresh to check the saved state before retrying.",
        );
    } finally {
      if (current === generation.current) setPending(null);
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setSuccess("");
          dialog.current?.showModal();
        }}
      >
        {tr("Add registrant")}
      </button>
      {success && (
        <p role="status" className="small">
          {success}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        onClose={reset}
        onCancel={(event) => {
          if (pending === "save") event.preventDefault();
        }}
      >
        <h2 id={`${id}-title`}>{tr("Add registrant")}</h2>
        <p className="manual-edition">
          <strong>{edition.name}</strong>
        </p>
        <form className="form-stack" onSubmit={submit}>
          {preview?.verification && (
            <>
              <EligibilitySummary value={preview.verification} />
              {preview.verification.status !== "pass" && (
                <label className="check-field">
                  <input
                    required
                    type="checkbox"
                    checked={eligibilityOverride}
                    onChange={(e) => setEligibilityOverride(e.target.checked)}
                  />
                  <span>
                    {tr(
                      "I approve a staff exception to the automatic eligibility limits.",
                    )}
                  </span>
                </label>
              )}
            </>
          )}
          <label className="field">
            <span>{tr("Input type")}</span>
            <select
              value={inputType}
              disabled={!!pending}
              onChange={(event) => {
                setInputType(event.target.value as typeof inputType);
                setPreview(null);
                setError("");
                setPublished(false);
                setOverride(false);
                setEligibilityOverride(false);
                setReason("");
              }}
            >
              <option value="id">{tr("Numeric ID or profile URL")}</option>
              <option value="username">
                {tr("osu! username (including numeric names)")}
              </option>
            </select>
          </label>
          <label className="field">
            <span>
              {inputType === "username"
                ? tr("Current osu! username")
                : tr("osu! profile ID or URL")}
            </span>
            <input
              required
              maxLength={300}
              value={input}
              disabled={pending === "save"}
              onChange={(event) => {
                generation.current++;
                request.current?.abort();
                setPending(null);
                setPreview(null);
                setError("");
                setPublished(false);
                setOverride(false);
                setEligibilityOverride(false);
                setReason("");
                setInput(event.target.value);
              }}
            />
          </label>
          {preview && (
            <>
              <div className="registration-player manual-identity">
                <Avatar
                  osuId={preview.profile.osuId}
                  username={preview.profile.username}
                  avatarUrl={preview.profile.avatarUrl ?? undefined}
                />
                <div>
                  <a
                    href={preview.profile.canonicalUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {preview.profile.username}
                  </a>
                  <p className="small muted">
                    {tr("osu! ID")} {preview.profile.osuId}
                  </p>
                </div>
              </div>
              {preview.existing && (
                <p className="notice">
                  {tr(
                    "This player already has a registration for this tournament. Review the existing entry.",
                  )}{" "}
                  <a
                    href={`/admin/tournaments/${edition.slug}/registrations?status=&q=${preview.profile.osuId}`}
                  >
                    {tr("View existing registration")}
                  </a>
                </p>
              )}
              <p className="small muted">
                {tr(
                  "Staff-assisted entry. No player answers or acknowledgments are recorded.",
                )}
              </p>
              <label className="field">
                <span>{tr("Initial status")}</span>
                <select
                  value={status}
                  disabled={pending === "save"}
                  onChange={(e) => {
                    setStatus(e.target.value as typeof status);
                    setPublished(false);
                  }}
                >
                  <option value="pending">{tr("Pending")}</option>
                  <option value="accepted">{tr("Accepted")}</option>
                </select>
              </label>
              {status === "accepted" && (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={published}
                    disabled={pending === "save"}
                    onChange={(e) => setPublished(e.target.checked)}
                  />
                  <span>
                    {tr(
                      "I approve acceptance and publication of this player's basic identity in this tournament's public Players directory. No team or captain is assigned.",
                    )}
                  </span>
                </label>
              )}
              {preview.edition.outsideWindow && (
                <section className="notice form-stack">
                  <strong>{tr("Registration-window exception")}</strong>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={override}
                      disabled={pending === "save"}
                      onChange={(e) => setOverride(e.target.checked)}
                    />
                    <span>
                      {tr(
                        "I authorize this enrollment outside the public registration window. Public registration stays unchanged.",
                      )}
                    </span>
                  </label>
                  <label className="field">
                    <span>{tr("Enrollment exception explanation")}</span>
                    <textarea
                      maxLength={1000}
                      value={reason}
                      disabled={pending === "save"}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                </section>
              )}
            </>
          )}
          {inputType === "username" && (
            <InfoNote>
              <p className="small muted">
                {tr(
                  "Use the current official username. Previous names are not accepted; use the numeric ID if the name changed.",
                )}
              </p>
            </InfoNote>
          )}
          {error && (
            <p role="alert" className="notice error-text">
              {tr(error)}
            </p>
          )}
          <div className="actions">
            <button
              disabled={
                !!pending ||
                !input.trim() ||
                !!preview?.existing ||
                (!!preview &&
                  ((status === "accepted" && !published) ||
                    (preview.edition.outsideWindow &&
                      (!override || !reason.trim()))))
              }
            >
              {pending === "lookup"
                ? tr("Looking up…")
                : pending === "save"
                  ? tr("Saving…")
                  : preview
                    ? tr("Add registrant")
                    : tr("Verify player")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={pending === "save"}
              onClick={() => dialog.current?.close()}
            >
              {tr("Cancel")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
