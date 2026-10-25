import { extendedResources } from "./extended-read-resources";
import { frontendConnection, frontendRemoteRead } from "./frontend-data";
import { RemoteDataError } from "./remote-errors";
import contracts from "./extended-read-contracts.json" with { type: "json" };
import { reviveReadValue } from "./read-value";
export async function assertRemoteSubject(osuId: number) {
  if ((await frontendConnection()).identity?.user.osuId !== osuId)
    throw new RemoteDataError("REMOTE_FORBIDDEN", 403);
}
export async function frontendResource<T>(
  id: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  const resource = extendedResources.find((r) => r.id === id);
  if (!resource) throw new RemoteDataError("INVALID_REQUEST", 400);
  const values: Record<string, unknown> = {
    ...input,
    edition: input.slug ?? input.edition,
    osuId: input.playerId ?? input.osuId,
    id: input.id ?? input.fixtureId ?? input.entryId,
  };
  const path = resource.path.replace(/\{(\w+)\}/g, (_, key) =>
    String(values[key]),
  );
  const query = new URLSearchParams();
  const filters =
    input.input && typeof input.input === "object"
      ? (input.input as Record<string, unknown>)
      : {};
  for (const key of resource.query) {
    const value = input[key] ?? filters[key];
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  const result = await frontendRemoteRead(path, query);
  return reviveReadValue(result.data, {
    ...(contracts.resources as Record<string, object>)[id],
    $defs: contracts.$defs,
  }) as T;
}
