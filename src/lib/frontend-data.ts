import { compareTournamentSeasons } from "./tournament-order";
import { frontendRequestValue } from "./frontend-read-context";
import { cache } from "react";
import { cookies } from "next/headers.js";
import { remoteMode } from "./data-source";
import { remoteCookie, verifiedConnection } from "./remote-sessions";
import { remoteRead, remoteOperation } from "./remote-transport";
import { RemoteDataError } from "./remote-errors";
import {
  siteSchema,
  publicTournamentSchema,
  publicTournamentSummarySchema,
  publicPlayerSchema,
  publicPlayerProfileSchema,
  privateTournamentSchema,
  privateTournamentSummarySchema,
} from "./read-api-contract";
import { z } from "zod";
import { disconnectRemote } from "./remote-sessions";
const renderConnection = cache(async () => {
  const id = (await cookies()).get(remoteCookie)?.value;
  return { id, ...(await verifiedConnection(id)) };
});
export function frontendConnection() {
  return frontendRequestValue("connection", () => renderConnection());
}
const requestRead = cache(async (path: string, queryString: string) => {
  const query = new URLSearchParams(queryString);
  remoteOperation(path, query);
  const context = await frontendConnection();
  try {
    return await remoteRead(path, query, context.token);
  } catch (error) {
    if (error instanceof RemoteDataError && error.code === "REMOTE_EXPIRED")
      disconnectRemote(context.id);
    throw error;
  }
});
export function frontendRemoteRead(
  path: string,
  query = new URLSearchParams(),
) {
  return frontendRequestValue("read:" + path + "?" + query.toString(), () =>
    requestRead(path, query.toString()),
  );
}
async function completeCollection<T>(
  path: string,
  schema: z.ZodType<T>,
  q = "",
) {
  // Restart once after a concurrent public update, never merge different versions.
  for (let attempt = 0; attempt < 2; attempt++) {
    const all: T[] = [];
    const identities = new Set<unknown>();
    let page = 1,
      version: string | undefined,
      expectedTotal: number | undefined;
    try {
      while (true) {
        const query = new URLSearchParams({
          page: String(page),
          pageSize: "100",
          q,
        });
        if (version) query.set("version", version);
        const result = await frontendRemoteRead(path, query);
        const pagination = result.meta.pagination;
        if (
          !pagination ||
          pagination.page !== page ||
          pagination.pageSize !== 100 ||
          pagination.total > 10000 ||
          (version && version !== pagination.collectionVersion) ||
          (expectedTotal !== undefined && expectedTotal !== pagination.total)
        )
          throw new RemoteDataError("REMOTE_UNAVAILABLE");
        version = pagination.collectionVersion;
        expectedTotal = pagination.total;
        const records = z.array(schema).parse(result.data);
        for (const record of records) {
          const item = record as Record<string, unknown>;
          const identity = item.osuId ?? item.slug;
          if (identity === undefined || identities.has(identity))
            throw new RemoteDataError("REMOTE_UNAVAILABLE");
          identities.add(identity);
        }
        all.push(...records);
        if (
          all.length > 10000 ||
          (pagination.nextPage !== null && pagination.nextPage !== page + 1)
        )
          throw new RemoteDataError("REMOTE_UNAVAILABLE");
        if (pagination.nextPage === null) {
          if (all.length !== expectedTotal)
            throw new RemoteDataError("REMOTE_UNAVAILABLE");
          return all;
        }
        if (page >= 100) throw new RemoteDataError("REMOTE_UNAVAILABLE");
        page = pagination.nextPage;
      }
    } catch (error) {
      if (
        attempt === 0 &&
        error instanceof RemoteDataError &&
        error.code === "COLLECTION_CHANGED"
      )
        continue;
      throw error;
    }
  }
  throw new RemoteDataError("COLLECTION_CHANGED", 409);
}
export const frontendSite = cache(async () =>
  remoteMode()
    ? siteSchema.parse((await frontendRemoteRead("/site")).data)
    : (await import("./public-read-models")).publicSiteModel(),
);
export const frontendTournaments = cache(async () =>
  remoteMode()
    ? (
        await completeCollection("/tournaments", publicTournamentSummarySchema)
      ).sort(compareTournamentSeasons)
    : (await import("./public-read-models")).publicTournamentListModel(),
);
export const frontendTournament = cache(async (slug: string) =>
  remoteMode()
    ? publicTournamentSchema.parse(
        (await frontendRemoteRead(`/tournaments/${slug}`)).data,
      )
    : (await import("./public-read-models")).publicTournamentModel(slug),
);
export const frontendPlayers = cache(async (slug: string, q = "") =>
  remoteMode()
    ? {
        rows: await completeCollection(
          `/tournaments/${slug}/players`,
          publicPlayerSchema,
          q,
        ),
        refreshIds: [] as number[],
      }
    : (await import("./public-read-models")).publicPlayerDirectoryModel(
        slug,
        q,
      ),
);
export const frontendPrivateTournaments = cache(async () => {
  if (!remoteMode()) throw new RemoteDataError("REMOTE_UNSUPPORTED", 404);
  return (
    await completeCollection(
      "/staff/tournaments",
      privateTournamentSummarySchema,
    )
  ).sort(compareTournamentSeasons);
});
export const frontendPrivateTournament = cache(async (slug: string) => {
  if (!remoteMode()) throw new RemoteDataError("REMOTE_UNSUPPORTED", 404);
  return privateTournamentSchema.parse(
    (await frontendRemoteRead(`/staff/tournaments/${slug}`)).data,
  );
});
export async function frontendViewer() {
  return remoteMode()
    ? ((await frontendConnection()).identity?.user ?? null)
    : (await import("./auth/user")).currentUser();
}
export async function frontendProfile(
  input: string,
  mode?: string,
  edition?: string,
) {
  if (!remoteMode())
    return (await import("./player-profiles")).publishedPlayerProfile(
      input,
      mode,
      edition,
    );
  const { parseOsuProfile } = await import("./osu-profile-model");
  const identity = parseOsuProfile(input, mode);
  const slugs = edition
    ? [edition]
    : (await frontendTournaments()).map((e) => e.slug);
  for (const slug of slugs) {
    try {
      const data = publicPlayerProfileSchema.parse(
        (
          await frontendRemoteRead(
            `/tournaments/${slug}/players/${identity.osuId}`,
            new URLSearchParams({ mode: identity.mode }),
          )
        ).data,
      );
      return {
        identity,
        participation: [data.player],
        snapshot: data.snapshot
          ? {
              profile: data.snapshot.profile,
              stale: data.snapshot.state === "stale",
              notice: null,
            }
          : null,
        bws: data.bws,
        error: data.snapshot
          ? null
          : {
              status: 404,
              message:
                data.player.source.kind === "historical_archive"
                  ? "Not recorded"
                  : "No saved profile is available.",
            },
      };
    } catch (error) {
      if (error instanceof RemoteDataError && error.code === "NOT_FOUND")
        continue;
      throw error;
    }
  }
  throw new RemoteDataError("NOT_FOUND", 404);
}
