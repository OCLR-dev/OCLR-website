import { createHash } from "node:crypto";
import { z } from "zod";
import { editionSchema } from "./editions";
import { profileMode } from "./osu-profile-model";
import { DeveloperApiError } from "./developer-api";
import {
  readDataResponse,
  missingDeveloperResource,
} from "./developer-api-http";
import { readApiSpecification } from "./read-api-openapi";
import { readOperations, readSchemas } from "./read-api-operations";
import {
  publicSiteModel,
  publicTournamentListModel,
  publicTournamentModel,
  publicPlayerDirectoryModel,
  publicPlayerProfileModel,
  privateTournamentListModel,
  privateTournamentModel,
  savedProfileModel,
} from "./public-read-models";
import type { ReadPayload } from "./read-api-contract";
const collectionQuery = z
  .object({
    q: z.string().trim().max(100).default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    version: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
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
      schema: readSchemas[operation.schema],
      database: operation.id !== "getApiIdentity",
      maxBytes: operation.id === "getApiIdentity" ? 262144 : 2097152,
    },
  );
}
