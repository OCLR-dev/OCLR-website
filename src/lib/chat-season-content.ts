import { artworkSources } from "./chat-artwork";
import { registrationCount } from "./chat-registration";
import type { Edition } from "./editions";
import { publicEditionSummary } from "./editions";
import {
  chatDirectoryPlayers,
  chatPlayerDirectorySources,
} from "./chat-player-directory";
import { publishedTeams } from "./team-reads";
import { publicDraft } from "./draft-reads";
import { publicArchiveStatistics } from "./archive-statistics-reads";
import { publicSeasonSeries } from "./ratings";
import { archiveSeasonSeries } from "./season-series-source";
import { rateSeasonSeries } from "./season-series-model";
import { publicAwards } from "./award-reads";
import { publicCompetition } from "./public-competition";
import { publicBracket } from "./brackets";
import { publicStaff } from "./public-staff";
import { pickemEnabled, pickemRead } from "./pickem";
import { HttpError } from "./http-error";
import { matches, poolSources } from "./chat-competition-sources";
import {
  publishedRuleChapters,
  ruleExcerpts,
  type ChatSource,
} from "./chat-retrieval";
import { tournamentTimeline } from "./tournament-timeline";
import { informationPreview } from "./tournament-information";

export const chatCollections = [
  "overview",
  "rules",
  "players",
  "teams",
  "draft",
  "matches",
  "mappools",
  "statistics",
  "bracket",
  "awards",
  "staff",
  "pickem",
  "artwork",
] as const;
export type ChatCollection = (typeof chatCollections)[number];

export async function seasonContent(
  e: Edition,
  collection: ChatCollection,
): Promise<ChatSource[]> {
  const base = "/tournaments/" + e.slug;
  const archive = e.archive;
  const rows: ChatSource[] = [];
  const add = (path: string, title: string, facts: unknown) => {
    const text = typeof facts === "string" ? facts : JSON.stringify(facts);
    for (let start = 0; start < text.length; start += 1200)
      rows.push({
        url: path.startsWith("/players/") ? path : base + path,
        title,
        text: text.slice(start, start + 1200),
      });
  };
  switch (collection) {
    case "overview": {
      add(
        "",
        e.name,
        [e.name, e.status, publicEditionSummary(e.summary), e.timeZone]
          .filter(Boolean)
          .join(" · "),
      );
      if (archive) {
        if (archive.season) add("", e.name, archive.season);
        add("", e.name + " · season overview", {
          teams: archive.teams.length,
          players: archive.players.length,
          matches: archive.matches.length,
          pools: archive.pools.length,
        });
      }
      if (!archive) {
        const preview = informationPreview(e.slug);
        const schedule =
          preview?.schedule ??
          tournamentTimeline(e, (label) => label, "en").schedule;
        for (const row of schedule)
          add(
            "#schedule",
            row.event,
            row.date + " · " + (preview?.timeZone ?? e.timeZone),
          );
        for (const prize of preview?.prizes ?? [])
          add("", prize.placing, prize.reward);
      }
      break;
    }
    case "rules": {
      const rules = ruleExcerpts(publishedRuleChapters(e));
      if (rules.length) return rules;
      for (const fact of archive?.sourceFacts ?? [])
        if (fact.category === "rules") add("/rules", fact.label, fact.text);
      break;
    }
    case "players": {
      const total = await registrationCount(e);
      if (total) rows.push(total.source);
      const players = await chatDirectoryPlayers(e);
      rows.push(...chatPlayerDirectorySources(e.slug, players));
      for (const player of players)
        add(`/players/${player.id}?edition=${e.slug}`, player.name, {
          category: "player",
          ...player,
        });
      break;
    }
    case "teams": {
      if (archive) {
        for (const t of archive.teams)
          add("/teams/" + t.id, t.name, {
            category: "team",
            members: archive.players
              .filter((p) => p.teamId === t.id)
              .map((p) => [p.username, p.role]),
          });
      } else {
        for (const t of await publishedTeams(e.slug))
          add("/teams/" + t.id, t.name, {
            category: "team",
            captain: t.captainName,
            members: t.members?.map((p) => p.username),
            coaches: t.coaches.map((p) => p.username),
          });
      }
      break;
    }
    case "draft": {
      if (archive) {
        const players = new Map(
          archive.players.map((p) => [p.osuId, p.username]),
        );
        const teams = new Map(archive.teams.map((t) => [t.id, t.name]));
        for (const p of archive.picks)
          add("/draft", "Draft · " + players.get(p.osuId), {
            player: players.get(p.osuId),
            round: p.round,
            pick: p.pick,
            team: teams.get(p.teamId),
          });
        if (archive.draftMode === "final-tiers")
          for (const p of archive.players)
            add("/draft", p.username, {
              draft: "final tier",
              tier: p.tier,
              team: p.teamId && teams.get(p.teamId),
            });
      } else {
        const draft = await publicDraft(e.slug);
        if (draft) {
          add("/draft", "Draft", {
            state: draft.state,
            turn: draft.turnIndex + 1,
            total: draft.turnCount,
          });
          for (const p of draft.picks)
            add("/draft", "Draft · " + p.player.username, {
              pick: p.turnIndex + 1,
              player: p.player.username,
              team: p.team.name,
            });
          for (const p of draft.pool ?? [])
            add("/draft", p.username, "Published draft pool");
        }
      }
      break;
    }
    case "matches":
      for (const m of archive?.matches ?? []) {
        add("/matches/" + m.id, m.label, {
          stage: m.stage,
          referee: m.referee,
          streamer: m.streamer,
          commentators: m.commentators,
          bansA: m.bansA,
          bansB: m.bansB,
          mp: m.mpUrls,
          recording: m.vodUrl,
        });
      }
      for (const f of await matches(e))
        add("/matches/" + encodeURIComponent(f.id), f.label + " · " + f.teams, {
          category: "match schedule result",
          teams: f.teams,
          scheduledAt: f.time,
          timeZone: e.timeZone,
          publishedScore: f.score,
          cancelled: f.cancelled,
        });
      break;
    case "artwork":
      return artworkSources(e);
    case "mappools":
      return poolSources(e);
    case "statistics": {
      const published = archive
        ? await publicArchiveStatistics(e.slug).catch((err: unknown) => {
            if (err instanceof HttpError && err.status === 404) return null;
            throw err;
          })
        : null;
      const series = published
        ? archiveSeasonSeries(published)
        : await publicSeasonSeries(e.slug);
      if (!series) break;
      const report = rateSeasonSeries(series);
      if (report.gameCount)
        add("/statistics", "Season statistics", {
          games: report.gameCount,
          scores: report.scoreCount,
          ratedPlayers: report.players.length,
        });
      for (const p of report.players)
        add("/statistics", p.username + " · rating statistics", p);
      if (published) {
        const names = new Map(
          published.players.map((p) => [p.osuId, p.username]),
        );
        for (const p of published.plays)
          add(
            "/statistics",
            [names.get(p.osuId), p.title, p.slot].join(" · "),
            {
              stage: p.stage,
              score: p.score,
              accuracy: p.accuracy,
              combo: p.combo,
              mods: p.mods,
              beatmapId: p.beatmapId,
            },
          );
      } else {
        const names = new Map(
          series.players.map((p) => [p.userId, p.username]),
        );
        for (const g of series.games)
          for (const p of g.scores)
            add(
              "/matches/" + g.fixtureId,
              [names.get(p.userId), g.slot, g.beatmapId].join(" · "),
              { category: "game statistics", game: g.gameId, score: p.total },
            );
      }
      break;
    }
    case "bracket": {
      const b = await publicBracket(e.slug);
      for (const group of b?.groups ?? [])
        for (const round of group.rounds)
          for (const m of round.matches)
            add("/bracket", [group.label, round.label, m.label].join(" · "), {
              category: "bracket",
              teams: m.slots.map((s) => s.label),
              status: m.status,
              scores: m.scores,
              winnerSlot: m.winnerSlot,
            });
      if (!archive) {
        const competition = await publicCompetition(e.slug);
        for (const group of competition?.groups ?? [])
          for (const row of group.rows)
            add("/teams", group.name + " · " + row.team.name, {
              category: "group standings",
              rank: row.rank,
              points: row.points,
              played: row.played,
              wins: row.wins,
              losses: row.losses,
              draws: row.draws,
              mapsWon: row.mapsWon,
              mapsLost: row.mapsLost,
            });
      }
      for (const p of archive?.standings ?? [])
        add(
          "/teams",
          "Standings · " +
            (archive?.teams.find((t) => t.id === p.teamId)?.name ?? p.teamId),
          {
            group: p.group,
            rank: p.rank,
            wins: p.wins,
            losses: p.losses,
            mapsWon: p.mapsWon,
            mapsLost: p.mapsLost,
          },
        );
      for (const p of archive?.finalPlacements ?? [])
        add(
          "/teams/" + p.teamId,
          "Final placement · " +
            archive?.teams.find((t) => t.id === p.teamId)?.name,
          p.placement,
        );
      break;
    }
    case "awards":
      if (!archive)
        for (const r of (await publicAwards(e.slug)) ?? [])
          if (!r.stale) {
            for (const p of r.candidates)
              add("/results/awards?week=" + r.week, p.username, {
                category: "weekly awards",
                week: r.week,
                performance: p.performance,
                appearances: p.appearances,
                awards: (["mvp", "mip", "rookie"] as const).filter((k) =>
                  r[k].includes(p.userId),
                ),
              });
          }
      break;
    case "staff":
      if (archive)
        for (const p of archive.staff)
          add("/staff", p.username, "Staff · " + p.position);
      else
        for (const p of await publicStaff())
          for (const r of p.roles)
            if (!r.edition || r.edition.slug === e.slug)
              add("", p.username, "Staff · " + r.role);
      break;
    case "pickem":
      if (!archive && (await pickemEnabled(e.slug))) {
        const board = await pickemRead(e.slug, null);
        for (const r of board.seasonLeaderboard)
          add("/pickem/leaderboard", r.username, {
            category: "pickem leaderboard",
            rank: r.position,
            points: r.points,
            correct: r.correct,
          });
        for (const c of board.cards)
          add("/pickem", c.roundName + " · " + c.label, {
            category: "pickem",
            home: c.home.name,
            away: c.away.name,
            status: c.status,
            closesAt: c.closesAt,
          });
      }
  }
  return rows;
}
