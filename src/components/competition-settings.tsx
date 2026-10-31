"use client";
import { useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { FixtureWorkspace } from "@/lib/fixtures";
import { ReadOnlyFields } from "./staff-read-only";
import { ConfirmMutation } from "./confirm-mutation";
import { InfoNote } from "./info-note";
import styles from "./competition-settings.module.css";
type Round = FixtureWorkspace["rounds"][number];
export function RoundRules({
  slug,
  entry,
  refereePolicyRevision,
}: {
  slug: string;
  entry: Round;
  refereePolicyRevision?: number;
}) {
  const tr = useAppTranslations();

  const { round, stage } = entry;
  const rules = round.scoringRules;
  const standings = round.standingsRules;
  const [teamType, setTeamType] = useState(rules?.teamType ?? "");
  const enabled = true;
  const [mode, setMode] = useState<string>(rules?.mode ?? "");
  const [scoreType, setScoreType] = useState<string>(rules?.scoringType ?? "");
  const [aggregation, setAggregation] = useState<string>(
    rules?.aggregation ?? "",
  );
  const [players, setPlayers] = useState(String(rules?.playersPerTeam ?? ""));
  const [exPlayers, setExPlayers] = useState(
    String(rules?.exPlayersPerTeam ?? ""),
  );
  const [bestOf, setBestOf] = useState(
    String(rules?.series.type === "first_to" ? rules.series.wins * 2 - 1 : ""),
  );
  const ranked = true;
  const [winPoints, setWinPoints] = useState(
    String(standings?.winPoints ?? ""),
  );
  const [lossPoints, setLossPoints] = useState(
    String(standings?.lossPoints ?? ""),
  );
  const [tiebreakers, setTiebreakers] = useState(
    standings?.tiebreakers.join(", ") ?? "",
  );
  return (
    <ReadOnlyFields>
      <div className="form-stack">
        <p className="notice small">
          {tr(
            "Only save organizer-approved rules. Unconfigured scoring cannot produce an official result; unconfigured standings cannot produce a ranking.",
          )}
        </p>
        <div className={styles.columns}>
          {enabled && (
            <section className="form-stack">
              <h4>{tr("Configure approved scoring rules")}</h4>
              <label className="field">
                <span>{tr("Game mode")}</span>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                >
                  <option value="">{tr("Unconfirmed")}</option>
                  {["osu", "taiko", "fruits", "mania"].map((m) => (
                    <option value={m} key={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <InfoNote>
                <p className="small muted">
                  {tr(
                    "Automatic scoring supports configured roster aggregation with Score or Score v2. Other provider modes require review and cannot silently produce winners.",
                  )}
                </p>
              </InfoNote>
              <label className="field">
                <span>{tr("Multiplayer team mode")}</span>
                <select
                  value={teamType}
                  onChange={(e) => setTeamType(e.target.value)}
                >
                  <option value="">{tr("Unconfirmed")}</option>
                  <option value="team-vs">{tr("Team vs")}</option>
                  <option value="head-to-head">
                    {tr("Head-to-head with explicit roster aggregation")}
                  </option>
                </select>
              </label>
              <label className="field">
                <span>{tr("Scoring type")}</span>
                <select
                  value={scoreType}
                  onChange={(e) =>
                    setScoreType(e.target.value as typeof scoreType)
                  }
                >
                  <option value="">{tr("Unconfirmed")}</option>
                  <option value="score">{tr("Score")}</option>
                  <option value="scorev2">{tr("Score v2")}</option>
                </select>
              </label>
              <label className="field">
                <span>{tr("Team score aggregation")}</span>
                <select
                  value={aggregation}
                  onChange={(e) =>
                    setAggregation(e.target.value as typeof aggregation)
                  }
                >
                  <option value="">{tr("Unconfirmed")}</option>
                  <option value="sum">{tr("Sum")}</option>
                  <option value="average">{tr("Average")}</option>
                </select>
              </label>
              <label className="field">
                <span>{tr("Players per team per game")}</span>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={players}
                  onChange={(e) => setPlayers(e.target.value)}
                />
              </label>
              <label className="field">
                <span>{tr("EX players per team per game")}</span>
                <input
                  type="number"
                  min={1}
                  max={Number(players) || 16}
                  value={exPlayers}
                  onChange={(e) => setExPlayers(e.target.value)}
                />
              </label>
              <label className="field">
                <span>{tr("Best of (BO)")}</span>
                <input
                  type="number"
                  min={1}
                  max={197}
                  step={2}
                  required
                  value={bestOf}
                  onChange={(e) => setBestOf(e.target.value)}
                />
              </label>
              <label className="field">
                <span>{tr("Map wins required")}</span>
                <input
                  type="number"
                  readOnly
                  value={
                    Number(bestOf) >= 1 &&
                    Number(bestOf) <= 197 &&
                    Number(bestOf) % 2 === 1
                      ? (Number(bestOf) + 1) / 2
                      : ""
                  }
                />
              </label>
            </section>
          )}
          {stage === "group" && (
            <section className="form-stack">
              <h4>{tr("Configure approved group ranking rules")}</h4>
              {ranked && (
                <>
                  <label className="field">
                    <span>{tr("Points for a win")}</span>
                    <input
                      type="number"
                      value={winPoints}
                      onChange={(e) => setWinPoints(e.target.value)}
                      min={-100}
                      max={100}
                    />
                  </label>
                  <label className="field">
                    <span>{tr("Points for a loss")}</span>
                    <input
                      type="number"
                      value={lossPoints}
                      onChange={(e) => setLossPoints(e.target.value)}
                      min={-100}
                      max={100}
                    />
                  </label>
                  <label className="field">
                    <span>{tr("Ranking criteria, in order")}</span>
                    <input
                      value={tiebreakers}
                      onChange={(e) => setTiebreakers(e.target.value)}
                      maxLength={100}
                      placeholder={tr("Approved criteria only")}
                    />
                  </label>
                  <InfoNote>
                    <p className="small muted">
                      {tr(
                        "Supported explicit criteria: points, wins, map_difference, maps_won. Separate by commas. Unresolved ties remain tied.",
                      )}
                    </p>
                  </InfoNote>
                </>
              )}
            </section>
          )}
        </div>
        <ConfirmMutation
          canConfirm={
            Number.isInteger(Number(bestOf)) &&
            Number(bestOf) >= 1 &&
            Number(bestOf) <= 197 &&
            Number(bestOf) % 2 === 1
          }
          label={tr("Save approved round rules")}
          title={tr("Confirm competition rules?")}
          description={tr(
            "Save the explicitly configured rules for {value0}. This does not publish any imported score.",
            { value0: round.name },
          )}
          url={`/api/admin/tournaments/${slug}/matches`}
          payload={{
            action: "round_rules",
            roundId: round.id,
            expectedVersion: round.version,
            ...(refereePolicyRevision === undefined
              ? {}
              : { expectedRefereePolicyRevision: refereePolicyRevision }),
            scoringRules: enabled
              ? {
                  mode,
                  teamType,
                  scoringType: scoreType,
                  aggregation,
                  playersPerTeam: Number(players),
                  exPlayersPerTeam: exPlayers.trim() ? Number(exPlayers) : null,
                  series: { type: "first_to", wins: (Number(bestOf) + 1) / 2 },
                  allowSubstitutions: rules?.allowSubstitutions ?? false,
                  allowShortHanded: rules?.allowShortHanded ?? false,
                  failedScorePolicy: "include",
                  tiedMapPolicy: "require_replay",
                }
              : null,
            standingsRules:
              stage === "group" && ranked
                ? {
                    winPoints: winPoints.trim() ? Number(winPoints) : null,
                    lossPoints: lossPoints.trim() ? Number(lossPoints) : null,
                    drawPoints: null,
                    tiebreakers: tiebreakers.split(",").map((v) => v.trim()),
                  }
                : null,
            confirmed: true,
          }}
        />
      </div>
    </ReadOnlyFields>
  );
}
