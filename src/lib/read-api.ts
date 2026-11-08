import { readQuerySchema } from "./read-api-queries";
import { collectionFilters, savedCollectionPage } from "./read-collection";
import { privacyReady } from "./auth/config";
import { PROFILE_TTL_MS } from "./osu-profiles";
import { z } from "zod";
import { DeveloperApiError } from "./developer-api";
import { addressableUsername } from "./player-username";
import {
  missingDeveloperResource,
  readDataResponse,
} from "./developer-api-http";
import { editionSchema } from "./editions";
import { extendedRead } from "./extended-read";
import { extendedResources } from "./extended-read-resources";
import { profileMode } from "./osu-profile-model";
import {
  privateTournamentListModel,
  privateTournamentModel,
  publicPlayerDirectoryModel,
  publicPlayerProfileModel,
  publicSiteModel,
  publicTournamentListModel,
  publicTournamentModel,
  savedProfileModel,
} from "./public-read-models";
import { usernameOwnerSchema } from "./read-api-contract";
import type { ReadPayload } from "./read-api-contract";
import { readApiSpecification } from "./read-api-openapi";
import { readOperations, readSchemas } from "./read-api-operations";
import { readMedia } from "./read-media";
export { collectionPage } from "./read-collection";

function tournamentDeadline(
  rows: readonly {
    registration?: { opensAt: string; closesAt: string; state: string } | null;
  }[],
  asOf: number,
) {
  let next = Infinity;
  for (const { registration } of rows) {
    if (!registration) continue;
    if (registration.state === "unavailable") return 0;
    for (const time of [registration.opensAt, registration.closesAt]) {
      const at = Date.parse(time);
      if (at > asOf) next = Math.min(next, at);
    }
  }
  return next;
}

function playerDeadline(
  rows: readonly { statistics: { state: string; fetchedAt: string | null } }[],
) {
  let next = Infinity;
  for (const { statistics } of rows) {
    if (statistics.state === "unavailable") return 0;
    if (statistics.state === "fresh")
      next = Math.min(
        next,
        Date.parse(statistics.fetchedAt ?? "") + PROFILE_TTL_MS,
      );
  }
  return next;
}
function edition(value: string | undefined) {
  const parsed = editionSchema.shape.slug.safeParse(value);
  if (!parsed.success)
    throw new DeveloperApiError(
      400,
      "INVALID_REQUEST",
      "Choose a valid tournament edition.",
    );
  return parsed.data;
}
function osuId(value: string | undefined) {
  if (
    !value ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  )
    throw new DeveloperApiError(
      400,
      "INVALID_REQUEST",
      "Choose a valid osu! user ID.",
    );
  return Number(value);
}
function mode(query: URLSearchParams) {
  const parsed = profileMode.safeParse(query.get("mode") ?? "osu");
  if (!parsed.success)
    throw new DeveloperApiError(
      400,
      "INVALID_REQUEST",
      "Choose a supported profile ruleset.",
    );
  return parsed.data;
}
export function readApiRoute(request: Request) {
  const path = new URL(request.url).pathname
    .replace(/^\/api\/v1/, "")
    .replace(/\/$/, "");
  if (path === "/openapi.json")
    return readDataResponse(
      request,
      "identity:read",
      async () => ({ data: readApiSpecification() }),
      { anonymous: true, maxBytes: 2097152, rawDocument: true },
    );
  const segments = path.split("/");
  let params: Record<string, string> = {};
  const operation = readOperations.find((operation) => {
    const template = operation.path.split("/");
    if (template.length !== segments.length) return false;
    const found: Record<string, string> = {};
    for (let index = 0; index < template.length; index++) {
      const parameter = /^\{(\w+)\}$/.exec(template[index]);
      if (parameter) {
        try {
          found[parameter[1]] = decodeURIComponent(segments[index]);
        } catch {
          return false;
        }
      } else if (template[index] !== segments[index]) return false;
    }
    params = found;
    return true;
  });
  if (!operation) return missingDeveloperResource(request);
  return readDataResponse<unknown>(
    request,
    operation.scope,
    async (principal, query): Promise<ReadPayload<unknown>> => {
      if (
        operation.additionalScopes?.some(
          (scope) => !principal?.scopes.includes(scope),
        )
      )
        throw new DeveloperApiError(
          403,
          "INSUFFICIENT_SCOPE",
          "This token does not include the required read scope.",
        );
      if (
        !readQuerySchema(operation.id, operation.query).safeParse(
          Object.fromEntries(query),
        ).success
      )
        throw new DeveloperApiError(
          400,
          "INVALID_REQUEST",
          "Choose valid API query parameters.",
        );
      if (operation.binary) {
        for (const key of ["id", "replayId"])
          if (params[key] && !z.uuid().safeParse(params[key]).success)
            throw new DeveloperApiError(
              400,
              "INVALID_REQUEST",
              "Choose a valid resource ID.",
            );
        if (params.edition) edition(params.edition);
        return { data: await readMedia(operation.id, params, principal) };
      }
      if (extendedResources.some((r) => r.id === operation.id)) {
        if (params.edition) edition(params.edition);
        for (const key of ["id", "replayId"])
          if (params[key] && !z.uuid().safeParse(params[key]).success)
            throw new DeveloperApiError(
              400,
              "INVALID_REQUEST",
              "Choose a valid resource ID.",
            );
        if (params.osuId) osuId(params.osuId);
        if (query.has("mode")) mode(query);
        if (
          query.has("locale") &&
          !["en", "zh-Hans", "zh-Hant"].includes(query.get("locale")!)
        )
          throw new DeveloperApiError(
            400,
            "INVALID_REQUEST",
            "Choose a supported interface locale.",
          );
        for (const key of ["poolId", "fixtureId"]) {
          const value = query.get(key);
          const valid =
            key === "fixtureId" &&
            ["statisticsWorkspace", "publicArchiveStatistics"].includes(
              operation.id,
            )
              ? /^[a-z0-9][a-z0-9-]{0,79}$/.test(value ?? "")
              : z.uuid().safeParse(value).success;
          if (value && !valid)
            throw new DeveloperApiError(
              400,
              "INVALID_REQUEST",
              "Choose a valid resource ID.",
            );
        }
        const data = await extendedRead(operation.id, params, query, principal);
        return { data: JSON.parse(JSON.stringify(data ?? null)) };
      }
      switch (operation.id) {
        case "getStaffOclrProfile":
          return {
            data: await (
              await import("./player-profiles")
            ).staffOclrPlayerProfile(
              principal!.subject,
              String(osuId(params.osuId)),
              "osu",
              edition(params.edition),
            ),
          };
        case "getOclrProfile":
        case "getMyOclrProfile": {
          const own = operation.id === "getMyOclrProfile";
          return {
            data: await (
              await import("./player-profiles")
            ).publishedPlayerProfile(
              String(own ? principal!.subject.osuId : osuId(params.osuId)),
              "osu",
              query.get("edition") ?? undefined,
              own ? principal!.subject.osuId : undefined,
              true,
            ),
          };
        }
        case "getApiIdentity":
          return {
            data: {
              user: principal!.subject,
              access: {
                kind: principal!.kind,
                scopes: principal!.scopes,
                expiresAt: principal!.expiresAt,
              },
            },
          };
        case "getPublicSite":
          return { data: await publicSiteModel() };
        case "listPublicTournaments":
        case "listStaffTournaments": {
          const filters = collectionFilters(query);
          const staff = operation.id === "listStaffTournaments";
          const load = staff
            ? privateTournamentListModel
            : publicTournamentListModel;
          return savedCollectionPage(
            JSON.stringify([
              operation.id,
              staff ? principal!.subject.osuId : null,
              filters.q,
              privacyReady(),
            ]),
            filters,
            async (asOf) =>
              (await load(asOf)).filter((row) =>
                `${row.name} ${row.slug} ${row.season ?? ""}`
                  .toLowerCase()
                  .includes(filters.q.toLowerCase()),
              ),
            tournamentDeadline,
          );
        }
        case "getPublicTournament":
          return { data: await publicTournamentModel(edition(params.edition)) };
        case "listPublicPlayers": {
          const filters = collectionFilters(query);
          const slug = edition(params.edition);
          return savedCollectionPage(
            JSON.stringify([operation.id, slug, filters.q]),
            filters,
            async (asOf) =>
              (await publicPlayerDirectoryModel(slug, filters.q, asOf)).rows,
            playerDeadline,
          );
        }
        case "getPublicPlayer":
          return {
            data: await publicPlayerProfileModel(
              edition(params.edition),
              String(osuId(params.osuId)),
              mode(query),
            ),
          };
        case "getStaffTournament":
          return {
            data: await privateTournamentModel(edition(params.edition)),
          };
        case "getUsernamePlayer": {
          const name = String(query.get("name") ?? "");
          const owner = addressableUsername(name)
            ? await (
                await import("./player-username")
              ).databaseUsernameOwner(name)
            : null;
          // Unknown, ambiguous and unaddressable names are all "no such player".
          if (!owner)
            throw new DeveloperApiError(
              404,
              "NOT_FOUND",
              "No published player uses this name.",
            );
          return { data: usernameOwnerSchema.parse(owner) };
        }
        case "getSavedProfile":
          return {
            data: await savedProfileModel(osuId(params.osuId), mode(query)),
          };
        default:
          throw new DeveloperApiError(
            404,
            "NOT_FOUND",
            "API resource was not found.",
          );
      }
    },
    {
      anonymous: operation.public,
      query: operation.query,
      schema: operation.binary ? undefined : readSchemas[operation.schema],
      binary: operation.binary,
      database: operation.id !== "getApiIdentity",
      maxBytes:
        operation.id === "getTeamAvatar"
          ? 1048576
          : operation.binary
            ? 8388608
            : operation.id === "getApiIdentity"
              ? 262144
              : 2097152,
    },
  );
}
