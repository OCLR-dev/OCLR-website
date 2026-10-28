"use client";
import { ReadOnlyFields } from "./staff-read-only";
import { appearanceLabel } from "@/i18n/appearance";
import { appearances, type Appearance } from "@/lib/preferences";

import { EligibilityLimitsSummary } from "./eligibility-summary";
import { noEligibilityLimits } from "@/lib/eligibility-model";
import { useAppTranslations } from "@/i18n/shared";

import Image from "next/image";
import { useId, useRef, useState, type ReactNode, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  registrationBlockers,
  questionSchema,
  suggestEditionSlug,
  type Edition,
} from "@/lib/editions";
import type { tournamentForAdmin } from "@/lib/tournaments";
import { isBlankTournamentDraft } from "@/lib/tournament-draft";
import { ConfirmMutation } from "./confirm-mutation";
import { WorkspaceTabs } from "./workspace-tabs";
import { TimeZonePicker } from "./time-zone-picker";
import { ApplicationQuestionEditor } from "./application-question-editor";
import { ZonedDateInput } from "./zoned-date-input";
type Workspace = Pick<
  Awaited<ReturnType<typeof tournamentForAdmin>>,
  "edition" | "revision" | "applications" | "registrationPaused" | "readiness"
>;
type Identity = Pick<
  Edition,
  "name" | "season" | "summary" | "timeZone" | "branding"
>;
function IdentityFields({
  value,
  onChange,
  published,
  children,
  metadata,
}: {
  published: boolean;
  value: Identity;
  onChange: (value: Identity) => void;
  children: ReactNode;
  metadata?: ReactNode;
}) {
  const tr = useAppTranslations();
  const assets = [
    {
      key: "logo",
      label: tr("Square logo"),
      path: "/oclr-s11-square-logo.webp",
    },
    {
      key: "background",
      label: tr("Website background"),
      path: "/oclr-s11-website-background.webp",
    },
    {
      key: "keyVisual",
      label: tr("Key visual"),
      path: "/oclr-s11-key-visual.webp",
    },
  ] as const;
  return (
    <>
      <fieldset className="settings-card form-stack">
        <legend>
          {tr("Tournament identity")}
          {metadata && (
            <span className="settings-identity-meta">{metadata}</span>
          )}
        </legend>
        <label className="field">
          <span>{tr("Tournament name")}</span>
          <input
            required
            maxLength={100}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </label>
        <label className="field">
          <span>{tr("Summary")}</span>
          <textarea
            required={published}
            placeholder={tr("Add approved public copy before publishing.")}
            maxLength={2000}
            value={value.summary}
            onChange={(e) => onChange({ ...value, summary: e.target.value })}
          />
        </label>
        <TimeZonePicker
          value={value.timeZone}
          onChange={(timeZone) => onChange({ ...value, timeZone })}
        />
        {children}
      </fieldset>
      <fieldset className="settings-card form-stack">
        <legend>{tr("Season")}</legend>
        <label className="field">
          <span>{tr("Season identifier (optional)")}</span>
          <input
            maxLength={40}
            value={value.season ?? ""}
            onChange={(e) =>
              onChange({ ...value, season: e.target.value || null })
            }
          />
        </label>
      </fieldset>
      <fieldset className="settings-card form-stack">
        <legend>{tr("Artwork & branding")}</legend>
        <div className="settings-artwork-grid">
          {assets.map((asset) => (
            <div key={asset.key}>
              <label className="field">
                <span>{asset.label}</span>
                <select
                  value={value.branding[asset.key] ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      branding: {
                        ...value.branding,
                        [asset.key]: e.target.value || null,
                      },
                    })
                  }
                >
                  <option value="">{tr("No edition artwork")}</option>
                  {(asset.key === "logo" || asset.key === "keyVisual") && (
                    <>
                      <option value="/archive/s10/thumbnail.png">
                        {tr("OCLR Season 10 — ")}
                        {asset.label}
                      </option>
                      <option value="/archive/s9/thumbnail.png">
                        {tr("OCLR Season 9 — ")}
                        {asset.label}
                      </option>
                      <option value="/archive/s8/thumbnail.jpg">
                        {tr("OCLR Season 8 — ")}
                        {asset.label}
                      </option>
                    </>
                  )}
                  {(asset.key === "logo" || asset.key === "keyVisual") && (
                    <>
                      <option value="/archive/s1/key-visual.webp">
                        {tr("OCLR Season 1 — ")}
                        {asset.label}
                      </option>
                      <option value="/archive/s2/key-visual.avif">
                        {tr("OCLR Season 2 — ")}
                        {asset.label}
                      </option>
                      <option value="/archive/s3/key-visual.avif">
                        {tr("OCLR Season 3 — ")}
                        {asset.label}
                      </option>
                      <option value="/archive/s4/key-visual.avif">
                        {tr("OCLR Season 4 — ")}
                        {asset.label}
                      </option>
                      <option value="/archive/s5/key-visual.png">
                        {tr("OCLR Season 5 (β) — ")}
                        {asset.label}
                      </option>
                      <option value="/archive/s6/key-visual.jpg">
                        {tr("OCLR Season 6 — ")}
                        {asset.label}
                      </option>
                      <option value="/archive/s7/key-visual.jpg">
                        {tr("OCLR Season 7 — ")}
                        {asset.label}
                      </option>
                    </>
                  )}
                  <option value={asset.path}>
                    {tr("OCLR Season 11 — ")}
                    {asset.label}
                  </option>
                </select>
              </label>
              {value.branding[asset.key] && (
                <Image
                  className="settings-artwork-preview"
                  src={value.branding[asset.key]!}
                  alt={asset.label}
                  width={240}
                  height={135}
                  unoptimized
                />
              )}
            </div>
          ))}
        </div>
      </fieldset>
    </>
  );
}
export function CreateTournamentForm() {
  const tr = useAppTranslations();

  const router = useRouter();
  const slugInput = useRef<HTMLInputElement>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [customSlug, setCustomSlug] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await fetch("/api/admin/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, confirmed: true }),
      });
      const data = await result.json();
      if (!result.ok) {
        setError(data.error || "Tournament could not be created.");
        return;
      }
      router.push(`/admin/tournaments/${data.edition.slug}`);
      router.refresh();
    } catch {
      setError(
        "Connection interrupted. Check the tournament list before retrying.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <ReadOnlyFields>
      <form className="panel form-stack" onSubmit={create}>
        <label className="field">
          <span>{tr("Tournament name")}</span>
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!customSlug)
                setSlug(
                  suggestEditionSlug(event.target.value) ||
                    `oclr-${crypto.randomUUID().slice(0, 8)}`,
                );
            }}
          />
        </label>
        <p className="muted small" id="slug-help">
          /tournaments/{slug || "…"} {tr(" · Permanent after creation.")}
        </p>
        {!customSlug && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setCustomSlug(true);
              requestAnimationFrame(() => slugInput.current?.focus());
            }}
          >
            {tr("Edit URL")}
          </button>
        )}
        {customSlug && (
          <div>
            <label className="field">
              <span>{tr("Permanent slug")}</span>
              <input
                ref={slugInput}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={80}
                value={slug}
                onChange={(e) => {
                  setCustomSlug(true);
                  setSlug(e.target.value);
                }}
                aria-describedby="slug-help"
              />
            </label>
          </div>
        )}
        {error && (
          <p role="alert" className="notice error-text">
            {tr(error)}
          </p>
        )}
        <button disabled={pending}>
          {pending ? tr("Creating…") : tr("Create private draft")}
        </button>
      </form>
    </ReadOnlyFields>
  );
}
type EditorProps = { data: Workspace; saved: (message: string) => void };
function Save({
  data,
  action,
  fields,
  label,
  saved,
  confirmation = false,
  disabled = false,
}: EditorProps & {
  action: string;
  fields: Record<string, unknown>;
  label: string;
  confirmation?: boolean;
  disabled?: boolean;
}) {
  const tr = useAppTranslations();
  const [original] = useState(() => JSON.stringify(fields));
  const dirty = original !== JSON.stringify(fields);

  return (
    <div className="settings-save">
      <p className="small muted" aria-live="polite">
        {dirty ? tr("Unsaved changes") : tr("Saved settings")}
      </p>
      <ConfirmMutation
        requireConfirmation={confirmation}
        disabled={disabled}
        label={label}
        title={label}
        description={
          confirmation
            ? tr(
                "Completing this tournament pauses registration. Competition records and past applications are preserved.",
              )
            : undefined
        }
        url={`/api/admin/tournaments/${data.edition.slug}`}
        payload={{
          action,
          expectedRevision: data.revision,
          confirmed: true,
          ...fields,
        }}
        onSuccess={() => saved(`${label.replace(/^Save /, "")} saved.`)}
      />
    </div>
  );
}
function General({ data, saved }: EditorProps) {
  const tr = useAppTranslations();

  const [value, setValue] = useState<Identity>({
    name: data.edition.name,
    season: data.edition.season,
    summary: data.edition.summary,
    timeZone: data.edition.timeZone,
    branding: data.edition.branding,
  });
  const [status, setStatus] = useState(data.edition.status);
  const [appearance, setAppearance] = useState(
    data.edition.defaultAppearance ?? "site",
  );
  return (
    <ReadOnlyFields>
      <section className="general-settings form-stack">
        <IdentityFields
          value={value}
          onChange={setValue}
          published={data.edition.published}
          metadata={
            <>
              {tr("Permanent slug: ")}
              <strong>{data.edition.slug}</strong>
            </>
          }
        >
          <label className="field">
            <span>{tr("Tournament status")}</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Edition["status"])}
            >
              <option value="upcoming">{tr("Upcoming")}</option>
              <option value="live">{tr("Live")}</option>
              <option value="completed">{tr("Completed")}</option>
            </select>
          </label>
        </IdentityFields>
        <label className="field">
          <span>{tr("Default tournament appearance")}</span>
          <select
            value={appearance}
            onChange={(e) =>
              setAppearance(e.target.value as "site" | Appearance)
            }
          >
            <option value="site">{tr("Use site default")}</option>
            {appearances.map((value) => (
              <option key={value} value={value}>
                {appearanceLabel(value, tr)}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          {tr(
            "Use tournament/site defaults: the current tournament takes priority, otherwise use the site default. Explicit visitor preferences take priority over both.",
          )}
        </p>
        <Save
          data={data}
          saved={saved}
          action="general"
          fields={{
            ...value,
            status,
            defaultAppearance: appearance === "site" ? null : appearance,
          }}
          label={tr("Save general settings")}
          confirmation={
            status === "completed" && data.edition.status !== "completed"
          }
        />
      </section>
    </ReadOnlyFields>
  );
}
function Rules({ data, saved }: EditorProps) {
  const tr = useAppTranslations();

  const [configured, setConfigured] = useState(Boolean(data.edition.rules));
  const [version, setVersion] = useState(data.edition.rules?.version ?? "");
  const [sections, setSections] = useState(
    data.edition.rules?.sections ?? [{ heading: "", body: "" }],
  );
  const [limits, setLimits] = useState(
    data.edition.automaticEligibility ?? noEligibilityLimits,
  );
  const [graceMin, setGraceMin] = useState(
    String(data.edition.rankGraceRange?.minRank ?? ""),
  );
  const [graceMax, setGraceMax] = useState(
    String(data.edition.rankGraceRange?.maxRank ?? ""),
  );
  const [eligibility, setEligibility] = useState(
    data.edition.eligibility ?? "",
  );
  return (
    <ReadOnlyFields>
      <section className="panel form-stack">
        <h2>{tr("Rules & eligibility")}</h2>
        <p className="muted small">
          {tr(
            "Optional. Use a new version when rules change; past acknowledgments are preserved.",
          )}
        </p>
        {
          <label className="check-field">
            <input
              type="checkbox"
              checked={configured}
              onChange={(e) => setConfigured(e.target.checked)}
            />
            <span>{tr("Configure approved rules")}</span>
          </label>
        }
        {configured && (
          <>
            <fieldset className="settings-card form-stack">
              <legend>{tr("Rules release")}</legend>
              <p className="small muted">
                {tr(
                  "This is the published identifier players acknowledge. Use a new identifier when rules change; past acknowledgments remain attached to the original release.",
                )}
              </p>
              <label className="field">
                <span>{tr("Rules version")}</span>
                <input
                  value={version}
                  maxLength={80}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </label>
            </fieldset>
            {sections.map((s, i) => (
              <fieldset className="form-stack" key={i}>
                <legend>
                  {tr("Rules section ")}
                  {i + 1}
                </legend>
                <label className="field">
                  <span>
                    {tr("Section ")}
                    {i + 1} {tr(" heading")}
                  </span>
                  <input
                    maxLength={200}
                    value={s.heading}
                    onChange={(e) =>
                      setSections(
                        sections.map((v, j) =>
                          i === j ? { ...v, heading: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>
                    {tr("Section ")}
                    {i + 1} {tr(" content")}
                  </span>
                  <textarea
                    rows={6}
                    maxLength={20000}
                    value={s.body}
                    onChange={(e) =>
                      setSections(
                        sections.map((v, j) =>
                          i === j ? { ...v, body: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <div className="actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={!i}
                    onClick={() =>
                      setSections(
                        sections.map((v, j) =>
                          j === i - 1
                            ? sections[i]
                            : j === i
                              ? sections[i - 1]
                              : v,
                        ),
                      )
                    }
                  >
                    {tr("Move section ")}
                    {i + 1} {tr(" up")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={sections.length === 1}
                    onClick={() =>
                      setSections(sections.filter((_, j) => j !== i))
                    }
                  >
                    {tr("Remove section ")}
                    {i + 1}
                  </button>
                </div>
              </fieldset>
            ))}
            <button
              type="button"
              className="secondary"
              disabled={sections.length >= 32}
              onClick={() =>
                setSections([...sections, { heading: "", body: "" }])
              }
            >
              {tr("Add rules section")}
            </button>
          </>
        )}
        <fieldset className="settings-card form-stack">
          <legend>{tr("Eligibility")}</legend>
          <label className="field">
            <span>{tr("Eligibility disclosure")}</span>
            <textarea
              rows={5}
              maxLength={4000}
              value={eligibility}
              onChange={(e) => setEligibility(e.target.value)}
            />
          </label>
        </fieldset>
        <fieldset className="settings-card form-stack">
          <legend>{tr("Automatic eligibility")}</legend>
          <p className="small muted">
            {"osu!standard"} ·{" "}
            {tr(
              "All configured limits apply together, inclusively. Empty fields impose no restriction.",
            )}
          </p>
          <div className="form-grid">
            {(["minPp", "maxPp", "minRank", "maxRank"] as const).map((key) => (
              <label className="field" key={key}>
                <span>
                  {tr(
                    key === "minPp"
                      ? "Minimum PP"
                      : key === "maxPp"
                        ? "Maximum PP"
                        : key === "minRank"
                          ? "Minimum numeric rank (rank ≥)"
                          : "Maximum numeric rank (rank ≤)",
                  )}
                </span>
                <input
                  type="number"
                  min={key.endsWith("Rank") ? 1 : 0}
                  step={key.endsWith("Rank") ? 1 : "any"}
                  value={limits[key] ?? ""}
                  onChange={(e) =>
                    setLimits({
                      ...limits,
                      [key]:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="settings-card form-stack">
          <legend>{tr("Rank grace range (manual review)")}</legend>
          <p className="small muted">
            {tr(
              "Optional organizer-approved numeric rank range. Rank-only failures in this range may submit for review; PP limits still apply. No application is automatically accepted or deferred.",
            )}
          </p>
          <div className="form-grid">
            <label className="field">
              <span>{tr("Grace minimum numeric rank")}</span>
              <input
                type="number"
                min={1}
                step={1}
                value={graceMin}
                onChange={(e) => setGraceMin(e.target.value)}
              />
            </label>
            <label className="field">
              <span>{tr("Grace maximum numeric rank")}</span>
              <input
                type="number"
                min={1}
                step={1}
                value={graceMax}
                onChange={(e) => setGraceMax(e.target.value)}
              />
            </label>
          </div>
        </fieldset>
        <EligibilityLimitsSummary limits={limits} />
        <Save
          data={data}
          saved={saved}
          action="rules"
          fields={{
            rules: configured ? { version, sections } : null,
            eligibility: eligibility.trim() || null,
            automaticEligibility: limits,
            rankGraceRange:
              graceMin || graceMax
                ? { minRank: Number(graceMin), maxRank: Number(graceMax) }
                : null,
          }}
          label={tr("Save rules & eligibility")}
        />
      </section>
    </ReadOnlyFields>
  );
}
function Registration({ data, saved }: EditorProps) {
  const tr = useAppTranslations();

  const e = data.edition;
  const [configured, setConfigured] = useState(Boolean(e.registration));
  const [enabled, setEnabled] = useState(e.registration?.enabled ?? false);
  const [opensAt, setOpens] = useState<string | null>(
    e.registration?.opensAt ?? null,
  );
  const [closesAt, setCloses] = useState<string | null>(
    e.registration?.closesAt ?? null,
  );
  const [withdrawUntil, setWithdraw] = useState<string | null>(
    e.registration?.withdrawUntil ?? null,
  );
  const [opensValid, setOpensValid] = useState(Boolean(opensAt));
  const [closesValid, setClosesValid] = useState(Boolean(closesAt));
  const [withdrawValid, setWithdrawValid] = useState(true);
  const [questions, setQuestions] = useState(e.registration?.questions ?? []);
  const [publicIntroductionQuestionId, setPublicIntroductionQuestionId] =
    useState(e.registration?.publicIntroductionQuestionId ?? "");
  const blockers = registrationBlockers(
    e,
    data.readiness.some(
      (item) => item.label === "Privacy configuration" && item.ready,
    ),
  );

  return (
    <ReadOnlyFields>
      <section className="panel form-stack">
        <h2>{tr("Registration settings")}</h2>
        {data.registrationPaused && (
          <div className="section-title">
            <p className="muted small">
              {tr("Registration remains paused by tournament operations.")}
            </p>
            <ConfirmMutation
              requireConfirmation={false}
              label={tr("Resume registration")}
              title={tr("Resume registration")}
              disabled={blockers.length > 0 || !e.registration}
              url={`/api/admin/tournaments/${e.slug}`}
              payload={{
                action: "enrollment",
                paused: false,
                expectedRevision: data.revision,
                confirmed: true,
              }}
              onSuccess={() =>
                saved(
                  tr(
                    "Registration pause removed. Enablement and time window still apply.",
                  ),
                )
              }
            />
          </div>
        )}
        <p className="muted small">
          {tr(
            "Enable ahead of time; applications are accepted only within this window.",
          )}
        </p>
        <fieldset className="settings-card form-stack">
          <legend>{tr("Registration window & enablement")}</legend>
          <label className="check-field">
            <input
              type="checkbox"
              checked={configured}
              onChange={(e) => setConfigured(e.target.checked)}
            />
            <span>{tr("Configure registration window")}</span>
          </label>
          {configured && (
            <>
              <ZonedDateInput
                label={tr("Registration opens")}
                value={opensAt}
                timeZone={e.timeZone}
                onChange={setOpens}
                onValidityChange={setOpensValid}
              />
              <ZonedDateInput
                label={tr("Registration closes")}
                value={closesAt}
                timeZone={e.timeZone}
                onChange={setCloses}
                onValidityChange={setClosesValid}
              />
              {blockers.length > 0 && (
                <aside className="registration-blockers">
                  <strong>{tr("Before enabling registration")}</strong>
                  <ul>
                    {blockers.map((message) => (
                      <li key={message}>{tr(message)}</li>
                    ))}
                  </ul>
                </aside>
              )}
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={!enabled && blockers.length > 0}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span>{tr("Enable registration during this window")}</span>
              </label>
            </>
          )}
        </fieldset>
        <>
          <fieldset className="settings-card form-stack" disabled={!configured}>
            <legend>{tr("Withdrawal deadline")}</legend>
            <div className="form-stack">
              <ZonedDateInput
                label={tr("Withdrawal deadline")}
                value={withdrawUntil}
                timeZone={e.timeZone}
                onChange={setWithdraw}
                onValidityChange={setWithdrawValid}
                optional
              />
            </div>
          </fieldset>
          <fieldset className="settings-card form-stack" disabled={!configured}>
            <legend>{tr("Application questions")}</legend>
            <label className="field">
              <span>{tr("Public self introduction question")}</span>
              <select
                aria-label={tr("Public self introduction question")}
                value={publicIntroductionQuestionId}
                onChange={(e) =>
                  setPublicIntroductionQuestionId(e.target.value)
                }
              >
                <option value="">{tr("Not set")}</option>
                {questions
                  .filter((q) => q.type === "text")
                  .map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label}
                    </option>
                  ))}
              </select>
            </label>
            <p className="muted small">
              {tr(
                "The selected answer is public for accepted players, including existing submissions. Select only the self introduction intended for publication.",
              )}
            </p>
            <p className="muted small">
              {tr("{count, plural, one {# question} other {# questions}}", {
                count: questions.length,
              })}
            </p>
            <div className="form-stack">
              <p className="muted small">
                {tr(
                  "Collect only necessary information. Saved applications retain their original answers.",
                )}
              </p>
              <p className="muted small">
                {tr(
                  "Changes to question types, options or labels only affect future applications. Submitted answers retain their original version.",
                )}
              </p>
              {questions.map((q, i) => (
                <fieldset
                  className="application-question form-stack"
                  key={q.id}
                >
                  <legend>
                    {tr("Question ")}
                    {i + 1}
                  </legend>
                  <ApplicationQuestionEditor
                    question={q}
                    index={i}
                    onChange={(question) =>
                      setQuestions(
                        questions.map((value, index) =>
                          index === i ? question : value,
                        ),
                      )
                    }
                  />
                  <div className="actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={!i}
                      onClick={() =>
                        setQuestions(
                          questions.map((v, j) =>
                            j === i - 1
                              ? questions[i]
                              : j === i
                                ? questions[i - 1]
                                : v,
                          ),
                        )
                      }
                    >
                      {tr("Move question ")}
                      {i + 1} {tr(" up")}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setQuestions(questions.filter((_, j) => j !== i))
                      }
                    >
                      {tr("Remove question ")}
                      {i + 1}
                    </button>
                  </div>
                </fieldset>
              ))}
              <button
                type="button"
                className="secondary"
                disabled={questions.length >= 16}
                onClick={() =>
                  setQuestions([
                    ...questions,
                    {
                      id: `question_${crypto.randomUUID().slice(0, 8)}`,
                      label: "",
                      required: false,
                      type: "text",
                      maxLength: 500,
                    },
                  ])
                }
              >
                {tr("Add question")}
              </button>
            </div>
          </fieldset>
        </>
        <Save
          data={data}
          saved={saved}
          action="registration"
          fields={{
            registration: configured
              ? {
                  enabled,
                  opensAt,
                  closesAt,
                  withdrawUntil,
                  questions,
                  publicIntroductionQuestionId: questions.some(
                    (q) =>
                      q.id === publicIntroductionQuestionId &&
                      q.type === "text",
                  )
                    ? publicIntroductionQuestionId
                    : null,
                }
              : null,
          }}
          label={tr("Save registration settings")}
          disabled={
            configured &&
            (questions.some(
              (question) => !questionSchema.safeParse(question).success,
            ) ||
              !opensValid ||
              !closesValid ||
              !withdrawValid ||
              (enabled && blockers.length > 0))
          }
        />
      </section>
    </ReadOnlyFields>
  );
}
function Schedule({ data, saved }: EditorProps) {
  const tr = useAppTranslations();

  const [schedule, setSchedule] = useState(
    data.edition.schedule.map((s, id) => ({ ...s, id })),
  );
  const nextId = useRef(schedule.length);
  const [invalid, setInvalid] = useState<Record<number, boolean>>({});
  return (
    <ReadOnlyFields>
      <section className="panel form-stack">
        <h2>{tr("Tournament milestones")}</h2>
        <p className="muted small">
          {tr("Leave unconfirmed dates blank for TBA.")}
        </p>
        {schedule.map((s, i) => (
          <fieldset key={s.id} className="form-stack">
            <legend>
              {tr("Milestone ")}
              {i + 1}
            </legend>
            <label className="field">
              <span>
                {tr("Milestone ")}
                {i + 1} {tr(" label")}
              </span>
              <input
                maxLength={200}
                value={s.label}
                onChange={(e) =>
                  setSchedule(
                    schedule.map((v, j) =>
                      j === i ? { ...v, label: e.target.value } : v,
                    ),
                  )
                }
              />
            </label>
            <ZonedDateInput
              label={tr("Milestone {value0} time", { value0: i + 1 })}
              onValidityChange={(valid) =>
                setInvalid((old) =>
                  old[s.id] === !valid ? old : { ...old, [s.id]: !valid },
                )
              }
              value={s.at}
              timeZone={data.edition.timeZone}
              optional
              onChange={(at) =>
                setSchedule(
                  schedule.map((v, j) => (j === i ? { ...v, at } : v)),
                )
              }
            />
            <div className="actions">
              <button
                type="button"
                className="secondary"
                disabled={!i}
                onClick={() =>
                  setSchedule(
                    schedule.map((v, j) =>
                      j === i - 1 ? schedule[i] : j === i ? schedule[i - 1] : v,
                    ),
                  )
                }
              >
                {tr("Move milestone ")}
                {i + 1} {tr(" up")}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setSchedule(schedule.filter((_, j) => i !== j))}
              >
                {tr("Remove milestone ")}
                {i + 1}
              </button>
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={schedule.length >= 64}
          onClick={() =>
            setSchedule([
              ...schedule,
              { label: "", at: null, id: nextId.current++ },
            ])
          }
        >
          {tr("Add milestone")}
        </button>
        <Save
          data={data}
          saved={saved}
          action="schedule"
          fields={{
            schedule: schedule.map(({ label, at }) => ({ label, at })),
          }}
          disabled={schedule.some((s) => invalid[s.id])}
          label={tr("Save milestones")}
        />
      </section>
    </ReadOnlyFields>
  );
}
function Publication({
  data,
  saved,
  canDeleteDraft,
}: EditorProps & { canDeleteDraft: boolean }) {
  const tr = useAppTranslations();
  const router = useRouter();
  const [confirmSlug, setConfirmSlug] = useState("");

  return (
    <ReadOnlyFields>
      <section className="panel form-stack">
        <h2>{tr("Publication")}</h2>
        <p className="notice">
          {data.edition.published
            ? tr(
                "Unpublishing hides tournament information and pauses registration. Existing competition records are preserved.",
              )
            : tr(
                "Publishing makes approved information public. Registration stays paused until explicitly enabled in Registration settings.",
              )}
        </p>
        <ConfirmMutation
          label={
            data.edition.published
              ? tr("Unpublish tournament")
              : tr("Publish tournament")
          }
          title={
            data.edition.published
              ? tr("Hide this tournament?")
              : tr("Publish this tournament?")
          }
          description={tr(
            "Review tournament identity, public wording and the effect on visibility before confirming.",
          )}
          url={`/api/admin/tournaments/${data.edition.slug}`}
          payload={{
            action: "publication",
            expectedRevision: data.revision,
            confirmed: true,
            published: !data.edition.published,
          }}
          onSuccess={() => {
            saved("Publication updated.");
          }}
        />
        <p className="muted small">
          {tr(
            "Historical tournaments are retained. Mark an edition Completed in General settings; use visibility controls to archive it privately.",
          )}
        </p>
        {canDeleteDraft && isBlankTournamentDraft(data.edition) && (
          <ConfirmMutation
            label={tr("Delete unused draft")}
            title={tr("Delete this unused draft?")}
            description={tr(
              "Only blank drafts that have never been used can be deleted. Saved history is retained; the draft will disappear from tournament pages.",
            )}
            url={`/api/admin/tournaments/${data.edition.slug}/delete-draft`}
            payload={{
              expectedRevision: data.revision,
              confirmed: true,
              confirmSlug,
            }}
            canConfirm={confirmSlug === data.edition.slug}
            onError={saved}
            onSuccess={() => router.replace("/admin/tournaments")}
          >
            <p>
              {data.edition.name} · {data.edition.slug}
            </p>
            <label className="field">
              <span>{tr("Type the draft slug to confirm")}</span>
              <input
                autoComplete="off"
                value={confirmSlug}
                onChange={(event) => setConfirmSlug(event.target.value)}
              />
            </label>
          </ConfirmMutation>
        )}
      </section>
    </ReadOnlyFields>
  );
}
export function TournamentEditor({
  data,
  canDeleteDraft = false,
}: {
  data: Workspace;
  canDeleteDraft?: boolean;
}) {
  const tr = useAppTranslations();

  const id = useId();
  const router = useRouter();
  const requested = useSearchParams().get("section");
  const section =
    requested &&
    ["general", "registration", "rules", "schedule", "publication"].includes(
      requested,
    )
      ? requested
      : "general";
  const [message, setMessage] = useState("");
  const props = { data, saved: setMessage };
  return (
    <div className="tournament-settings">
      <WorkspaceTabs
        appearance="line"
        id={id}
        label={tr("Tournament settings")}
        value={section}
        items={[
          { value: "general", label: "General" },
          { value: "registration", label: "Registration" },
          { value: "rules", label: "Rules & eligibility" },
          { value: "schedule", label: "Milestones" },
          { value: "publication", label: "Publication" },
        ]}
        onChange={(next) => {
          router.replace(
            `/admin/tournaments/${data.edition.slug}/settings?section=${next}`,
            { scroll: false },
          );
          setMessage("");
        }}
      />
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${section}`}
        tabIndex={0}
      >
        {message && (
          <p role="status" className="notice">
            {tr(message)}
          </p>
        )}
        <div hidden={section !== "general"}>
          <General
            key={JSON.stringify({
              name: data.edition.name,
              summary: data.edition.summary,
              status: data.edition.status,
              season: data.edition.season,
              timeZone: data.edition.timeZone,
              branding: data.edition.branding,
              defaultAppearance: data.edition.defaultAppearance,
            })}
            {...props}
          />
        </div>
        <div hidden={section !== "registration"}>
          <Registration
            key={JSON.stringify(data.edition.registration)}
            {...props}
          />
        </div>
        <div hidden={section !== "rules"}>
          <Rules
            key={JSON.stringify([
              data.edition.rules,
              data.edition.eligibility,
              data.edition.automaticEligibility,
            ])}
            {...props}
          />
        </div>
        <div hidden={section !== "schedule"}>
          <Schedule key={JSON.stringify(data.edition.schedule)} {...props} />
        </div>
        <div hidden={section !== "publication"}>
          <Publication
            key={String(data.edition.published)}
            {...props}
            canDeleteDraft={canDeleteDraft}
          />
        </div>
      </div>
    </div>
  );
}
