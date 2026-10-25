import { HttpError } from "./http";
export class RemoteDataError extends HttpError {
  constructor(
    public code: string,
    status = 503,
  ) {
    super(status, remoteErrorMessage(code));
  }
}
export function remoteErrorMessage(
  code: string,
  tr: (message: string) => string = (message) => message,
) {
  switch (code) {
    case "RATE_LIMITED":
      return tr("Too many developer API requests. Try again in a minute.");
    case "REMOTE_DISCONNECTED":
      return tr(
        "Connect to the remote backend or choose anonymous public browsing.",
      );
    case "REMOTE_EXPIRED":
      return tr("Remote access expired or was revoked. Connect again.");
    case "REMOTE_FORBIDDEN":
      return tr(
        "This remote token does not permit this read. Check its scopes and Developer grant.",
      );
    case "REMOTE_UNSUPPORTED":
      return tr(
        "This page or feature is not supported in remote development yet. See the coverage list.",
      );
    case "NOT_FOUND":
      return tr("Tournament or published player not found.");
    case "PROFILE_SNAPSHOT_NOT_FOUND":
      return tr("No saved profile is available.");
    case "COLLECTION_CHANGED":
      return tr("The collection changed. Restart from the first page.");
    case "INVALID_REQUEST":
      return tr("Choose valid API query parameters without duplicates.");
    default:
      return tr(
        "The remote backend is unavailable or returned invalid data. Try again.",
      );
  }
}
