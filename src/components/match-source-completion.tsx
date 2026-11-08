"use client";

import { InfoNote } from "@/components/info-note";

import { ReadOnlyFields } from "./staff-read-only";
import { useEffect, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { MatchImportPreviewResponse } from "@/lib/match-result-write-contracts";
import { formatDate } from "@/lib/editions";
import { ConfirmMutation } from "./confirm-mutation";
export function MatchSourceCompletion({
  slug,
  fixtureId,
  canManage,
}: {
  slug: string;
  fixtureId: string;
  canManage: boolean;
}) {
  const tr = useAppTranslations();
  const [match, setMatch] = useState("");
  const [data, setData] = useState<MatchImportPreviewResponse | null>(null);
  const [home, setHome] = useState(""),
    [away, setAway] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [requestKey, setKey] = useState(() => crypto.randomUUID());
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const url = `/api/admin/tournaments/${slug}/matches/${fixtureId}/imports`;
  async function preview() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setData(null);
    try {
      const response = await fetch(`${url}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "The action could not be completed.");
      if (controller.signal.aborted) return;
      setData(result);
      setHome(result.suggested.homeTeamId ?? "");
      setAway(result.suggested.awayTeamId ?? "");
      setKey(crypto.randomUUID());
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "The action could not be completed.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <ReadOnlyFields>
      <section
        className="form-stack match-source-completion"
        aria-label={tr("MP source preview")}
      >
        <p className="muted small">
          {tr(
            "MP data is a completion preview only. Confirm teams, then submit for review and Admin approval before publication.",
          )}
        </p>
        <p className="muted small">
          {tr("Reporting needs two finalized, published teams.")}
        </p>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void preview();
          }}
        >
          <label className="field">
            <span>{tr("osu! MP link or match ID")}</span>
            <input
              maxLength={250}
              value={match}
              placeholder="https://osu.ppy.sh/community/matches/…"
              onChange={(e) => {
                request.current?.abort();
                setMatch(e.target.value);
                setData(null);
                setBusy(false);
                setError("");
              }}
            />
          </label>
          <div className="actions">
            <button disabled={busy || !match.trim()}>
              {busy ? tr("Loading…") : tr("Preview MP source")}
            </button>
          </div>
        </form>
        {error && (
          <p role="alert" className="notice error-text">
            {tr(error)}
          </p>
        )}
        {data && (
          <div className="form-stack">
            <h2>{data.source.match.title || `MP #${data.source.match.id}`}</h2>
            <a
              className="text-link"
              href={`https://osu.ppy.sh/community/matches/${data.source.match.id}`}
              target="_blank"
              rel="noreferrer"
            >
              {tr("MP #")}
              {data.source.match.id}
            </a>
            <dl className="source-match-facts">
              <div>
                <dt>{tr("Fixture label")}</dt>
                <dd>{data.fixture.label}</dd>
              </div>
              <div>
                <dt>{tr("Scheduled date and time")}</dt>
                <dd>
                  {tr(
                    formatDate(
                      data.fixture.scheduledAt,
                      data.fixture.timeZone,
                      tr.locale,
                    ),
                  )}
                </dd>
              </div>
              <div>
                <dt>{tr("Actual match starts")}</dt>
                <dd>
                  {tr(
                    formatDate(
                      data.source.match.startTime,
                      data.fixture.timeZone,
                      tr.locale,
                    ),
                  )}
                </dd>
              </div>
              <div>
                <dt>{tr("Actual match ends")}</dt>
                <dd>
                  {tr(
                    formatDate(
                      data.source.match.endTime,
                      data.fixture.timeZone,
                      tr.locale,
                    ),
                  )}
                </dd>
              </div>
            </dl>
            <InfoNote>
              <p className="muted small">
                {tr("Actual match times do not overwrite the scheduled time.")}
              </p>
            </InfoNote>
            {data.source.warnings.map((warning, i) => (
              <p className="notice small" key={i}>
                {warning}
              </p>
            ))}
            {!data.unique && (
              <p className="notice small">
                {tr(
                  "Team matching is ambiguous. Select teams explicitly and review unmatched players.",
                )}
              </p>
            )}
            <div className="form-grid">
              {(["home", "away"] as const).map((side) => (
                <label className="field" key={side}>
                  <span>
                    {side === "home" ? tr("Home team") : tr("Away team")}
                  </span>
                  <select
                    aria-label={
                      side === "home" ? tr("Home team") : tr("Away team")
                    }
                    value={side === "home" ? home : away}
                    disabled={
                      !canManage ||
                      Boolean(
                        side === "home"
                          ? data.fixture.homeTeamId
                          : data.fixture.awayTeamId,
                      )
                    }
                    onChange={(e) =>
                      (side === "home" ? setHome : setAway)(e.target.value)
                    }
                  >
                    <option value="">{tr("Team TBD")}</option>
                    {data.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <details>
              <summary>{tr("Players and game scores")}</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{tr("Player")}</th>
                      <th>{tr("Teams")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attribution.map((p) => (
                      <tr key={p.osuId}>
                        <th>{p.osuId}</th>
                        <td>
                          {p.teamIds
                            .map(
                              (id) => data.teams.find((t) => t.id === id)?.name,
                            )
                            .join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.source.games.map((game) => (
                <div key={game.id} className="source-game">
                  <h3>
                    #{game.id} · {game.beatmap?.title ?? game.beatmapId ?? "—"}
                  </h3>
                  <p className="muted small">{game.problems.join(" · ")}</p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>{tr("Player")}</th>
                          <th>{tr("Score")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {game.scores.map((s, i) => (
                          <tr key={i}>
                            <th>{s.osuId ?? "—"}</th>
                            <td>{s.total ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </details>
            {canManage && (
              <div className="actions">
                <ConfirmMutation
                  loadingFeedback="button"
                  label={tr("Confirm teams & import source")}
                  title={tr("Confirm teams & import source")}
                  description={tr(
                    "MP data is a completion preview only. Confirm teams, then submit for review and Admin approval before publication.",
                  )}
                  url={url}
                  canConfirm={Boolean(home && away && home !== away)}
                  payload={{
                    match,
                    requestKey,
                    expectedVersion: data.expectedVersion,
                    expectedFixtureVersion: data.expectedFixtureVersion,
                    confirmed: true,
                    completion: {
                      homeTeamId: home,
                      awayTeamId: away,
                      sourceFingerprint: data.source.fingerprint,
                    },
                  }}
                  onError={setError}
                >
                  <p>{data.fixture.label}</p>
                  <p>
                    {data.teams.find((t) => t.id === home)?.name ??
                      tr("Team TBD")}{" "}
                    {tr(" vs")}{" "}
                    {data.teams.find((t) => t.id === away)?.name ??
                      tr("Team TBD")}
                  </p>
                </ConfirmMutation>
              </div>
            )}
          </div>
        )}
      </section>
    </ReadOnlyFields>
  );
}
