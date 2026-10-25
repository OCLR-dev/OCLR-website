import { randomBytes } from "node:crypto";
import { apiIdentitySchema } from "./read-api-operations";
import { remoteRead } from "./remote-transport";
import { RemoteDataError } from "./remote-errors";
import type { z } from "zod";
export const remoteCookie = "oclr_remote_session";
export type RemoteIdentity = z.infer<typeof apiIdentitySchema>;
type Connection = {
  mode: "developer" | "anonymous";
  token?: string;
  expiresAt: number;
};
const globalConnections = globalThis as unknown as {
  oclrRemoteConnections?: Map<string, Connection>;
};
const entries = () => (globalConnections.oclrRemoteConnections ??= new Map());
const lifetime = 60 * 60 * 1000;
function prune() {
  for (const [key, item] of entries())
    if (item.expiresAt <= Date.now()) entries().delete(key);
}
export function disconnectRemote(id?: string) {
  if (id) entries().delete(id);
}
export async function connectRemote(
  input: { mode: "developer" | "anonymous"; token?: string },
  previous?: string,
) {
  prune();
  let identity: RemoteIdentity | null = null;
  if (input.mode === "developer") {
    if (!input.token || !/^oclr_dev_[a-zA-Z0-9_-]{43}$/.test(input.token))
      throw new RemoteDataError("REMOTE_EXPIRED", 401);
    identity = apiIdentitySchema.parse(
      (await remoteRead("/me", undefined, input.token)).data,
    );
  }
  if (input.mode === "anonymous") await remoteRead("/site");
  if (entries().size >= 50 && (!previous || !entries().has(previous)))
    throw new RemoteDataError("REMOTE_UNAVAILABLE", 503);
  const id = randomBytes(32).toString("base64url");
  const expiresAt = Math.min(
    Date.now() + lifetime,
    identity ? Date.parse(identity.access.expiresAt) : Infinity,
  );
  if (expiresAt <= Date.now()) throw new RemoteDataError("REMOTE_EXPIRED", 401);
  disconnectRemote(previous);
  entries().set(id, {
    mode: input.mode,
    token: input.mode === "developer" ? input.token : undefined,
    expiresAt,
  });
  return { id, expiresAt };
}
export function remoteConnection(id?: string) {
  const connection = id ? entries().get(id) : undefined;
  if (!connection || connection.expiresAt <= Date.now()) {
    disconnectRemote(id);
    throw new RemoteDataError(
      id ? "REMOTE_EXPIRED" : "REMOTE_DISCONNECTED",
      401,
    );
  }
  return connection;
}
export async function verifiedConnection(id?: string) {
  const connection = remoteConnection(id);
  let identity: RemoteIdentity | null = null;
  try {
    if (connection.mode === "developer")
      identity = apiIdentitySchema.parse(
        (await remoteRead("/me", undefined, connection.token)).data,
      );
    if (connection.mode === "anonymous") await remoteRead("/site");
    return { ...connection, identity };
  } catch (error) {
    if (error instanceof RemoteDataError && [401, 403].includes(error.status))
      disconnectRemote(id);
    throw error;
  }
}
