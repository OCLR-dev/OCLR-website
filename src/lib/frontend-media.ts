import { frontendConnection } from "./frontend-data";
import { remoteMedia } from "./remote-transport";
import { disconnectRemote } from "./remote-sessions";
import { RemoteDataError } from "./remote-errors";
export async function frontendMedia(path: string) {
  const context = await frontendConnection();
  try {
    return await remoteMedia(path, context.token);
  } catch (error) {
    if (error instanceof RemoteDataError && error.code === "REMOTE_EXPIRED")
      disconnectRemote(context.id);
    throw error;
  }
}
