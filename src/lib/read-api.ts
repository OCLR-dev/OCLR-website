import { collectionQuery, readQuerySchema } from "./read-api-queries";
import { createHash } from "node:crypto";
import { z } from "zod";
import { DeveloperApiError } from "./developer-api";
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
import type { ReadPayload } from "./read-api-contract";
import { readApiSpecification } from "./read-api-openapi";
import { readOperations, readSchemas } from "./read-api-operations";
import { readMedia } from "./read-media";
export function collectionPage<T>(
  items: T[],
  params: URLSearchParams,
): ReadPayload<T[]> {
  const parsed = collectionQuery.safeParse(Object.fromEntries(params));
  if (!parsed.success)
    throw new DeveloperApiError(
      400,
      "INVALID_REQUEST",
      "Choose valid API collection filters and page limits.",
    );
  const { page, pageSize, version } = parsed.data;
  if (items.length > 10000)
    throw new DeveloperApiError(
      413,
      "RESOURCE_TOO_LARGE",
      "Narrow the collection filters to at most 10,000 records.",
    );
  const collectionVersion = createHash("sha256")
    .update(JSON.stringify(items))
    .digest("hex");
  if (page > 1 && !version)
    throw new DeveloperApiError(
      400,
      "COLLECTION_VERSION_REQUIRED",
      "Use the first page collection version to request later pages.",
    );
  if (version && version !== collectionVersion)
    throw new DeveloperApiError(
      409,
      "COLLECTION_CHANGED",
      "The collection changed. Restart from the first page.",
    );
  const totalPages = Math.ceil(items.length / pageSize);
  return {
    data: items.slice((page - 1) * pageSize, page * pageSize),
    meta: {
      pagination: {
        page,
        pageSize,
        total: items.length,
        totalPages,
        nextPage: page < totalPages ? page + 1 : null,
        collectionVersion,
      },
    },
  };
}
function collectionFilters(query: URLSearchParams) {
  const parsed = collectionQuery.safeParse(Object.fromEntries(query));
  if (!parsed.success)
    throw new DeveloperApiError(
      400,
      "INVALID_REQUEST",
      "Choose valid API collection filters and page limits.",
    );
  return parsed.data;
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
            key === "fixtureId" && operation.id === "statisticsWorkspace"
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
        case "listPublicTournaments": {
          const { q } = collectionFilters(query);
          return collectionPage(
            (await publicTournamentListModel()).filter((row) =>
              `${row.name} ${row.slug} ${row.season ?? ""}`
                .toLowerCase()
                .includes(q.toLowerCase()),
            ),
            query,
          );
        }
        case "getPublicTournament":
          return { data: await publicTournamentModel(edition(params.edition)) };
        case "listPublicPlayers": {
          const { q } = collectionFilters(query);
          return collectionPage(
            (await publicPlayerDirectoryModel(edition(params.edition), q)).rows,
            query,
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
        case "listStaffTournaments": {
          const { q } = collectionFilters(query);
          return collectionPage(
            (await privateTournamentListModel()).filter((row) =>
              `${row.name} ${row.slug} ${row.season ?? ""}`
                .toLowerCase()
                .includes(q.toLowerCase()),
            ),
            query,
          );
        }
        case "getStaffTournament":
          return {
            data: await privateTournamentModel(edition(params.edition)),
          };
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
