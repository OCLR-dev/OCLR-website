"use client";

import { InfoNote } from "@/components/info-note";

import {
  ReadOnlyFields,
  StaffReadOnlyContext,
  useStaffReadOnly,
} from "./staff-read-only";

import { useAppTranslations } from "@/i18n/shared";

import Link from "next/link";
import { useState } from "react";
import type { MatchReview } from "@/lib/results";
import type { GameDecision } from "@/lib/match-model";
import { previewMatch } from "@/lib/match-scoring";
import { ConfirmMutation } from "./confirm-mutation";

function Operation({
  label,
  action,
  data,
  slug,
  extra = {},
  onError,
}: {
  label: string;
  action: string;
  data: MatchReview;
  slug: string;
  extra?: Record<string, unknown>;
  onError: (message: string) => void;
}) {
  const tr = useAppTranslations();

  const [requestKey, setKey] = useState(() => crypto.randomUUID());
  const [decisionNote, setDecisionNote] = useState("");
  const needsExplanation = action === "reject" || action === "void";
  return (
    <ConfirmMutation
      loadingFeedback="button"
      canConfirm={!needsExplanation || Boolean(decisionNote.trim())}
      label={label}
      title={label}
      description={tr("Fixture: {value0}. {value1}", {
        value0: data.context.fixture.label,
        value1:
          action === "approve_publish" ||
          action === "publish" ||
          action === "void"
            ? "This changes public results and dependent standings or bracket slots. Review every dependent fixture before confirming."
            : "Review the selected result proposal before confirming.",
      })}
      url={`/api/admin/tournaments/${slug}/matches/${data.context.fixture.id}/results`}
      payload={{
        action,
        requestKey,
        expectedVersion: data.context.result?.version ?? 0,
        expectedFixtureVersion: data.context.fixture.version,
        confirmed: true,
        ...(needsExplanation ? { decisionNote } : {}),
        ...extra,
      }}
      onSuccess={() => {
        setKey(crypto.randomUUID());
        onError("");
      }}
      onError={onError}
    >
      {needsExplanation && (
        <label className="field">
          <span>
            {action === "reject"
              ? tr("Proposal rejection explanation")
              : tr("Result withdrawal explanation")}
          </span>
          <textarea
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            maxLength={1000}
            required
          />
        </label>
      )}
    </ConfirmMutation>
  );
}
function SourceReview({
  data,
  slug,
  onError,
}: {
  data: MatchReview;
  slug: string;
  onError: (message: string) => void;
}) {
  const tr = useAppTranslations();

  const source = data.source!;
  const exhibition = data.context.round.stage === "exhibition";
  const [decisions, setDecisions] = useState<Record<number, GameDecision>>({});
  const [rulesConfirmed, setRules] = useState(false);
  const [sourceConfirmed, setSource] = useState(false);
  const [publicNote, setNote] = useState("");
  const list = Object.values(decisions);
  const preview = previewMatch(source, data.context, list);
  const teamName = (id: string | null) =>
    data.context.teams.find((t) => t.id === id)?.name ?? "Unresolved";
  function update(id: number, value: Partial<GameDecision>) {
    setDecisions((old) => ({
      ...old,
      [id]: {
        ...(old[id] ?? {
          gameId: id,
          included: false,
          reason: "",
          complianceConfirmed: false,
          substitutions: [],
        }),
        ...value,
      },
    }));
  }
  return (
    <ReadOnlyFields>
      <section className="section-space stack" aria-labelledby="games-heading">
        <div>
          <h2 id="games-heading">{tr("Review every game")}</h2>
          <p className="muted">
            {tr(
              "Include valid games and explicitly exclude warmups, rematches or invalid games with a reason. Raw provider scores cannot be edited here.",
            )}
          </p>
        </div>
        {source.warnings.map((warning, i) => (
          <p className="notice" key={i}>
            {warning}
          </p>
        ))}
        {data.diff && (
          <div className="notice">
            <strong>{tr("Upstream changes require review")}</strong>
            <p>
              {tr("Added games: ")}
              {data.diff.added.join(", ") || tr("None")}
              {tr(". Removed games:")}{" "}
              {data.diff.removed.join(", ") || tr("None")}
              {tr(". Changed games:")}{" "}
              {data.diff.changed.join(", ") || tr("None")}.
            </p>
          </div>
        )}
        {preview.games.map((g, i) => {
          const decision = decisions[g.game.id];
          const unknown = data.context.fixture.openExhibition
            ? []
            : g.players.filter(
                (p) =>
                  p.osuId &&
                  !data.context.teams.some((t) =>
                    t.members.some((m) => m.osuId === p.osuId),
                  ),
              );
          return (
            <details className="panel" key={g.game.id} open={undefined}>
              <summary>
                {g.exMode && <span className="badge">{tr("EX mode")}</span>}
                <strong>
                  {tr("Game ")}
                  {i + 1} ·{" "}
                  {g.game.beatmap?.title ??
                    (g.game.beatmapId
                      ? tr("Beatmap {value0}", { value0: g.game.beatmapId })
                      : tr("Unavailable beatmap"))}
                </strong>{" "}
                ·{" "}
                {decision
                  ? decision.included
                    ? tr("Included")
                    : tr("Excluded")
                  : tr("Unreviewed")}
              </summary>
              <div className="form-stack">
                <p className="muted">
                  {tr("Game ID ")}
                  {g.game.id} · {g.game.teamType ?? tr("Unknown team mode")} ·{" "}
                  {g.game.scoringType ?? tr("Unknown scoring")} ·{" "}
                  {g.game.problems.includes("Game mod data is unavailable.")
                    ? tr("Unavailable")
                    : g.game.mods.join(", ") || "NM"}
                </p>
                {g.game.beatmapId && (
                  <a
                    className="text-link"
                    href={`https://osu.ppy.sh/beatmaps/${g.game.beatmapId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tr("Open beatmap ↗")}
                  </a>
                )}
                <div
                  className="table-scroll"
                  role="region"
                  tabIndex={0}
                  aria-label={tr(
                    "Recorded game {value0} scores; scroll horizontally",
                    { value0: i + 1 },
                  )}
                >
                  <table>
                    <caption>
                      {tr("Recorded player scores for game ")}
                      {i + 1}
                    </caption>
                    <thead>
                      <tr>
                        <th>{tr("osu! player")}</th>
                        <th>{tr("Team evidence")}</th>
                        <th>{tr("Score")}</th>
                        <th>{tr("Lobby side")}</th>
                        <th>{tr("Passed")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.players.map((p, n) => (
                        <tr key={`${p.osuId}-${n}`}>
                          <td>
                            {data.context.teams
                              .flatMap((t) => t.members)
                              .find((m) => m.osuId === p.osuId)?.username ??
                              (data.context.fixture.openExhibition
                                ? source.players?.find(
                                    (player) => player.osuId === p.osuId,
                                  )?.username
                                : undefined) ??
                              tr("osu! ID {value0}", {
                                value0: p.osuId ?? "unavailable",
                              })}
                          </td>
                          <td>
                            {p.teamId
                              ? `${teamName(p.teamId)} (${p.evidence})`
                              : tr("Unresolved")}
                          </td>
                          <td>
                            {p.total?.toLocaleString() ?? tr("Unavailable")}
                          </td>
                          <td>{p.team ?? tr("Unknown")}</td>
                          <td>
                            {p.passed === null
                              ? tr("Unknown")
                              : p.passed
                                ? tr("Yes")
                                : tr("No")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {g.exMode && <p className="badge">{tr("EX mode")}</p>}
                <label className="field">
                  <span>
                    {tr("Game ")}
                    {i + 1} {tr(" decision")}
                  </span>
                  <select
                    value={decision ? String(decision.included) : ""}
                    onChange={(e) => {
                      if (!e.target.value) {
                        setDecisions((old) => {
                          const next = { ...old };
                          delete next[g.game.id];
                          return next;
                        });
                      } else
                        update(g.game.id, {
                          included: e.target.value === "true",
                        });
                    }}
                  >
                    <option value="">{tr("Choose after reviewing")}</option>
                    <option value="true">{tr("Include in result")}</option>
                    <option value="false">{tr("Exclude from result")}</option>
                  </select>
                </label>
                {decision &&
                  (!decision.included ||
                    (!exhibition && g.warnings.length > 0)) && (
                    <label className="field">
                      <span>
                        {tr("Game ")}
                        {i + 1}{" "}
                        {decision.included
                          ? tr("scoring decision explanation")
                          : tr("exclusion explanation")}
                      </span>
                      <textarea
                        maxLength={1000}
                        value={decision?.reason ?? ""}
                        onChange={(e) =>
                          update(g.game.id, { reason: e.target.value })
                        }
                      />
                    </label>
                  )}
                {!exhibition && (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={decision?.complianceConfirmed ?? false}
                      onChange={(e) =>
                        update(g.game.id, {
                          complianceConfirmed: e.target.checked,
                        })
                      }
                    />
                    {tr("Game ")}
                    {i + 1}
                    {tr(": I verified mods and the approved tournament rules")}
                  </label>
                )}
                {unknown.map((p) => {
                  const existing = decision?.substitutions.find(
                    (s) => s.osuId === p.osuId,
                  );
                  const replace = (teamId: string, reason: string) =>
                    update(g.game.id, {
                      substitutions: [
                        ...(decision?.substitutions.filter(
                          (s) => s.osuId !== p.osuId,
                        ) ?? []),
                        ...(teamId
                          ? [{ osuId: p.osuId!, teamId, reason }]
                          : []),
                      ],
                    });
                  return (
                    <fieldset key={p.osuId}>
                      <legend>
                        {tr("Non-roster player ")}
                        {p.osuId}
                        {tr(": substitution evidence")}
                      </legend>
                      <InfoNote>
                        <p className="muted">
                          {exhibition
                            ? tr(
                                "Identify the player’s side and give a reason.",
                              )
                            : tr(
                                "Requires a configured substitution policy. This does not change the official roster.",
                              )}
                        </p>
                      </InfoNote>
                      <label className="field">
                        <span>
                          {tr("Confirmed team for osu! ID ")}
                          {p.osuId}
                        </span>
                        <select
                          value={existing?.teamId ?? ""}
                          onChange={(e) =>
                            replace(e.target.value, existing?.reason ?? "")
                          }
                        >
                          <option value="">{tr("Unresolved")}</option>
                          {data.context.teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>
                          {tr("Substitution reason for osu! ID ")}
                          {p.osuId}
                        </span>
                        <input
                          value={existing?.reason ?? ""}
                          maxLength={500}
                          onChange={(e) =>
                            replace(existing?.teamId ?? "", e.target.value)
                          }
                        />
                      </label>
                    </fieldset>
                  );
                })}
                {g.problems.map((p, n) => (
                  <p className="notice error-text" key={n}>
                    {p}
                  </p>
                ))}
                {g.warnings.map((p, n) => (
                  <p className="notice" key={n}>
                    {p}
                  </p>
                ))}
                <p>
                  {tr("Calculated team score: ")}
                  {g.homeScore ?? "—"} : {g.awayScore ?? "—"}.{" "}
                  {g.tied
                    ? tr("Tied game")
                    : g.winnerTeamId
                      ? tr("Winner: {value0}", {
                          value0: teamName(g.winnerTeamId),
                        })
                      : tr("No verified winner")}
                  .
                </p>
              </div>
            </details>
          );
        })}
        <article className="panel stack">
          <h3>{tr("New review preview")}</h3>
          <p className="score">
            {preview.series.homeWins} : {preview.series.awayWins}
          </p>
          <p>
            {preview.series.complete
              ? preview.series.draw
                ? tr("Configured draw")
                : tr("Proposed winner: {value0}", {
                    value0: teamName(preview.series.winnerTeamId),
                  })
              : tr("Series not resolved")}{" "}
            · {preview.series.includedGames} {tr(" included games")}
          </p>
          {preview.blockers.map((b, i) => (
            <p className="notice" key={i}>
              {b}
            </p>
          ))}
          <label className="field">
            <span>
              {tr("Public result note (optional, visible after publication)")}
            </span>
            <textarea
              maxLength={1000}
              value={publicNote}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {!exhibition && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={rulesConfirmed}
                onChange={(e) => setRules(e.target.checked)}
              />
              {tr(
                "I verified the configured scoring rules against the approved OCLR rules",
              )}
            </label>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={sourceConfirmed}
              onChange={(e) => setSource(e.target.checked)}
            />
            {tr(
              "I reviewed the current source snapshot and all reported changes",
            )}
          </label>
          {preview.canSubmit &&
          (exhibition || rulesConfirmed) &&
          sourceConfirmed ? (
            <Operation
              label={tr("Submit proposed result")}
              action="submit"
              data={data}
              slug={slug}
              extra={{
                importId: data.importId,
                decisions: list,
                ...(exhibition ? {} : { rulesConfirmed: true }),
                sourceChangesConfirmed: true,
                publicNote,
              }}
              onError={onError}
            />
          ) : (
            <p className="muted">
              {tr(
                "Complete every game decision, resolve blockers and confirm the review to submit.",
              )}
            </p>
          )}
        </article>
      </section>
    </ReadOnlyFields>
  );
}
export function MatchReviewPanel({
  data,
  slug,
}: {
  data: MatchReview;
  slug: string;
}) {
  const readOnly = useStaffReadOnly() || !data.context.canRecord;
  const tr = useAppTranslations();

  const [match, setMatch] = useState("");

  const [requestKey, setKey] = useState(() => crypto.randomUUID());
  const [notice, setNotice] = useState("");
  const [progression, setProgression] = useState(false);
  const { context } = data;
  const state = context.result;
  const base = `/api/admin/tournaments/${slug}/matches/${context.fixture.id}`;
  return (
    <StaffReadOnlyContext value={readOnly}>
      <div className="stack">
        {notice && (
          <p className="notice error-text" role="alert">
            {tr(notice)}
          </p>
        )}
        <section className="panel form-stack">
          <h2>{tr("Import official multiplayer data")}</h2>
          <p className="muted">
            {tr(
              "Imports stay private until a result is approved and published.",
            )}
          </p>
          <label className="field">
            <span>{tr("osu! MP link or match ID")}</span>
            <input
              type="text"
              disabled={readOnly}
              inputMode="url"
              maxLength={250}
              value={match}
              onChange={(e) => setMatch(e.target.value)}
              placeholder="https://osu.ppy.sh/community/matches/…"
            />
          </label>
          <ConfirmMutation
            requireConfirmation={false}
            label={tr("Retrieve match data")}
            title={tr("Import an official osu! match snapshot")}
            description={tr(
              "The provider snapshot will be stored for staff review. Any existing published result stays unchanged.",
            )}
            url={`${base}/imports`}
            payload={{
              requestKey,
              expectedVersion: state?.version ?? 0,
              expectedFixtureVersion: context.fixture.version,
              match,
              confirmed: true,
            }}
            onSuccess={() => {
              setKey(crypto.randomUUID());
              setNotice("");
            }}
            onError={setNotice}
          />
          <p className="muted">
            {state ? state.state.replaceAll("_", " ") : tr("No report yet")}
          </p>
          {data.sourceError && <p className="notice">{data.sourceError}</p>}
          {data.source && (
            <div>
              <a
                className="text-link"
                href={`https://osu.ppy.sh/community/matches/${data.source.match.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {tr("MP #")}
                {data.source.match.id} ↗
              </a>
              <p>{data.source.match.title}</p>
              <p className="muted">
                {tr(
                  "Lobby titles do not establish official team identity. Retrieved",
                )}{" "}
                {new Date(data.source.fetchedAt).toISOString()} ·{" "}
                {data.source.complete
                  ? tr("Completed source history")
                  : tr("Incomplete / ongoing source")}
              </p>
              <details>
                <summary>{tr("Advanced source details")}</summary>
                <p className="break-anywhere">
                  {tr("Fingerprint: ")}
                  {data.source.fingerprint}
                </p>
                <p>
                  {data.source.pages} {tr(" API pages · ")}
                  {data.source.events.length} {tr("normalized events")}
                </p>
              </details>
            </div>
          )}
        </section>
        <section className="panel stack">
          <h2>
            {context.round.stage === "exhibition"
              ? tr("Exhibition sides")
              : tr("Official teams and scoring rules")}
          </h2>
          {context.teams.map((t) => (
            <div key={t.id}>
              <h3>{t.name}</h3>
              <p>
                {t.members
                  .map((m) => `${m.username} (${m.osuId})`)
                  .join(" · ") ||
                  (context.fixture.openExhibition
                    ? tr(
                        "Open participation; sides follow each game’s recorded red and blue colors.",
                      )
                    : tr("No published roster"))}
              </p>
            </div>
          ))}
          {context.round.stage === "exhibition" ? (
            <p className="muted">
              {tr(
                "Exhibition results sum each side’s recorded MP scores per game and count wins and ties across the games you include.",
              )}
            </p>
          ) : (
            <details>
              <summary>{tr("Configured round scoring rules")}</summary>
              {context.round.scoringRules ? (
                <pre className="rules-json">
                  {JSON.stringify(context.round.scoringRules, null, 2)}
                </pre>
              ) : (
                <p className="notice">
                  {tr(
                    "Awaiting approved scoring configuration. No winner will be assumed.",
                  )}
                </p>
              )}
            </details>
          )}
        </section>
        {data.source && (
          <SourceReview
            key={`${data.importId}-${context.fixture.version}-${context.round.version}-${context.pool?.version ?? 0}`}
            data={data}
            slug={slug}

            onError={setNotice}
          />
        )}
        <section className="panel stack">
          <h2>{tr("Approval and publication")}</h2>
          <p>
            {state?.state === "submitted"
              ? tr("Pending approval")
              : state?.state === "approved" && data.current?.approvedAt
                ? tr("Approved result")
                : data.current
                  ? tr("Draft result")
                  : tr("No proposed result")}{" "}
            · {data.published ? tr("Published result") : tr("Not published")}
          </p>
          {data.current?.proposal && (
            <p>
              {tr("Current proposal: ")}
              {data.current.proposal.series.homeWins} :{" "}
              {data.current.proposal.series.awayWins} ·{" "}
              {data.current.approvedAt
                ? tr("Approved")
                : tr("Awaiting approval")}
            </p>
          )}
          {data.published?.proposal && (
            <p>
              {tr("Published score: ")}
              {data.published.proposal.series.homeWins} :{" "}
              {data.published.proposal.series.awayWins}
              {tr(". It remains visible while a correction is under review.")}
            </p>
          )}
          {data.dependents.length > 0 && (
            <div>
              <h3>
                {tr("Dependent fixtures requiring review after a correction")}
              </h3>
              <ul>
                {data.dependents.map((f) => (
                  <li key={f.id}>
                    <Link
                      className="text-link"
                      href={`/admin/tournaments/${slug}/matches/${f.id}`}
                    >
                      {f.label}
                    </Link>{" "}
                    ·{" "}
                    {f.published
                      ? tr("Published fixture")
                      : tr("Private fixture")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {context.canApprove ? (
            <>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={progression}
                  onChange={(e) => setProgression(e.target.checked)}
                />
                {tr(
                  "I reviewed the effect on dependent fixtures and public standings or brackets",
                )}
              </label>
              <div className="actions">
                {state?.state === "submitted" && (
                  <>
                    {progression && (
                      <Operation
                        label={tr("Approve & publish result")}
                        action="approve_publish"
                        data={data}
                        slug={slug}
                        extra={{
                          revision: state.currentRevision,
                          progressionAcknowledged: true,
                        }}
                        onError={setNotice}
                      />
                    )}
                    <Operation
                      label={tr("Reject proposed result")}
                      action="reject"
                      data={data}
                      slug={slug}
                      extra={{ revision: state.currentRevision }}
                      onError={setNotice}
                    />
                  </>
                )}
                {state?.state === "approved" &&
                  progression &&
                  state.currentRevision !== state.publishedRevision && (
                    <Operation
                      label={tr("Publish approved result")}
                      action="publish"
                      data={data}
                      slug={slug}
                      extra={{
                        revision: state.currentRevision,
                        progressionAcknowledged: true,
                      }}
                      onError={setNotice}
                    />
                  )}
                {state?.publishedRevision && (
                  <Operation
                    label={tr("Unpublish result")}
                    action="unpublish"
                    data={data}
                    slug={slug}

                    onError={setNotice}
                  />
                )}
                {state && state.currentRevision > 0 && progression && (
                  <Operation
                    label={tr("Withdraw official result")}
                    action="void"
                    data={data}
                    slug={slug}
                    extra={{ progressionAcknowledged: true }}
                    onError={setNotice}
                  />
                )}
              </div>
              <p className="muted">
                {tr(
                  "Withdrawing retains the audit trail and source history. It does not award a forfeit or change team rosters. Publish the fixture before publishing its result.",
                )}
              </p>
            </>
          ) : (
            <p className="notice">
              {tr("An Admin must approve and publish submitted results.")}
            </p>
          )}
        </section>
        <section className="section-space">
          <h2>{tr("Review history")}</h2>
          <div className="stack">
            {data.revisions.map((r) => (
              <details className="panel" key={r.revision}>
                <summary>
                  {r.revision === state?.publishedRevision
                    ? tr("Published result")
                    : r.approvedAt
                      ? tr("Approved result")
                      : tr("Submitted result")}{" "}
                  · {new Date(r.createdAt).toISOString()}
                </summary>
                {r.reason && <p>{r.reason}</p>}
                <p>
                  {tr("Submitted by osu! ID ")}
                  {r.createdBy}
                </p>
                {r.proposal && (
                  <p>
                    {tr("Score ")}
                    {r.proposal.series.homeWins} : {r.proposal.series.awayWins}
                  </p>
                )}
                {r.approvedBy && (
                  <p>
                    {tr("Approved by osu! ID ")}
                    {r.approvedBy}
                  </p>
                )}
                <details>
                  <summary>{tr("Technical provenance")}</summary>
                  <p>
                    {tr("Result reference: ")}
                    {r.revision} {tr(" · Scoring release:")}{" "}
                    {r.proposal
                      ? (r.proposal.rulesSnapshot?.version ??
                        tr("Recorded MP scores"))
                      : tr("Unavailable")}
                  </p>
                </details>
              </details>
            ))}
            {!data.revisions.length && (
              <p className="muted">{tr("No results submitted.")}</p>
            )}
          </div>
        </section>
      </div>
    </StaffReadOnlyContext>
  );
}
