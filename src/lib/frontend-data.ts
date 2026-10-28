import { compareTournamentSeasons } from "./tournament-order";
import { frontendRequestValue } from "./frontend-read-context";
import { cache } from "react";
import { cookies } from "next/headers.js";
import { remoteMode, remoteConfiguration } from "./data-source";
import { cachePublicOperation } from "./remote-public-cache";
import { readContractVersion } from "./read-api-version";
import { remoteCookie, verifiedConnection } from "./remote-sessions";
import { remoteRead, remoteOperation } from "./remote-transport";
import { RemoteDataError } from "./remote-errors";
import {
  siteSchema,
  publicTournamentSchema,
  publicTournamentSummarySchema,
  publicPlayerSchema,
  publicPlayerProfileSchema,
  oclrProfileSchema,
  type OclrProfile,
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
async function readRemoteResource(path: string, queryString: string) {
  const query = new URLSearchParams(queryString);
  const operation = remoteOperation(path, query);
  const context = await frontendConnection();
  try {
    if (
      context.identity &&
      !context.identity.access.scopes.includes(operation.scope)
    )
      throw new RemoteDataError("REMOTE_FORBIDDEN", 403);
    const load = () => remoteRead(path, query, context.token);
    if (!cachePublicOperation(operation)) return await load();
    const { local, upstream } = remoteConfiguration();
    query.sort();
    const key = JSON.stringify([
      local,
      upstream,
      readContractVersion,
      path,
      query.toString(),
    ]);
    return await context.publicCache!.read(key, load);
  } catch (error) {
    if (error instanceof RemoteDataError && error.code === "REMOTE_EXPIRED")
      disconnectRemote(context.id);
    throw error;
  }
}
const requestRead = cache(readRemoteResource);
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
        // A restarted collection must also bypass request-local memoization of
        // its old first page / rejected page, not just the development snapshot.
        const result = attempt
          ? await readRemoteResource(path, query.toString())
          : await frontendRemoteRead(path, query);
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
      ) {
        (await frontendConnection()).publicCache?.clear();
        continue;
      }
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
  edition?: string,
): Promise<OclrProfile> {
  const viewer = await frontendViewer();
  if (!remoteMode())
    return (await import("./player-profiles")).publishedPlayerProfile(
      input,
      "osu",
      edition,
      viewer?.osuId,
    );
  const { parseOsuProfile } = await import("./osu-profile-model");
  const identity = parseOsuProfile(input, "osu");
  const own = viewer?.osuId === identity.osuId;
  const query = new URLSearchParams();
  if (edition) query.set("edition", edition);
  // Negotiate using the freshly verified header. Old v1 backends reject unknown
  // paths/queries with 400; never probe and silently downgrade authorization.
  const version = (await frontendConnection()).contractVersion;
  if (Number(/^1\.(\d+)\./.exec(version ?? "")?.[1] ?? 0) >= 3) {
    return oclrProfileSchema.parse(
      (
        await frontendRemoteRead(
          own ? "/me/oclr-profile" : `/players/${identity.osuId}/oclr-profile`,
          query,
        )
      ).data,
    );
  }
  const slugs = edition
    ? [edition]
    : (await frontendTournaments()).map((e) => e.slug);
  const participation: OclrProfile["participation"] = [];
  let saved: OclrProfile["snapshot"] = null;
  let bws: OclrProfile["bws"] = null;
  for (const slug of slugs) {
    try {
      const data = publicPlayerProfileSchema.parse(
        (
          await frontendRemoteRead(
            `/tournaments/${slug}/players/${identity.osuId}`,
            new URLSearchParams(),
          )
        ).data,
      );
      const p = data.player;
      if (!participation.some((row) => row.editionSlug === p.editionSlug))
        participation.push(p);
      if (
        data.snapshot &&
        (!saved || data.snapshot.profile.fetchedAt > saved.profile.fetchedAt)
      ) {
        saved = {
          profile: data.snapshot.profile,
          stale: data.snapshot.state === "stale",
          notice: null,
        };
        bws = data.bws;
      }
    } catch (error) {
      if (error instanceof RemoteDataError && error.code === "NOT_FOUND")
        continue;
      throw error;
    }
  }
  if (!participation.length && !own)
    throw new RemoteDataError("NOT_FOUND", 404);
  if (own && !saved)
    saved = await (
      await import("./osu-profiles")
    ).cachedOsuUserProfile(identity.osuId, identity.mode);
  const username =
    (own ? viewer.username : saved?.profile.username) ??
    participation[0]?.username;
  if (!username) throw new RemoteDataError("NOT_FOUND", 404);
  // Old servers cannot provide persistent provenance. These names have no
  // invented observation dates; v1.3 supplies the durable evidence instead.
  const aliases = [
    ...new Set([
      ...(saved?.profile.previousUsernames ?? []),
      ...participation.map((p) => p.username),
    ]),
  ];
  return {
    identity: {
      ...identity,
      username,
      currentUsername: own
        ? viewer.username
        : (saved?.profile.username ?? null),
      names: aliases.map((username) => ({ username, evidence: [] })),
    },
    participation,
    snapshot: saved,
    bws,
    error: null,
  };
}
