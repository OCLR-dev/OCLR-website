import { notFound } from "next/navigation";
import { requireBrowserSession } from "@/lib/auth/user";
import { authorizedPage } from "@/lib/auth/page";
import { HttpError } from "@/lib/http";
import { listStreamingTokens, streamingOrigins } from "@/lib/streaming-api";
import { streamingReturnPath } from "@/lib/streaming-connect-model";
import { StreamingConnect } from "@/components/streaming-connect";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { streamingOriginAllowed } from "@/lib/streaming-origin-model";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<{
    origin?: string | string[];
    state?: string | string[];
  }>;
}) {
  const { edition } = await params;
  const query = await searchParams;
  const path = streamingReturnPath(
    `/streaming/${edition}/connect?${new URLSearchParams({
      origin: typeof query.origin === "string" ? query.origin : "",
      state: typeof query.state === "string" ? query.state : "",
    })}`,
    null,
  );
  if (!path) notFound();
  const tr = await getAppTranslations();
  if (!streamingOriginAllowed(query.origin as string, streamingOrigins())) {
    return (
      <div className="container page auth-page">
        <PageHeading title={tr("Connect OCLR Overlay")} />
        <section className="panel form-stack">
          <p role="alert">
            {tr(
              "This console address is not allowed by the website configuration. Ask the website administrator to allow it, or choose an allowed address in your console.",
            )}
          </p>
          <code>{query.origin}</code>
          <a href={`/streaming/${edition}`}>{tr("Streaming API access")}</a>
        </section>
      </div>
    );
  }
  let session;
  try {
    session = await requireBrowserSession();
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401) throw error;
    return (
      <div className="container page auth-page">
        <PageHeading title={tr("Connect OCLR Overlay")} />
        <section className="panel form-stack">
          <p>
            {tr(
              "Sign in with osu! to connect your streaming console. No token copying is needed.",
            )}
          </p>
          <a
            className="button"
            href={`/auth/osu?streaming_return=${encodeURIComponent(path)}`}
          >
            {tr("Continue with osu!")}
          </a>
        </section>
      </div>
    );
  }
  return authorizedPage(async () => {
    await listStreamingTokens(session, edition);
    return (
      <div className="container page auth-page">
        <PageHeading title={tr("Connect OCLR Overlay")} />
        <StreamingConnect
          edition={edition}
          origin={query.origin as string}
          state={query.state as string}
        />
      </div>
    );
  });
}
