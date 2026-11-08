"use client";

import { InfoNote } from "@/components/info-note";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAppTranslations } from "@/i18n/shared";
import type {
  ManualBatchPreview,
  ManualBatchResult,
} from "@/lib/manual-registration-write-contract";
import { EligibilitySummary } from "./eligibility-summary";
import { Avatar } from "./avatar";
export function BulkManualRegistration({
  edition,
}: {
  edition: { slug: string; name: string };
}) {
  const tr = useAppTranslations();
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [text, setText] = useState("");
  const [inputType, setInputType] = useState<"username" | "id">("username");
  const [preview, setPreview] = useState<ManualBatchPreview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [eligibility, setEligibility] = useState<number[]>([]);
  const [results, setResults] = useState<ManualBatchResult[]>([]);
  const [status, setStatus] = useState<"pending" | "accepted">("pending");
  const [published, setPublished] = useState(false);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<"lookup" | "save" | null>(null);
  const [error, setError] = useState("");
  function invalidate() {
    generation.current++;
    request.current?.abort();
    setPending(null);
    setPreview(null);
    setResults([]);
    setSelected([]);
    setEligibility([]);
    setPublished(false);
    setOverride(false);
    setReason("");
    setError("");
  }
  function reset() {
    invalidate();
    setText("");
    setInputType("username");
    setStatus("pending");
  }
  const done = new Set(
    results.filter((r) => r.state !== "failed").map((r) => r.line),
  );
  const chosen =
    preview?.rows.filter(
      (r) =>
        r.state === "ready" && selected.includes(r.line) && !done.has(r.line),
    ) ?? [];
  const allowed =
    chosen.length > 0 &&
    chosen.every(
      (r) =>
        !r.preview?.verification ||
        r.preview.verification.status === "pass" ||
        eligibility.includes(r.line),
    ) &&
    (status !== "accepted" || published) &&
    (!preview?.edition.outsideWindow || (override && !!reason.trim()));
  async function run(save: boolean) {
    if (pending || (save && !allowed)) return;
    const current = ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    setPending(save ? "save" : "lookup");
    setError("");
    try {
      const unfinishedText = preview
        ? text
            .split(/\r?\n/)
            .map((raw, i) => (done.has(i + 1) ? "" : raw))
            .join("\n")
        : text;
      const response = await fetch(
        `/api/admin/tournaments/${edition.slug}/registrations/batch${save ? "" : "/preview"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(
            save
              ? {
                  expectedRevision: preview!.edition.revision,
                  status,
                  confirmed: true,
                  publicationAcknowledged: published,
                  overrideWindow: override,
                  exceptionReason: reason,
                  rows: chosen.map((r) => ({
                    line: r.line,
                    osuId: r.preview!.profile.osuId,
                    overrideEligibility: eligibility.includes(r.line),
                  })),
                }
              : { text: unfinishedText, inputType },
          ),
        },
      );
      const data = await response.json();
      if (current !== generation.current) return;
      if (!response.ok) {
        setError(data.error || "The action could not be completed.");
        // Results stay visible; a changed edition must be previewed again.
        setSelected([]);
        return;
      }
      if (save) {
        const next = data.results as ManualBatchResult[];
        setResults((previous) => [
          ...previous.filter((r) => !next.some((n) => n.line === r.line)),
          ...next,
        ]);
        setSelected([]);
        setPublished(false);
        router.refresh();
      } else {
        setPreview((previous) => ({
          ...data,
          rows: [
            ...(previous?.rows.filter((r) => done.has(r.line)) ?? []),
            ...data.rows,
          ].sort((a, b) => a.line - b.line),
        }));
        setSelected(
          data.rows
            .filter(
              (r: ManualBatchPreview["rows"][number]) => r.state === "ready",
            )
            .map((r: ManualBatchPreview["rows"][number]) => r.line),
        );
        setEligibility([]);
        setPublished(false);
        setOverride(false);
        setReason("");
        setResults((previous) => previous.filter((r) => r.state !== "failed"));
      }
    } catch {
      if (current === generation.current)
        setError(
          save
            ? "Connection interrupted. Retry the unfinished list to check existing entries; completed registrations will not be overwritten."
            : "The action could not be completed.",
        );
    } finally {
      if (current === generation.current) {
        setPending(null);
        requestAnimationFrame(() => feedback.current?.focus());
      }
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(true);
  }
  function toggle(values: number[], line: number, checked: boolean) {
    return checked ? [...values, line] : values.filter((v) => v !== line);
  }
  return (
    <>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          reset();
          dialog.current?.showModal();
        }}
      >
        {tr("Add multiple registrants")}
      </button>
      <dialog
        ref={dialog}
        className="manual-batch-dialog"
        aria-labelledby={`${id}-title`}
        onClose={reset}
        onCancel={(event) => {
          if (pending === "save") event.preventDefault();
        }}
      >
        <h2 id={`${id}-title`}>{tr("Add multiple registrants")}</h2>
        <p className="manual-edition">
          <strong>{edition.name}</strong>
        </p>
        <form className="form-stack" onSubmit={submit} aria-busy={!!pending}>
          <label className="field">
            <span>{tr("Unprefixed lines contain")}</span>
            <select
              value={inputType}
              disabled={!!pending}
              onChange={(e) => {
                invalidate();
                setInputType(e.target.value as typeof inputType);
              }}
            >
              <option value="username">
                {tr("osu! username (including numeric names)")}
              </option>
              <option value="id">{tr("Numeric ID or profile URL")}</option>
            </select>
          </label>
          <label className="field">
            <span>{tr("One player per line")}</span>
            <textarea
              rows={5}
              maxLength={8192}
              value={text}
              disabled={!!pending}
              aria-describedby={`${id}-help`}
              onChange={(e) => {
                invalidate();
                setText(e.target.value);
              }}
            />
          </label>
          <InfoNote>
            <p id={`${id}-help`} className="small muted">
              {tr(
                "Up to 20 non-empty lines and 8192 characters. Spaces stay within usernames. Use name: for usernames (including numeric names), id: for IDs, or a canonical HTTPS profile URL. Lookups run sequentially; wait before retrying a rate limit.",
              )}
              <br />
              <code>
                {
                  "name: Example Player\nid: 12345\nhttps://osu.ppy.sh/users/67890"
                }
              </code>
            </p>
          </InfoNote>
          <InfoNote>
            <p className="small muted">
              {tr(
                "Use the current official username. Previous names are not accepted; use the numeric ID if the name changed.",
              )}
            </p>
          </InfoNote>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={
                !!pending ||
                !text.trim() ||
                (!!preview && preview.rows.every((r) => done.has(r.line)))
              }
              onClick={() => void run(false)}
            >
              {pending === "lookup"
                ? tr("Looking up…")
                : preview
                  ? tr("Preview unfinished rows again")
                  : tr("Preview players")}
            </button>
          </div>
          <p
            ref={feedback}
            tabIndex={-1}
            role={error ? "alert" : "status"}
            className={error ? "notice error-text" : "small"}
          >
            {error
              ? tr(error)
              : pending
                ? tr("Working…")
                : preview
                  ? tr(
                      "Preview only: no registrations are created until you confirm the selected list.",
                    )
                  : ""}
          </p>
          {!!results.length && (
            <p role="status">
              {tr("Added: {added}. Skipped: {skipped}. Failed: {failed}.", {
                added: results.filter((r) => r.state === "added").length,
                skipped: results.filter((r) => r.state === "skipped").length,
                failed: results.filter((r) => r.state === "failed").length,
              })}
            </p>
          )}
          {preview && (
            <>
              <ol className="manual-batch-rows">
                {preview.rows.map((row) => {
                  const profile = row.preview?.profile;
                  const result = results.find((r) => r.line === row.line);
                  const unavailable =
                    row.state !== "ready" || done.has(row.line) || !!result;
                  const state = result?.state ?? row.state;
                  return (
                    <li key={row.line} className="panel manual-batch-row">
                      <label className="check-field">
                        <input
                          type="checkbox"
                          disabled={!!pending || unavailable}
                          checked={selected.includes(row.line) && !unavailable}
                          onChange={(e) => {
                            setSelected(
                              toggle(selected, row.line, e.target.checked),
                            );
                            setPublished(false);
                          }}
                        />
                        <span>
                          {tr("Line {line}", { line: row.line })}:{" "}
                          <code>{row.raw}</code>
                        </span>
                      </label>
                      {profile && (
                        <div className="registration-player manual-identity">
                          <Avatar
                            osuId={profile.osuId}
                            username={profile.username}
                            avatarUrl={profile.avatarUrl ?? undefined}
                          />
                          <div>
                            <a
                              href={profile.canonicalUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {profile.username}
                            </a>
                            <p className="small muted">
                              {tr("osu! ID")} {profile.osuId}
                            </p>
                          </div>
                        </div>
                      )}
                      <strong>
                        {state === "ready"
                          ? tr("Ready to add")
                          : state === "duplicate"
                            ? tr("Duplicate in this list")
                            : state === "existing"
                              ? tr("Already registered")
                              : state === "added"
                                ? tr("Added")
                                : state === "skipped"
                                  ? tr("Skipped: existing registration")
                                  : tr("Failed")}
                      </strong>
                      {(row.preview?.existing || result?.registration) && (
                        <p className="small">
                          {tr("Existing status")}:{" "}
                          {row.preview?.existing?.status ??
                            result?.registration?.status}{" "}
                          <a
                            href={`/admin/tournaments/${edition.slug}/registrations?q=${profile?.osuId ?? result?.osuId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {tr("View existing registration")}
                          </a>
                        </p>
                      )}
                      {(result?.error || row.error) && (
                        <p className="error-text">
                          {tr(result?.error ?? row.error!)}
                        </p>
                      )}
                      {row.preview?.verification && (
                        <EligibilitySummary value={row.preview.verification} />
                      )}
                      {row.preview?.verification &&
                        row.preview.verification.status !== "pass" &&
                        !unavailable && (
                          <label className="check-field">
                            <input
                              type="checkbox"
                              disabled={!!pending}
                              checked={eligibility.includes(row.line)}
                              onChange={(e) =>
                                setEligibility(
                                  toggle(
                                    eligibility,
                                    row.line,
                                    e.target.checked,
                                  ),
                                )
                              }
                            />
                            <span>
                              {tr(
                                "I approve a staff exception to the automatic eligibility limits.",
                              )}
                            </span>
                          </label>
                        )}
                    </li>
                  );
                })}
              </ol>
              <p className="small muted">
                {tr(
                  "Staff-assisted entry. No player answers or acknowledgments are recorded.",
                )}
              </p>
              <label className="field">
                <span>{tr("Initial status")}</span>
                <select
                  value={status}
                  disabled={!!pending}
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
                    disabled={!!pending}
                    checked={published}
                    onChange={(e) => setPublished(e.target.checked)}
                  />
                  <span>
                    {tr(
                      "I approve acceptance and publication of every selected player's basic identity in this tournament's public Players directory. No team or captain is assigned.",
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
                      disabled={!!pending}
                      checked={override}
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
                      disabled={!!pending}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                </section>
              )}
              <p>
                <strong>
                  {tr("Selected: {count}. Initial status:", {
                    count: chosen.length,
                  })}{" "}
                  {status === "pending" ? tr("Pending") : tr("Accepted")}
                </strong>
              </p>
            </>
          )}
          <div className="actions">
            {preview && (
              <button disabled={!!pending || !allowed}>
                {pending === "save"
                  ? tr("Saving…")
                  : tr("Confirm selected registrants")}
              </button>
            )}
            <button
              type="button"
              className="secondary"
              disabled={pending === "save"}
              onClick={() => dialog.current?.close()}
            >
              {tr("Close")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
