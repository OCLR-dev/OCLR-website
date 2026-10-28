"use client";
import { LoadingRegion } from "./loading-region";
import { ReadOnlyFields, MutationButton } from "./staff-read-only";
import { useRef, useState } from "react";
import Link from "next/link";
import { useAppTranslations } from "@/i18n/shared";
import type { StatisticsWorkspace } from "@/lib/archive-statistics";
import { canExcludeStatisticsScore } from "@/lib/archive-statistics-model";
import { ConfirmMutation } from "./confirm-mutation";
type Review = StatisticsWorkspace["reviews"][number];
function SourceReview({
  review,
  pools,
  busy,
  saving,
  canReviewExceptions,
  save,
}: {
  review: Review;
  pools: StatisticsWorkspace["pools"];
  busy: boolean;
  saving: boolean;
  canReviewExceptions: boolean;
  save: (body: Record<string, unknown>) => Promise<void>;
}) {
  const tr = useAppTranslations();
  const [poolId, setPool] = useState(review.poolId);
  const [included, setIncluded] = useState(
    review.games.filter((g) => g.included).map((g) => g.game.id),
  );
  const [allowUnlistedMaps, setAllowUnlisted] = useState(
    review.allowUnlistedMaps,
  );
  const [excludedScores, setExcludedScores] = useState(review.excludedScores);
  const [rosterTeamGames, setRosterTeamGames] = useState(
    review.rosterTeamGames,
  );
  const [technicalAdjudication, setTechnicalAdjudication] = useState(
    review.technicalAdjudication,
  );
  const exclusionsChanged =
    JSON.stringify(excludedScores) !== JSON.stringify(review.excludedScores);
  const poolChanged =
    poolId !== review.poolId ||
    allowUnlistedMaps !== review.allowUnlistedMaps ||
    exclusionsChanged ||
    JSON.stringify(rosterTeamGames) !==
      JSON.stringify(review.rosterTeamGames) ||
    technicalAdjudication !== review.technicalAdjudication;
  return (
    <ReadOnlyFields>
      <section className="statistics-review stack">
        <h3>MP {review.mpId}</h3>
        <a href={"https://osu.ppy.sh/community/matches/" + review.mpId}>
          {tr("Open MP history")}
        </a>
        {!review.complete && (
          <p className="notice">
            {tr("Complete, closed MP history is required.")}
          </p>
        )}
        {review.warnings.map((w) => (
          <p className="muted" key={w}>
            {tr(w)}
          </p>
        ))}
        <label className="field">
          <span>{tr("Recorded mappool")}</span>
          <select
            aria-label={tr("Recorded mappool")}
            value={poolId}
            disabled={busy}
            onChange={(e) => {
              setPool(e.target.value);
              setIncluded([]);
            }}
          >
            <option value="">
              {tr("MP beatmaps; historical mappool unavailable")}
            </option>
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={allowUnlistedMaps}
            disabled={busy}
            onChange={(e) => {
              setAllowUnlisted(e.target.checked);
              setIncluded([]);
            }}
          />
          {tr(
            "I reviewed the MP beatmaps because the historical mappool is incomplete.",
          )}
        </label>
        {(canReviewExceptions || review.technicalAdjudication) && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={technicalAdjudication}
              disabled={busy || !canReviewExceptions}
              onChange={(e) => {
                setTechnicalAdjudication(e.target.checked);
                setIncluded([]);
              }}
            />
            {tr(
              "Organizer confirmed technical adjudication. Keep the recorded series score; statistics use only actual MP scores.",
            )}
          </label>
        )}
        {poolChanged && (
          <p role="status">
            {tr("Save review settings before choosing games.")}
          </p>
        )}
        <p className="muted">
          {tr(
            "Select official scoring games only. Exclude warmups, aborted games and superseded replays.",
          )}
        </p>
        <p className="muted">
          {tr(
            "Exclude zero-score lobby records only after confirming that the user did not play. Keep genuine failed scores.",
          )}
        </p>
        <div className="actions">
          <MutationButton
            type="button"
            className="secondary"
            disabled={busy || poolChanged}
            onClick={() =>
              setIncluded(
                review.games
                  .filter((g) => !g.issues.length)
                  .map((g) => g.game.id),
              )
            }
          >
            {tr("Select eligible games")}
          </MutationButton>
          <MutationButton
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => setIncluded([])}
          >
            {tr("Clear selection")}
          </MutationButton>
        </div>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label={tr("Review MP games")}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">{tr("Include")}</th>
                <th scope="col">{tr("Game")}</th>
                <th scope="col">{tr("Beatmap")}</th>
                <th scope="col">{tr("Score records")}</th>
              </tr>
            </thead>
            <tbody>
              {review.games.map(({ game, issues, nonParticipantIds }) => (
                <tr key={game.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={tr("Include game") + " " + game.id}
                      checked={included.includes(game.id)}
                      disabled={busy || poolChanged || issues.length > 0}
                      onChange={(e) =>
                        setIncluded(
                          e.target.checked
                            ? [...included, game.id]
                            : included.filter((id) => id !== game.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    {game.id}
                    <br />
                    <small>{game.startTime}</small>
                    {canReviewExceptions &&
                      (rosterTeamGames.includes(game.id) ||
                        issues.includes(
                          "Team colors do not identify both recorded teams.",
                        )) && (
                        <label className="checkbox-field">
                          <input
                            type="checkbox"
                            disabled={busy}
                            aria-label={
                              tr("Use verified roster teams") + " " + game.id
                            }
                            checked={rosterTeamGames.includes(game.id)}
                            onChange={(e) => {
                              setRosterTeamGames(
                                e.target.checked
                                  ? [...rosterTeamGames, game.id]
                                  : rosterTeamGames.filter(
                                      (id) => id !== game.id,
                                    ),
                              );
                              setIncluded([]);
                            }}
                          />
                          {tr(
                            "I verified team membership by UID despite incorrect lobby colors.",
                          )}
                        </label>
                      )}
                  </td>
                  <td>
                    {game.beatmap?.artist} {game.beatmap?.title}
                    <br />
                    <a href={"https://osu.ppy.sh/beatmaps/" + game.beatmapId}>
                      #{game.beatmapId}
                    </a>
                    {issues.map((s) => (
                      <p className="muted" key={s}>
                        {tr(s)}
                      </p>
                    ))}
                  </td>
                  <td>
                    <details>
                      <summary>
                        {game.scores.length} · {tr("Players")}
                      </summary>
                      {game.scores.map((s, i) => (
                        <p className="statistics-game-score" key={i}>
                          <span>
                            {tr("osu! ID")} {s.osuId ?? "—"}
                          </span>
                          <span>{s.team ?? "—"}</span>
                          <span>{s.total?.toLocaleString() ?? "—"}</span>
                          <span>
                            {s.accuracy === null
                              ? "—"
                              : (s.accuracy * 100).toFixed(2) + "%"}
                          </span>
                          <span>{s.mods.join(" ") || "NM"}</span>
                          {(canExcludeStatisticsScore(s) ||
                            (canReviewExceptions &&
                              nonParticipantIds.includes(s.osuId!))) && (
                            <label className="checkbox-field">
                              <input
                                type="checkbox"
                                aria-label={
                                  tr("Exclude score") +
                                  " " +
                                  game.id +
                                  " · " +
                                  s.osuId
                                }
                                checked={excludedScores.some(
                                  (e) =>
                                    e.gameId === game.id && e.osuId === s.osuId,
                                )}
                                disabled={busy}
                                onChange={(e) => {
                                  setExcludedScores(
                                    e.target.checked
                                      ? [
                                          ...excludedScores,
                                          {
                                            gameId: game.id,
                                            osuId: s.osuId!,
                                            ...(!canExcludeStatisticsScore(s)
                                              ? {
                                                  reason:
                                                    "non-participant" as const,
                                                }
                                              : {}),
                                          },
                                        ]
                                      : excludedScores.filter(
                                          (v) =>
                                            v.gameId !== game.id ||
                                            v.osuId !== s.osuId,
                                        ),
                                  );
                                  setIncluded([]);
                                }}
                              />
                              {canExcludeStatisticsScore(s)
                                ? tr("Exclude score")
                                : tr(
                                    "I verified this user did not play for either team. Exclude this lobby record.",
                                  )}
                            </label>
                          )}
                        </p>
                      ))}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MutationButton
          type="button"
          aria-busy={saving}
          disabled={busy}
          onClick={() =>
            void save({
              action: "review",
              mpId: review.mpId,
              expectedVersion: review.version,
              poolId,
              included,
              allowUnlistedMaps,
              excludedScores,
              rosterTeamGames,
              technicalAdjudication,
            })
          }
        >
          {tr("Save statistics review")}
        </MutationButton>
      </section>
    </ReadOnlyFields>
  );
}
export function StatisticsManager({
  initial,
}: {
  initial: StatisticsWorkspace;
}) {
  const tr = useAppTranslations();
  const [data, setData] = useState(initial),
    [fixtureId, setFixture] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [errors, setErrors] = useState<string[]>([]);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const stop = useRef(false);
  const url = "/api/admin/tournaments/" + data.slug + "/statistics";
  async function load(id: string) {
    const response = await fetch(url + "?fixture=" + encodeURIComponent(id));
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setData(result);
    return result as StatisticsWorkspace;
  }
  async function post(body: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setData(result);
    return result as StatisticsWorkspace;
  }
  async function save(body: Record<string, unknown>) {
    if (busy) return;
    setActiveAction("review:" + body.mpId);
    setBusy(true);
    setErrors([]);
    setMessage("");
    try {
      await post(body);
      setMessage(tr("Statistics draft saved."));
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  }
  async function importSources(ids: number[]) {
    if (busy) return;
    setActiveAction("import");
    setBusy(true);
    setErrors([]);
    stop.current = false;
    let current = data;
    const failures: string[] = [];
    try {
      for (const [i, mpId] of ids.entries()) {
        if (stop.current) break;
        setMessage(
          tr("Importing MP") +
            " " +
            mpId +
            " · " +
            (i + 1) +
            " / " +
            ids.length,
        );
        try {
          current = await post({
            action: "import",
            mpId,
            expectedVersion:
              current.summaries.find((s) => s.mpId === mpId)?.version ?? 0,
          });
        } catch (e) {
          failures.push("MP " + mpId + ": " + tr((e as Error).message));
        }
      }
      setMessage(
        stop.current
          ? tr("Import stopped. Saved progress is retained.")
          : tr("Import complete. Review each match before publishing."),
      );
      if (fixtureId) await load(fixtureId);
    } catch {
      failures.push(tr("Connection interrupted. Reload before retrying."));
    } finally {
      setBusy(false);
      setErrors(failures);
    }
  }
  const fixture = data.fixtures.find((f) => f.id === fixtureId);
  const versions = Object.fromEntries(
    data.summaries
      .filter((s) => s.fixtureId === fixtureId)
      .map((s) => [String(s.mpId), s.version]),
  );
  const missing = data.fixtures
    .flatMap((f) => f.mpIds)
    .filter((id) => !data.summaries.some((s) => s.mpId === id && !s.stale));
  return (
    <div className="stack statistics-workspace">
      {busy &&
        activeAction !== "import" &&
        activeAction !== "publication-load" && <LoadingRegion />}
      <p className="muted">
        {tr(
          "Import MP history into a private statistics draft, review scoring games, then approve and publish. Existing match results stay unchanged.",
        )}
      </p>
      <div className="actions">
        <Link href={"/tournaments/" + data.slug + "/statistics"}>
          {tr("Open public statistics")}
        </Link>
        <MutationButton
          type="button"
          disabled={busy || !missing.length}
          onClick={() => void importSources(missing)}
        >
          {tr("Import missing MP histories")} ({missing.length})
        </MutationButton>
        {busy && (
          <MutationButton
            type="button"
            className="secondary"
            onClick={() => {
              stop.current = true;
            }}
          >
            {tr("Stop after current MP")}
          </MutationButton>
        )}
      </div>
      <p role="status">{message}</p>
      {errors.length > 0 && (
        <ul role="alert" className="notice">
          {errors.map((e) => (
            <li key={e}>{tr(e)}</li>
          ))}
        </ul>
      )}
      <label className="field">
        <span>{tr("Match")}</span>
        <select
          aria-label={tr("Match")}
          value={fixtureId}
          disabled={busy}
          onChange={(e) => {
            const id = e.target.value;
            setFixture(id);
            setErrors([]);
            setMessage("");
            setActiveAction("load");
            setBusy(true);
            void load(id)
              .catch((error) => setErrors([error.message]))
              .finally(() => setBusy(false));
          }}
        >
          <option value="">{tr("Select a match")}</option>
          {data.fixtures.map((f) => (
            <option key={f.id} value={f.id}>
              {f.stage} · {f.label} · {f.teams.join(" / ")} ·{" "}
              {f.score?.join(" : ")}
            </option>
          ))}
        </select>
      </label>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={tr("MP import coverage")}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">{tr("Round")}</th>
              <th scope="col">{tr("Match")}</th>
              <th scope="col">{tr("MP link")}</th>
              <th scope="col">{tr("Import status")}</th>
              <th scope="col">{tr("Publication")}</th>
              <th scope="col">{tr("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {data.fixtures.flatMap((f) =>
              f.mpIds.map((mpId) => {
                const s = data.summaries.find((s) => s.mpId === mpId);
                return (
                  <tr key={mpId}>
                    <td>{f.stage}</td>
                    <td>{f.label}</td>
                    <td>
                      <a href={"https://osu.ppy.sh/community/matches/" + mpId}>
                        {mpId}
                      </a>
                    </td>
                    <td>
                      {s
                        ? s.stale
                          ? tr("Archive changed")
                          : tr("Imported")
                        : tr("Not imported")}
                    </td>
                    <td>
                      {s?.publishedAt ? tr("Published") : tr("Unpublished")}
                      {s?.publishedAt && s.changes && (
                        <small>{tr("Unpublished changes")}</small>
                      )}
                    </td>
                    <td>
                      <MutationButton
                        className="secondary"
                        type="button"
                        disabled={busy}
                        onClick={() => void importSources([mpId])}
                      >
                        {s ? tr("Refresh MP") : tr("Import MP")}
                      </MutationButton>
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      {fixture && (
        <section className="stack">
          <h2>
            {fixture.label} · {fixture.teams.join(" / ")} ·{" "}
            {fixture.score?.join(" : ")}
          </h2>
          {data.reviews.map((review) => (
            <SourceReview
              key={review.mpId + ":" + review.version}
              review={review}
              pools={data.pools}
              busy={busy}
              saving={busy && activeAction === "review:" + review.mpId}
              canReviewExceptions={data.canPublish}
              save={save}
            />
          ))}
          {data.blockers.length > 0 && (
            <ul className="notice">
              {data.blockers.map((s) => (
                <li key={s}>{tr(s)}</li>
              ))}
            </ul>
          )}
          {data.canPublish && (
            <div className="actions">
              <ConfirmMutation
                label={tr("Approve & publish statistics")}
                title={tr("Approve & publish statistics")}
                description={tr(
                  "Publish reviewed scoring games. Every MP link must be imported. Keep the recorded result, including any explicitly confirmed technical adjudication.",
                )}
                url={url}
                payload={{
                  action: "publish",
                  fixtureId,
                  expectedVersions: versions,
                  confirmed: true,
                }}
                disabled={busy || data.blockers.length > 0}
                onSuccess={async () => {
                  setBusy(true);
                  setActiveAction("publication-load");
                  setMessage("");
                  try {
                    await load(fixtureId);
                  } catch (error) {
                    setErrors([(error as Error).message]);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <ConfirmMutation
                label={tr("Withdraw statistics")}
                title={tr("Withdraw statistics")}
                description={tr(
                  "Hide this match's published statistics. Its historical result remains visible.",
                )}
                url={url}
                payload={{
                  action: "withdraw",
                  fixtureId,
                  expectedVersions: versions,
                  confirmed: true,
                }}
                disabled={
                  busy ||
                  !data.summaries.some(
                    (s) => s.fixtureId === fixtureId && s.publishedAt,
                  )
                }
                onSuccess={async () => {
                  setBusy(true);
                  setActiveAction("publication-load");
                  setMessage("");
                  try {
                    await load(fixtureId);
                  } catch (error) {
                    setErrors([(error as Error).message]);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
