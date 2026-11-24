import { authorizedPage } from "@/lib/auth/page";
import { requireBrowserSession } from "@/lib/auth/user";
import { listStreamingTokens } from "@/lib/streaming-api";
import { StreamingAccess } from "@/components/streaming-access";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { streamingOriginAllowed } from "@/lib/streaming-origin-model";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<{ origin?: string | string[] }>;
}) {
  return authorizedPage(async () => {
    const { edition } = await params;
    const context = await listStreamingTokens(
      await requireBrowserSession(),
      edition,
    );
    const tr = await getAppTranslations();
    const { origin } = await searchParams;
    const initialOrigin =
      typeof origin === "string" &&
      streamingOriginAllowed(origin, context.origins)
        ? origin
        : undefined;
    return (
      <div className="container page auth-page api-access-page">
        <PageHeading title={tr("Streaming API access")} />
        <StreamingAccess
          editionSlug={edition}
          backend={context.backend}
          origins={context.origins}
          initialOrigin={initialOrigin}
          initialTokens={context.tokens}
        />
      </div>
    );
  });
}
