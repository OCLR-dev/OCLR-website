import { notFound } from "next/navigation";
import { getAppTranslations } from "@/i18n/server";
import { PageHeading } from "@/components/ui";
import { RemoteConnectionForm } from "@/components/remote-development";
import { remoteMode, remoteConfiguration } from "@/lib/data-source";
import { frontendConnection } from "@/lib/frontend-data";
import { remoteErrorMessage, RemoteDataError } from "@/lib/remote-errors";
import Link from "next/link";
export default async function RemotePage() {
  if (!remoteMode()) notFound();
  const tr = await getAppTranslations();
  const { upstream } = remoteConfiguration();
  let state, failure;
  try {
    state = await frontendConnection();
  } catch (error) {
    failure =
      error instanceof RemoteDataError ? error.code : "REMOTE_UNAVAILABLE";
  }
  return (
    <div className="container page auth-page">
      <PageHeading title={tr("Remote frontend development")} />
      <p>
        {tr("Backend")}:{" "}
        <a
          className="text-link"
          href={`${upstream}/developer`}
          target="_blank"
          rel="noreferrer"
        >
          {upstream}
        </a>
      </p>
      <p className="notice" role="status">
        {state?.identity
          ? tr("Connected as {name}", { name: state.identity.user.username })
          : state?.mode === "anonymous"
            ? tr("Anonymous public browsing")
            : remoteErrorMessage(failure ?? "REMOTE_DISCONNECTED", tr)}
      </p>
      {state?.identity && (
        <>
          <p>
            {tr("Read scopes")}: {state.identity.access.scopes.join(", ")}
          </p>
          <p>
            {tr("Expires at")}:{" "}
            <time dateTime={state.identity.access.expiresAt}>
              {state.identity.access.expiresAt}
            </time>
          </p>
        </>
      )}
      <RemoteConnectionForm connected={Boolean(state)} />
      <section className="spaced">
        <h2>{tr("Supported in this stage")}</h2>
        <p>
          {tr(
            "Public tournament lists, overview, rules, complete players and saved profiles; scope-gated internal tournament configuration. Writes, messages, round ratings and other pages are not supported yet.",
          )}
        </p>
        <div className="actions">
          <Link className="context-link" href="/tournaments">
            {tr("Public tournaments")}
          </Link>
          {state?.identity?.access.scopes.includes(
            "tournaments:private:read",
          ) && (
            <Link className="context-link" href="/admin/tournaments">
              {tr("Internal tournaments")}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
