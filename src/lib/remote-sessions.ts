import { remoteCredentialVault } from "./remote-credential-vault";
import { randomBytes } from "node:crypto";
import { apiIdentitySchema } from "./read-api-operations";
import { remoteRead } from "./remote-transport";
import { RemoteDataError } from "./remote-errors";
import type { z } from "zod";
import { RemotePublicCache } from "./remote-public-cache";
export const remoteCookie = "oclr_remote_session";
export type RemoteIdentity = z.infer<typeof apiIdentitySchema>;
type Connection = {
  mode: "developer" | "anonymous";
  sealedToken?: Buffer;
  expiresAt: number | null;
  publicCache?: RemotePublicCache;
};
const globalConnections = globalThis as unknown as {
  oclrRemoteConnections?: Map<string, Connection>;
};
const entries = () => (globalConnections.oclrRemoteConnections ??= new Map());
function prune() {
  for (const [key, item] of entries())
    if (item.expiresAt !== null && item.expiresAt <= Date.now())
      disconnectRemote(key);
}
export function disconnectRemote(id?: string) {
  if (id) {
    entries().get(id)?.publicCache?.clear();
    entries().get(id)?.sealedToken?.fill(0);
    entries().delete(id);
  }
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
  const expiresAt = identity ? Date.parse(identity.access.expiresAt) : null;
  if (expiresAt !== null && expiresAt <= Date.now())
    throw new RemoteDataError("REMOTE_EXPIRED", 401);
  disconnectRemote(previous);
  entries().set(id, {
    mode: input.mode,
    sealedToken:
      input.mode === "developer"
        ? remoteCredentialVault.seal(input.token!)
        : undefined,
    expiresAt,
  });
  return { id, expiresAt };
}
export function remoteConnection(id?: string) {
  const connection = id ? entries().get(id) : undefined;
  if (
    !connection ||
    (connection.expiresAt !== null && connection.expiresAt <= Date.now())
  ) {
    disconnectRemote(id);
    throw new RemoteDataError(
      id ? "REMOTE_EXPIRED" : "REMOTE_DISCONNECTED",
      401,
    );
  }
  connection.publicCache ??= new RemotePublicCache();
  return connection;
}
export async function verifiedConnection(id?: string) {
  const connection = remoteConnection(id);
  let identity: RemoteIdentity | null = null;
  let contractVersion: string | null = null;
  try {
    if (connection.mode === "developer") {
      const result = await remoteRead(
        "/me",
        undefined,
        remoteCredentialVault.open(connection.sealedToken!),
      );
      identity = apiIdentitySchema.parse(result.data);
      contractVersion = result.contractVersion;
    }
    if (connection.mode === "anonymous")
      contractVersion = (await remoteRead("/site")).contractVersion;
    // Plaintext exists only in this request context, never in the connection map.
    return {
      ...connection,
      token: connection.sealedToken
        ? remoteCredentialVault.open(connection.sealedToken)
        : undefined,
      identity,
      contractVersion,
    };
  } catch (error) {
    if (error instanceof RemoteDataError && [401, 403].includes(error.status))
      disconnectRemote(id);
    throw error;
  }
}

const cleanupState = globalThis as typeof globalThis & {
  oclrRemoteSessionCleanup?: ReturnType<typeof setInterval>;
};
// HMR preserves global state, including timers. Replace the callback as well as
// the module so an older expiry policy cannot delete current connections.
if (cleanupState.oclrRemoteSessionCleanup)
  clearInterval(cleanupState.oclrRemoteSessionCleanup);
cleanupState.oclrRemoteSessionCleanup = setInterval(prune, 60_000).unref();
