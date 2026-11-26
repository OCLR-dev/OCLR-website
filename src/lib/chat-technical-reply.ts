import type { AppTranslator } from "@/i18n/translate";
import { publicOrigin, type Feature } from "./beatmap-similarity-model";
import type { AnalysisResult } from "./chat-technical-analysis";

type Citation = { title: string; url: string };

function plain(text: string) {
  return text.replace(/\s+/g, " ").replace(/([\\*_[\]<>])/g, "\\$1");
}

function featureNames(tr: AppTranslator): Record<Feature, string> {
  return {
    stars: tr("Star rating"),
    bpm: "BPM",
    duration: tr("Length"),
    ar: "AR",
    od: "OD",
    cs: "CS",
    hp: "HP",
    aim: tr("Aim difficulty"),
    speed: tr("Speed difficulty"),
    reading: tr("Reading difficulty"),
    rhythmChangeShare: tr("Rhythm variation"),
    sustainedDensity: tr("Sustained note density"),
  };
}

export function formatTechnicalReply(
  result: AnalysisResult,
  tr: AppTranslator,
) {
  const sources: Citation[] = [];
  function cite(title: string, url: string) {
    // Public source links use the current website origin, including local previews.
    const target = new URL(url, publicOrigin);
    const href =
      target.origin === publicOrigin
        ? target.pathname + target.search
        : target.href;
    const existing = sources.findIndex((source) => source.url === href);
    if (existing >= 0) return "[" + (existing + 1) + "]";
    sources.push({ title, url: href });
    return "[" + sources.length + "]";
  }
  const n = new Intl.NumberFormat(tr.locale, { maximumFractionDigits: 3 });
  function measurement(feature: Feature, value: number) {
    return n.format(value) + (feature === "duration" ? " s" : "");
  }

  function pools() {
    return ["S9", "S10"]
      .map((edition) =>
        cite(
          tr("Published {edition} mappools", { edition }),
          "/tournaments/" + edition.toLowerCase() + "/mappools",
        ),
      )
      .join("");
  }

  if (result.status === "needs-input")
    return {
      sources,
      text:
        result.intent.kind === "beatmap"
          ? tr(
              "To find similar beatmaps, give one beatmap ID (BID) and a specific mod combination. For example, BID 3786810, MOD NM.",
            )
          : tr(
              "For strengths and practice recommendations, give one numeric osu! user ID (UID). For example, UID 10260284.",
            ),
    };
  if (result.status === "unavailable")
    return {
      sources,
      text: tr(
        "This analysis needs published S9 and S10 data, which is currently unavailable. Please try again when both seasons are available.",
      ),
    };
  if (result.status === "map-missing")
    return {
      sources,
      text:
        tr(
          "I could not verify enough published S9 and S10 beatmap data for BID {bid} with {mod}. Try a BID and mod combination from those mappools.",
          {
            bid: String(result.bid),
            mod: result.mod,
          },
        ) +
        " " +
        pools(),
    };

  const names = featureNames(tr);
  if (result.status === "maps") {
    const { report } = result;
    const { bid, mod } = report.input;
    const scope = pools();
    if (!report.vector.length)
      return {
        sources,
        text:
          tr(
            "BID {bid} with {mod} has a verified beatmap, but there are no other comparable published beatmaps in S9 and S10.",
            { bid: String(bid), mod },
          ) +
          " " +
          scope,
      };
    const seed = report.input.sources[0];
    const lines = [
      tr(
        "BID {bid} · {mod}. Showing {shown, number} of {candidates, number} comparable beatmaps from the published S9 and S10 mappools.",
        {
          bid: String(bid),
          mod,
          shown: report.vector.length,
          candidates: report.candidateGroups,
        },
      ) +
        " " +
        scope +
        cite(seed.edition.toUpperCase() + " · " + seed.pool, seed.url),
      report.profile === "skills"
        ? tr(
            "The vector includes aim and speed difficulty alongside the basic beatmap attributes.",
          )
        : "",
      "",
      ...report.vector.map((map) => {
        const differences = map.differences
          .map(
            ({ feature, delta }) =>
              names[feature] +
              " " +
              (delta >= 0 ? "+" : "−") +
              n.format(Math.abs(delta)) +
              (feature === "duration" ? " s" : ""),
          )
          .join(" · ");
        const source = map.sources[0];
        return (
          map.rank +
          ". **" +
          plain(map.title ?? "BID " + map.bid) +
          "** (BID " +
          map.bid +
          ") · " +
          differences +
          " " +
          cite(source.edition.toUpperCase() + " · " + source.pool, source.url)
        );
      }),
      "",
      tr(
        "The star rating and BPM baseline has {overlap, number} beatmaps in common with this list.",
        { overlap: report.overlap },
      ),
    ];
    return { sources, text: lines.join("\n") };
  }

  const { report } = result;
  const scope = report.sources
    .map((source) =>
      cite(
        tr("Published {edition} results", {
          edition: source.edition.toUpperCase(),
        }),
        source.statisticsUrl,
      ),
    )
    .join("");
  const profile = report.sources.findLast((source) => source.username);
  const identity = profile
    ? plain(profile.username!) + " (UID " + report.osuId + ")"
    : "UID " + report.osuId;
  const lines = [
    "**" +
      identity +
      "** " +
      (profile ? cite(tr("Public player profile"), profile.profileUrl) : ""),
    tr(
      "S9 and S10 sample. {games, number} of {published, number} published plays are comparable, covering {maps, number} beatmaps across {fixtures, number} matches.",
      {
        games: report.usable.games,
        published: report.publishedPlays,
        maps: report.usable.beatmaps,
        fixtures: report.usable.fixtures,
      },
    ) +
      " " +
      scope,
    "",
  ];
  if (report.status === "insufficient-samples") {
    lines.push(
      tr(
        "There are too few comparable published plays to identify strengths or recommend practice beatmaps for this UID.",
      ),
    );
    return { sources, text: lines.join("\n") };
  }
  lines.push(
    tr(
      "A relative score of 1.00 matches the median of other players in the same game, beatmap, complete mod combination and scoring mode.",
    ),
    "",
  );

  type Assessment = (typeof report.assessments)[number];
  function evidenceLine(row: Assessment) {
    const evidence = row.evidence[0];
    return (
      "- " +
      tr(
        "{mod} · {feature} ≥ {cutoff}. {highGames, number} plays on {highMaps, number} beatmaps vs {otherGames, number} plays on {otherMaps, number} beatmaps. Relative medians {high} vs {other}.",
        {
          mod: row.mod,
          feature: names[row.feature],
          cutoff: measurement(row.feature, row.cutoff),
          highGames: row.high.games,
          highMaps: row.high.beatmaps,
          otherGames: row.other.games,
          otherMaps: row.other.beatmaps,
          high: n.format(row.high.medianPeerRatio!),
          other: n.format(row.other.medianPeerRatio!),
        },
      ) +
      (evidence
        ? " " +
          cite(
            evidence.edition.toUpperCase() + " · " + evidence.fixtureId,
            evidence.fixtureUrl,
          )
        : "")
    );
  }
  const strengths = report.assessments
    .filter((row) => row.classification === "relative-strength")
    .sort((a, b) => b.gap! - a.gap!)
    .slice(0, 2);
  const weaknesses = report.assessments
    .filter((row) => row.classification === "practice-opportunity")
    .sort((a, b) => a.gap! - b.gap!)
    .slice(0, 3);
  if (strengths.length)
    lines.push(
      "**" + tr("Relative strengths") + "**",
      ...strengths.map(evidenceLine),
      "",
    );
  if (weaknesses.length)
    lines.push(
      "**" + tr("Practice priorities") + "**",
      ...weaknesses.map(evidenceLine),
      "",
    );
  if (!strengths.length && !weaknesses.length)
    lines.push(
      tr(
        "Comparable groups did not show a large enough difference to identify a clear strength or practice priority.",
      ),
      "",
    );

  const practice = report.recommendations.flatMap((goal) =>
    goal.steps.flatMap(({ step, candidate }) => {
      if (!candidate) return [];
      const source = candidate.sources[0];
      return [
        "- " +
          tr(
            "{step} · BID {bid} with {mod} · {feature} {value} meets the {cutoff} target. Star rating {stars} vs {referenceStars} for the published reference beatmap.",
            {
              step:
                step === "foundation"
                  ? tr("Starter beatmap")
                  : tr("Similar difficulty"),
              bid: String(candidate.bid),
              mod: goal.mod,
              feature: names[goal.feature],
              value: measurement(goal.feature, candidate.targetFeature!),
              cutoff: measurement(goal.feature, goal.minimumTargetFeature),
              stars: n.format(candidate.values.stars!),
              referenceStars: n.format(goal.reason.anchorStars),
            },
          ) +
          " " +
          [
            cite(tr("osu! beatmap"), candidate.beatmapUrl),
            cite(
              source.edition.toUpperCase() + " · " + source.pool,
              source.url,
            ),
            cite(
              goal.anchor.edition.toUpperCase() + " · " + goal.anchor.fixtureId,
              goal.anchor.fixtureUrl,
            ),
          ].join(""),
      ];
    }),
  );
  if (practice.length)
    lines.push("**" + tr("Recommended practice beatmaps") + "**", ...practice);
  else if (weaknesses.length)
    lines.push(
      tr(
        "I found no published practice beatmap matching the supported mod, feature and star rating ranges.",
      ),
    );
  return { sources, text: lines.join("\n").trimEnd() };
}
