import type { AppTranslator } from "@/i18n/translate";
import { publicOrigin, type Feature } from "./beatmap-similarity-model";
import type {
  AnalysisResult,
  TechnicalCoverage,
} from "./chat-technical-analysis";

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

  type Player = Extract<AnalysisResult, { status: "player" }>["report"];
  const list = new Intl.ListFormat(tr.locale, { style: "short" });
  function label(season: TechnicalCoverage["seasons"][number]) {
    return /^s\d+$/i.test(season.slug)
      ? season.slug.toUpperCase()
      : plain(season.name);
  }
  function coverageLines(coverage: TechnicalCoverage, player?: Player) {
    const lines: string[] = [];
    if (coverage.seasons.length) {
      lines.push(
        tr("Seasons in this analysis are {seasons}.", {
          seasons: list.format(coverage.seasons.map(label)),
        }),
      );
    }
    if (coverage.unavailable.length) {
      lines.push(
        tr("No published data is available for {seasons}.", {
          seasons: list.format(
            coverage.unavailable.map((slug) =>
              /^s\d+$/i.test(slug) ? slug.toUpperCase() : plain(slug),
            ),
          ),
        }),
      );
    }
    for (const season of coverage.seasons) {
      const edition = label(season);
      if (player) {
        const sample = player.seasons.find(
          (entry) => entry.edition === season.slug,
        );
        if (!sample) {
          lines.push(
            "- " +
              tr("{edition} · Published per-beatmap results are unavailable.", {
                edition,
              }),
          );
        } else {
          lines.push(
            "- " +
              tr(
                "{edition} · {games, number} of {published, number} published plays are comparable, on {maps, number} beatmaps.",
                {
                  edition,
                  games: sample.usable.games,
                  published: sample.publishedPlays,
                  maps: sample.usable.beatmaps,
                },
              ) +
              " " +
              cite(
                tr("Published {edition} results", { edition }),
                sample.statisticsUrl,
              ),
          );
        }
      } else if (!season.slots) {
        lines.push(
          "- " + tr("{edition} · No published mappool slots.", { edition }),
        );
      } else {
        lines.push(
          "- " +
            tr("{edition} · {maps, number} comparable beatmap difficulties.", {
              edition,
              maps: season.comparableMaps ?? 0,
            }) +
            " " +
            cite(
              tr("Published {edition} mappools", { edition }),
              "/tournaments/" + season.slug + "/mappools",
            ),
        );
      }
    }
    return lines;
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
      text: [
        tr("Published data for this analysis is currently unavailable."),
        ...(result.coverage ? coverageLines(result.coverage) : []),
      ].join("\n"),
    };
  if (result.status === "map-missing")
    return {
      sources,
      text: [
        tr(
          "I could not verify enough published beatmap data for BID {bid} with {mod} in this scope.",
          {
            bid: String(result.bid),
            mod: result.mod,
          },
        ),
        ...coverageLines(result.coverage),
      ].join("\n"),
    };

  const names = featureNames(tr);
  if (result.status === "maps") {
    const { report } = result;
    const { bid, mod } = report.input;
    const scope = coverageLines(result.coverage);
    if (!report.vector.length)
      return {
        sources,
        text: [
          tr(
            "I found BID {bid} with {mod}, but no other comparable published beatmaps in this scope.",
            { bid: String(bid), mod },
          ),
          ...scope,
        ].join("\n"),
      };
    const seed = report.input.sources[0];
    const lines = [
      tr(
        "BID {bid} · {mod}. Showing {shown, number} of {candidates, number} comparable published beatmaps.",
        {
          bid: String(bid),
          mod,
          shown: report.vector.length,
          candidates: report.candidateGroups,
        },
      ) +
        " " +
        cite(seed.edition.toUpperCase() + " · " + seed.pool, seed.url),
      report.profile === "skills"
        ? tr(
            "The vector includes aim and speed difficulty alongside the basic beatmap attributes.",
          )
        : "",
      ...scope,
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
      "{games, number} of {published, number} published plays are comparable, covering {maps, number} beatmaps across {fixtures, number} matches.",
      {
        games: report.usable.games,
        published: report.publishedPlays,
        maps: report.usable.beatmaps,
        fixtures: report.usable.fixtures,
      },
    ),
    ...coverageLines(result.coverage, report),
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
