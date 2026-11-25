import { z } from "zod";
import type { Locale } from "../i18n/config";
import type { AppTranslator } from "../i18n/translate";
import { editionSlugSchema } from "../lib/editions";
import { recordedArchiveMatch } from "../lib/historical-archive";
import { parseOsuProfile } from "../lib/osu-profile-model";
import {
  publicReads,
  ReadFailure,
  type Fetch,
  type Fixture,
  type Participation,
} from "./api";
import { botTranslator } from "./messages";

const seasonOption = z.string().trim().toLowerCase().pipe(editionSlugSchema);
const playerOption = z.string().trim().min(1).max(100);
const commandSchema = z.discriminatedUnion("name", [
  z.strictObject({
    name: z.literal("profile"),
    player: playerOption,
    season: seasonOption.optional(),
  }),
  z.strictObject({
    name: z.literal("history"),
    player: playerOption,
    season: seasonOption.optional(),
  }),
  z.strictObject({ name: z.literal("tournament"), season: seasonOption }),
  z.strictObject({ name: z.literal("mra"), player: playerOption }),
]);
export type Command = z.infer<typeof commandSchema>;
const noMentions = { parse: [] as string[] };
type Field = { name: string; value: string };
type Embed = { title: string; description?: string; fields?: Field[] };
export type CommandOutcome =
  "ok" | "missing" | "limited" | "unavailable" | "invalid";

export function problem(
  tr: AppTranslator,
  outcome: Exclude<CommandOutcome, "ok">,
  command?: Command["name"],
) {
  const content =
    outcome === "missing"
      ? tr(command === "tournament" ? "liru_no_tournament" : "liru_no_player")
      : tr(`liru_${outcome}`);
  return { outcome, message: { content, allowed_mentions: noMentions } };
}

const descriptionKeys = {
  profile: "liru_profile_description",
  history: "liru_history_description",
  tournament: "liru_tournament_description",
  mra: "liru_mra_description",
};
type OptionName = "player" | "season";
const options: Record<Command["name"], readonly OptionName[]> = {
  profile: ["player", "season"],
  history: ["player", "season"],
  tournament: ["season"],
  mra: ["player"],
};

function description(key: string) {
  return {
    description: botTranslator("en")(key),
    description_localizations: {
      "zh-CN": botTranslator("zh-Hans")(key),
      "zh-TW": botTranslator("zh-Hant")(key),
    },
  };
}
export function guildCommand() {
  return {
    name: "oclr",
    type: 1,
    ...description("liru_command_description"),
    options: (Object.keys(options) as Command["name"][]).map((name) => ({
      type: 1,
      name,
      ...description(descriptionKeys[name]),
      options: options[name].map((option) => ({
        type: 3,
        name: option,
        ...description(`liru_${option}_option`),
        required: option === "player" || name === "tournament",
        max_length: option === "player" ? 100 : 80,
      })),
    })),
  };
}

const interactionCommand = z.object({
  name: z.literal("oclr"),
  type: z.literal(1),
  options: z.tuple([
    z.object({
      type: z.literal(1),
      name: z.string(),
      options: z
        .array(
          z.object({
            type: z.literal(3),
            name: z.enum(["player", "season"]),
            value: z.string(),
          }),
        )
        .max(2)
        .optional(),
    }),
  ]),
});

export function parseCommand(input: unknown) {
  const parsed = interactionCommand.safeParse(input);
  if (!parsed.success) return null;
  const { name, options: args = [] } = parsed.data.options[0];
  if (new Set(args.map((argument) => argument.name)).size !== args.length)
    return null;
  const command = commandSchema.safeParse({
    name,
    ...Object.fromEntries(args.map(({ name, value }) => [name, value])),
  });
  return command.success ? command.data : null;
}

const safeText = (value: string, max = 95) => {
  const characters = Array.from(value.replace(/[\s\p{Cc}]+/gu, " ").trim());
  const text =
    characters.slice(0, max).join("") + (characters.length > max ? "…" : "");
  return text.replace(/[\\`*_~|[\]<>()]/g, "\\$&");
};
const timestamp = (value: string | null) => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? `<t:${Math.floor(time / 1000)}:f>` : null;
};
const line = (label: string, value: string | null) =>
  value ? `**${label}** · ${value}` : null;
const list = (items: (string | null)[]) => items.filter(Boolean).join("\n");
const link = (label: string, url: string) => `[${label}](${url})`;
const sitePath = (origin: string, path: string) => new URL(path, origin).href;
const editionPath = (season: string) => `/tournaments/${season}`;
const playerPath = (osuId: number, season?: string) =>
  `/players/${osuId}${season ? `?edition=${season}` : ""}`;
const publicLinks = (
  tr: AppTranslator,
  origin: string,
  osuId: number,
  season?: string,
) => link(tr("liru_oclr_profile"), sitePath(origin, playerPath(osuId, season)));

function participationText(row: Participation, tr: AppTranslator) {
  const role = row.captain ? "captain" : (row.role ?? row.participation);
  const roleText: Record<typeof role, string> = {
    captain: "Captain",
    player: tr("Player"),
    coach: tr("Coach"),
    free_agent: tr("Free agent"),
    accepted: tr("liru_accepted"),
    finalized_roster: tr("Player"),
    historical: tr("liru_participant"),
  };
  const names = new Map(
    (row.coachedTeams ?? []).map(({ id, name }) => [id, name]),
  );
  if (row.team) names.set(row.team.id, row.team.name);
  const teams = [...names.values()]
    .slice(0, 3)
    .map((name) => safeText(name, 44));
  const tier =
    row.captain || role === "captain"
      ? null
      : row.tier && row.tier > 0
        ? `${tr("Tier")} ${row.tier}`
        : null;
  return [roleText[role], ...teams, tier].filter(Boolean).join(" · ");
}

function placementText(row: Participation, tr: AppTranslator) {
  const range = row.placingRange;
  if (range) {
    const rank =
      range.start === range.end
        ? String(range.start)
        : `${range.start}–${range.end}`;
    return tr(
      range.tied
        ? "liru_tied_placement"
        : range.official
          ? "liru_placement"
          : "liru_recorded_placement",
      { rank },
    );
  }
  return row.placing
    ? tr("liru_placement", { rank: row.placing })
    : tr("liru_no_placement");
}

function teamResultText(
  match: { id: string; label: string },
  scoreboard: string,
  origin: string,
  season: string,
) {
  const url = sitePath(
    origin,
    `${editionPath(season)}/matches/${encodeURIComponent(match.id)}`,
  );
  return `${link(safeText(match.label, 24), url)} · ${scoreboard}`;
}

async function teamResults(
  rows: Participation[],
  reads: ReturnType<typeof publicReads>,
  tr: AppTranslator,
  origin: string,
  season: string,
) {
  const teamIds = new Set(
    rows.flatMap((row) => [
      row.team?.id,
      ...(row.coachedTeams ?? []).map((team) => team.id),
    ]),
  );
  teamIds.delete(undefined);
  if (!teamIds.size) return null;

  let results: string[];
  if (rows.some((row) => row.participation === "historical")) {
    const archive = await reads.archive(season);
    const teams = new Map(
      archive.teams.map(({ id, name }) => [id, safeText(name, 35)]),
    );
    results = archive.matches
      .filter(
        (match) =>
          recordedArchiveMatch(match) &&
          (teamIds.has(match.teamA) || teamIds.has(match.teamB)) &&
          teams.has(match.teamA) &&
          teams.has(match.teamB),
      )
      .sort(
        (a, b) =>
          (Date.parse(b.scheduledAt ?? "") || 0) -
          (Date.parse(a.scheduledAt ?? "") || 0),
      )
      .slice(0, 3)
      .map((match) => {
        const red = teams.get(match.teamA);
        const blue = teams.get(match.teamB);
        const score =
          match.forfeitWinner === undefined
            ? `${red} ${match.score!.join("–")} ${blue}`
            : `${red} (${tr(match.forfeitWinner === 0 ? "Winner" : "Forfeit")}) · ${blue} (${tr(match.forfeitWinner === 1 ? "Winner" : "Forfeit")})`;
        return teamResultText(match, score, origin, season);
      });
  } else {
    const resultDate = (f: Fixture) =>
      Date.parse(f.scheduledAt ?? f.result!.updatedAt) || 0;
    results = (await reads.fixtures(season))
      .filter(
        (f) =>
          f.publishedAt &&
          f.result &&
          f.stage !== "exhibition" &&
          f.status !== "cancelled" &&
          (teamIds.has(f.home.team?.id) || teamIds.has(f.away.team?.id)),
      )
      .sort((a, b) => resultDate(b) - resultDate(a))
      .slice(0, 3)
      .map((match) => {
        const { home, away, result } = match;
        const red = safeText(home.team?.name ?? home.label, 35);
        const blue = safeText(away.team?.name ?? away.label, 35);
        return teamResultText(
          match,
          `${red} ${result!.homeWins}–${result!.awayWins} ${blue}`,
          origin,
          season,
        );
      });
  }
  const value = results.reduce((text, result) => {
    const next = text ? `${text}\n${result}` : result;
    return next.length <= 1024 ? next : text;
  }, "");
  return {
    name: tr("liru_team_results"),
    value: value || tr("liru_no_team_results"),
  };
}

async function resolvePlayer(
  input: string,
  reads: ReturnType<typeof publicReads>,
) {
  if (/^\d+$/.test(input) || /[/\\?#%]/.test(input)) {
    try {
      return parseOsuProfile(input).osuId;
    } catch {
      throw new ReadFailure("missing");
    }
  }
  if (input.length > 64) throw new ReadFailure("missing");
  return (await reads.name(input)).osuId;
}

type Context = { origin: string; locale: Locale; request: Fetch; now: number };
export async function runCommand(
  command: Command,
  { origin, locale, request, now }: Context,
) {
  const tr = botTranslator(locale);
  const reads = publicReads(origin, AbortSignal.timeout(8_000), request);
  const reply = (embed: Embed) => ({
    outcome: "ok" as const,
    message: { embeds: [embed], allowed_mentions: noMentions },
  });
  try {
    if (command.name === "tournament") {
      const season = command.season;
      const edition = await reads.tournament(season);
      const [state, fixtures] = await Promise.all([
        reads.enrollment(season),
        reads.fixtures(season),
      ]);
      const next = fixtures
        .filter(
          (f) =>
            f.confirmed &&
            f.publishedAt &&
            f.status === "scheduled" &&
            !f.result &&
            f.scheduledAt &&
            Date.parse(f.scheduledAt) > now,
        )
        .sort(
          (a, b) => Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!),
        )[0];
      const base = editionPath(season);
      const hasRules =
        edition.overview.kind === "historical_archive"
          ? Boolean(edition.overview.rulebook)
          : edition.overview.kind === "preview"
            ? edition.overview.document.rules.length > 0
            : Boolean(edition.rules);
      const registration = edition.registration;
      const links = [
        link(tr("liru_tournament_link"), sitePath(origin, base)),
        hasRules ? link(tr("Rules"), sitePath(origin, `${base}#rules`)) : null,
        registration
          ? link(tr("Registration"), sitePath(origin, `${base}/register`))
          : null,
        link(tr("Schedule"), sitePath(origin, `${base}/schedule`)),
      ]
        .filter(Boolean)
        .join(" · ");
      return reply({
        title: safeText(edition.name),
        description: [
          list([
            line(tr("Registration"), tr(`liru_registration_${state}`)),
            registration
              ? line(tr("liru_opens_at"), timestamp(registration.opensAt))
              : null,
            registration
              ? line(tr("liru_closes_at"), timestamp(registration.closesAt))
              : null,
            line(
              tr("liru_next_match"),
              next
                ? `${link(safeText(next.label, 45), sitePath(origin, `${base}/matches/${encodeURIComponent(next.id)}`))} · ${safeText(next.roundName, 50)} · ${timestamp(next.scheduledAt)}`
                : tr("liru_no_next_match"),
            ),
          ]),
          links,
        ].join("\n\n"),
      });
    }

    const osuId = await resolvePlayer(command.player, reads);
    if (command.name === "history") {
      const rows = await reads.participations(osuId, command.season);
      if (!rows.length) throw new ReadFailure("missing");
      const seasons = command.season
        ? [command.season]
        : await reads.recentSeasons(
            new Set(rows.map((row) => row.editionSlug)),
            5,
          );
      if (!seasons.length) throw new ReadFailure("missing");
      const fields = seasons.map((season) => {
        const entries = rows.filter((row) => row.editionSlug === season);
        return {
          name: safeText(entries[0].editionName),
          value: [
            ...new Set(
              entries.map((row) =>
                [
                  participationText(row, tr),
                  placementText(row, tr),
                  row.sourceReference
                    ? safeText(row.sourceReference, 48)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              ),
            ),
          ]
            .slice(0, 2)
            .join("\n"),
        };
      });
      if (command.season) {
        const recent = await teamResults(
          rows,
          reads,
          tr,
          origin,
          command.season,
        );
        if (recent) fields.push(recent);
      }
      const newest = rows.find((row) => row.editionSlug === seasons[0])!;
      return reply({
        title: `${safeText(newest.username, 65)} · ${tr("liru_history_title")}`,
        description: publicLinks(tr, origin, osuId, command.season),
        fields,
      });
    }

    const profile = await reads.profile(
      osuId,
      command.name === "profile" ? command.season : undefined,
    );
    const name = safeText(
      profile.identity.currentUsername ?? profile.identity.username,
      65,
    );
    if (command.name === "mra") {
      const saved = await reads.mra(osuId).catch((error) => {
        if (error instanceof ReadFailure && error.kind === "missing")
          throw new ReadFailure("unavailable");
        throw error;
      });
      const value =
        saved.state === "pending"
          ? tr("liru_mra_pending")
          : saved.mra === null
            ? tr("liru_mra_missing")
            : saved.mra.toFixed(2);
      return reply({
        title: `${name} · ${tr("MRA v4")}`,
        description: [
          list([
            `**${value}**`,
            saved.state === "ready"
              ? line(tr("liru_calculated_at"), timestamp(saved.calculatedAt))
              : null,
          ]),
          [
            publicLinks(tr, origin, osuId),
            link(tr("Ranking"), sitePath(origin, "/ranking/performance")),
          ].join(" · "),
        ].join("\n\n"),
      });
    }

    const snapshot = profile.snapshot;
    const statistics = snapshot?.profile.statistics;
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    const selected = command.season
      ? profile.participation.filter(
          (p) => p.osuId === osuId && p.editionSlug === command.season,
        )
      : [];
    const summary = list([
      line("osu! ID", String(osuId)),
      line("pp", statistics?.pp == null ? null : number.format(statistics.pp)),
      line(
        tr("Global rank"),
        statistics?.globalRank == null
          ? null
          : `#${number.format(statistics.globalRank)}`,
      ),
      snapshot
        ? line(
            tr(snapshot.stale ? "liru_snapshot_stale" : "liru_snapshot_at"),
            timestamp(snapshot.profile.fetchedAt),
          )
        : tr("liru_no_snapshot"),
    ]);
    return reply({
      title: name,
      description: `${summary}\n\n${publicLinks(tr, origin, osuId, command.season)} · ${link(tr("liru_osu_profile"), `https://osu.ppy.sh/users/${osuId}`)}`,
      ...(command.season && {
        fields: [
          {
            name: selected.length
              ? safeText(selected[0].editionName)
              : command.season,
            value: selected.length
              ? [...new Set(selected.map((row) => participationText(row, tr)))]
                  .slice(0, 2)
                  .join("\n")
              : tr("liru_no_participation"),
          },
        ],
      }),
    });
  } catch (error) {
    return problem(
      tr,
      error instanceof ReadFailure ? error.kind : "unavailable",
      command.name,
    );
  }
}
