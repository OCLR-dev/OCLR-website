"use client";

import { InfoNote } from "@/components/info-note";

import { ReadOnlyFields, useStaffReadOnly } from "./staff-read-only";
import Link from "next/link";
import { useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  historicalArchiveSchema,
  archiveCounts,
  type HistoricalArchive,
} from "@/lib/historical-archive";
import { ConfirmMutation } from "./confirm-mutation";
import { useRouter } from "next/navigation";
import { ArchiveSubstitute } from "./archive-substitute";
import { ArchivePlayerExchange } from "./archive-player-exchange";
import { ArchiveStaffResolver } from "./archive-staff-resolver";
import type { HistoricalSeasonPreview } from "@/lib/historical-season-transfer-contract";
import { s1TierFourSourcePair } from "@/lib/s1-archive";
import { historicalSeasonJsonLimit } from "@/lib/request-body-limits";
import { jsonMutationRequest } from "./json-mutation-request";

function ArchiveIdentityResolver({
  person,
  slug,
  revision,
}: {
  person: NonNullable<HistoricalArchive["unresolvedPlayers"]>[number];
  slug: string;
  revision: number;
}) {
  const tr = useAppTranslations();
  const router = useRouter();
  const [username, setUsername] = useState(person.username);
  const [osuId, setOsuId] = useState("");
  const [source, setSource] = useState("");
  const valid =
    /^\d+$/.test(osuId) &&
    Number(osuId) > 0 &&
    Number(osuId) <= 2147483647 &&
    !!username.trim() &&
    !!source.trim();
  return (
    <section className="panel form-stack">
      <h2>{tr("Resolve archive identity")}</h2>
      <p>
        {person.username} · {person.teamId} · {person.source}
      </p>
      <label className="field">
        <span>{tr("Historical username")}</span>
        <input
          maxLength={300}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>
      <label className="field">
        <span>{tr("osu! ID")}</span>
        <input
          inputMode="numeric"
          value={osuId}
          onChange={(e) => setOsuId(e.target.value)}
        />
      </label>
      <label className="field">
        <span>{tr("Identity confirmation source")}</span>
        <input
          maxLength={160}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      </label>
      <ConfirmMutation
        label={tr("Resolve archive identity")}
        title={tr("Resolve archive identity")}
        description={tr(
          "Link this saved historical identity to the confirmed osu! ID. Published archives show the link immediately; the original roster source and competition records are preserved.",
        )}
        url={`/api/admin/tournaments/${slug}`}
        payload={{
          action: "resolve-archive-identity",
          unresolvedId: person.id,
          username: username.trim(),
          osuId: Number(osuId),
          source: source.trim(),
          expectedRevision: revision,
          confirmed: true,
        }}
        canConfirm={valid}
        disabled={!valid}
        onSuccess={() => router.refresh()}
      >
        <p>
          {person.username !== username.trim() && `${person.username} → `}
          {username.trim()} · {osuId}
        </p>
        <p>{source}</p>
      </ConfirmMutation>
    </section>
  );
}

export function ArchiveImporter({
  slug,
  revision,
  published,
  eligible,
  archive,
}: {
  slug: string;
  revision: number;
  published: boolean;
  eligible: boolean;
  archive?: HistoricalArchive;
}) {
  const tr = useAppTranslations();
  const router = useRouter();
  const readOnly = useStaffReadOnly();
  const transferUrl = `/api/admin/tournaments/${slug}/archive-json`;
  const s1TierFourPair = eligible && archive && s1TierFourSourcePair(archive);
  const pendingMatches =
    archive?.matches.filter(
      (m) => m.review?.status === "pending" && m.review.workingScore,
    ) ?? [];
  const [text, setText] = useState("");
  const [review, setReview] = useState<HistoricalArchive | null>(null);
  const [transfer, setTransfer] = useState<{
    input: unknown;
    preview: HistoricalSeasonPreview;
    revision: number;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const fileReadGeneration = useRef(0);
  const currentTransfer = transfer?.revision === revision ? transfer : null;

  async function validate() {
    const generation = ++fileReadGeneration.current;
    setError("");
    setReview(null);
    setTransfer(null);
    setSaved(false);
    setChecking(true);
    try {
      const bytes = new TextEncoder().encode(text).byteLength;
      if (bytes > historicalSeasonJsonLimit)
        throw new Error(tr("Archive file exceeds the size limit."));
      const input: unknown = JSON.parse(text);
      if (input && typeof input === "object" && "format" in input) {
        const response = await jsonMutationRequest(
          transferUrl,
          {
            action: "preview",
            expectedRevision: revision,
            package: input,
          },
          true,
        );
        const result = await response.json();
        if (generation !== fileReadGeneration.current) return;
        if (!response.ok) {
          setError(tr(result.error ?? "Invalid archive data."));
          return;
        }
        setTransfer({ input, preview: result, revision });
        return;
      }
      if (bytes > 450000)
        throw new Error(tr("Archive file exceeds the size limit."));
      const parsed = historicalArchiveSchema.safeParse(input);
      if (!parsed.success) {
        setError(
          `${tr("Invalid archive data.")} ${parsed.error.issues[0].path.join(".")}: `,
        );
        return;
      }
      if (parsed.data.editionSlug !== slug)
        throw new Error(tr("Archive edition does not match this tournament."));
      setReview(parsed.data);
    } catch (error) {
      if (generation === fileReadGeneration.current)
        setError(
          error instanceof SyntaxError
            ? tr("The request contains invalid JSON.")
            : tr((error as Error).message),
        );
    } finally {
      if (generation === fileReadGeneration.current) setChecking(false);
    }
  }
  const counts =
    currentTransfer?.preview.counts ??
    (review ? archiveCounts(review) : archive ? archiveCounts(archive) : null);
  function archiveSaved() {
    setSaved(true);
    setReview(null);
    setTransfer(null);
    setText("");
  }
  return (
    <ReadOnlyFields>
      <div className="stack">
        {eligible && archive && (
          <ArchiveStaffResolver
            key={revision}
            archive={archive}
            revision={revision}
          />
        )}
        {eligible &&
          archive?.formatVersion === 2 &&
          archive.draftMode === "final-tiers" && (
            <>
              <ArchiveSubstitute archive={archive} revision={revision} />
              <ArchivePlayerExchange
                key={revision}
                archive={archive}
                revision={revision}
              />
            </>
          )}
        {s1TierFourPair && (
          <section className="panel form-stack">
            <p>
              {
                archive?.teams.find((team) => team.id === s1TierFourPair.teamId)
                  ?.name
              }
            </p>
            <ConfirmMutation
              label={tr("Confirm both S1 Tier 4 players")}
              title={tr("Confirm both S1 Tier 4 players")}
              url={`/api/admin/tournaments/${slug}`}
              payload={{
                action: "confirm-s1-tier-four-roster",
                expectedRevision: revision,
                confirmed: true,
              }}
            >
              <ul>
                {s1TierFourPair.people.map((person) => (
                  <li key={person.osuId}>
                    {person.username} · {person.osuId}
                  </li>
                ))}
              </ul>
              <p>{s1TierFourPair.note}</p>
            </ConfirmMutation>
          </section>
        )}
        {eligible &&
          archive?.unresolvedPlayers?.map((person) => (
            <ArchiveIdentityResolver
              key={person.id}
              person={person}
              slug={slug}
              revision={revision}
            />
          ))}
        {pendingMatches.length > 0 && (
          <section className="panel form-stack">
            <h2>{tr("Approve reviewed matches")}</h2>
            <ul>
              {pendingMatches.map((m) => (
                <li key={m.id}>
                  {m.label} · {m.review!.workingScore!.join(" : ")}
                </li>
              ))}
            </ul>
            <ConfirmMutation
              label={tr("Approve reviewed matches")}
              title={tr("Approve reviewed matches")}
              description={tr(
                "Approve these saved historical match scores. Published editions show the approved results immediately; source games are preserved.",
              )}
              url={`/api/admin/tournaments/${slug}`}
              payload={{
                action: "approve-archive-matches",
                matchIds: pendingMatches.map((m) => m.id),
                expectedRevision: revision,
                confirmed: true,
              }}
              onSuccess={() => router.refresh()}
            />
          </section>
        )}
        <p>
          {tr(
            "Import source records into an unpublished, completed edition. Review the saved preview, then publish the tournament separately.",
          )}
        </p>
        <InfoNote>
          <p className="muted">
            {tr(
              "Archive identities do not create accounts, registrations or staff permissions.",
            )}
          </p>
        </InfoNote>
        <Link href={`/admin/tournaments/${slug}/settings`}>
          {tr("Tournament settings")}
        </Link>
        {archive && (
          <Link href={`/admin/tournaments/${slug}/archive/preview`}>
            {tr("Open saved archive preview")}
          </Link>
        )}
        {archive && !readOnly && (
          <a href={transferUrl} download>
            {tr("Download historical season JSON")}
          </a>
        )}
        {(!eligible || published) && (
          <p className="notice">
            {tr(
              "Import archives into an unpublished, completed tournament without registration.",
            )}
          </p>
        )}
        <label className="field">
          <span>{tr("Archive JSON file")}</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              const generation = ++fileReadGeneration.current;
              setText("");
              setReview(null);
              setTransfer(null);
              setChecking(false);
              setSaved(false);
              setError("");
              if (!file) return;
              if (file.size > historicalSeasonJsonLimit) {
                setText("");
                setError(tr("Archive file exceeds the size limit."));
                return;
              }
              try {
                const contents = await file.text();
                if (generation === fileReadGeneration.current)
                  setText(contents);
              } catch {
                if (generation === fileReadGeneration.current)
                  setError(tr("Could not read the archive file."));
              }
            }}
          />
        </label>
        <label className="field">
          <span>{tr("Archive JSON")}</span>
          <textarea
            rows={10}
            value={text}
            onChange={(e) => {
              // Manual edits supersede any file that is still being read.
              fileReadGeneration.current++;
              setText(e.target.value);
              setReview(null);
              setTransfer(null);
              setChecking(false);
              setSaved(false);
              setError("");
            }}
          />
        </label>
        <div className="actions">
          <button
            type="button"
            onClick={validate}
            disabled={!text || checking}
            aria-busy={checking}
          >
            {tr("Validate and review archive")}
          </button>
        </div>
        {error && (
          <p role="alert" className="notice error-text">
            {error}
          </p>
        )}
        {counts && (
          <dl className="archive-counts">
            {[
              [tr("Teams"), counts.teams],
              [tr("Players & coaches"), counts.players],
              [tr("Draft picks"), counts.picks],
              [tr("Recorded results"), counts.results],
              [tr("Unconfirmed records"), counts.incomplete],
              [tr("Mappools"), counts.pools],
              [tr("Maps"), counts.maps],
              ...(currentTransfer
                ? ([
                    [tr("Staff"), currentTransfer.preview.staff],
                    [
                      tr("Bracket matches"),
                      currentTransfer.preview.bracketMatches,
                    ],
                    [tr("MP rooms"), currentTransfer.preview.statistics],
                    [
                      tr("Previous releases"),
                      currentTransfer.preview.releaseEvidence,
                    ],
                  ] as const)
                : []),
            ].map(([label, n]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{n}</dd>
              </div>
            ))}
          </dl>
        )}
        {currentTransfer && (
          <ConfirmMutation
            label={tr("Save archive draft")}
            title={tr("Save archive draft")}
            description={tr(
              "Save the historical season privately. Previous releases are preserved as evidence for review.",
            )}
            url={transferUrl}
            payload={{
              action: "import",
              package: currentTransfer.input,
              expectedRevision: currentTransfer.revision,
              previewToken: currentTransfer.preview.previewToken,
              confirmed: true,
            }}
            compressJson
            disabled={!eligible || published}
            onSuccess={archiveSaved}
          />
        )}
        {review && (
          <section className="stack">
            <h2>{tr("Review source records")}</h2>
            <a href={review.sourceUrl} rel="noreferrer">
              {tr("Original archive spreadsheet")}
            </a>
            <ul>
              {review.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
            <details>
              <summary>{tr("All import fields")}</summary>
              <pre className="archive-json">
                {JSON.stringify(review, null, 2)}
              </pre>
            </details>
            <ConfirmMutation
              label={tr("Save archive draft")}
              title={tr("Save archive draft")}
              description={tr(
                "Save these historical source records privately. This replaces any previous archive draft and does not publish results.",
              )}
              url={`/api/admin/tournaments/${slug}`}
              payload={{
                action: "archive",
                archive: review,
                expectedRevision: revision,
                confirmed: true,
              }}
              disabled={!eligible || published || saved}
              onSuccess={archiveSaved}
            />
          </section>
        )}
        {saved && (
          <p role="status">
            {tr(
              "Archive draft saved. Review the saved preview before publishing.",
            )}
          </p>
        )}
      </div>
    </ReadOnlyFields>
  );
}
