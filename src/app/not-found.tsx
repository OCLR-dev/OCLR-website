import { headers } from "next/headers";
import { getAppTranslations } from "@/i18n/server";
import { Action, PageHeading } from "@/components/ui";

export default async function NotFound() {
  const tr = await getAppTranslations();
  const pathname = (await headers()).get("x-oclr-pathname") ?? "";
  // Only numeric osu! IDs have a profile URL; every other 404 keeps the
  // generic page without a misleading external link.
  const osuId = /^\/players\/([1-9]\d*)\/?$/.exec(pathname)?.[1];

  return (
    <div className="container page">
      <PageHeading eyebrow="404" title={tr("Off the beat.")}>
        {tr("This page could not be found.")}
      </PageHeading>
      {osuId ? (
        <div className="actions">
          <a
            className="button"
            href={`https://osu.ppy.sh/users/${osuId}/osu`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {tr("View on osu! ↗")}
          </a>
          <Action href="/" secondary>
            {tr("Back to OCLR")}
          </Action>
        </div>
      ) : (
        <Action href="/">{tr("Back to OCLR")}</Action>
      )}
    </div>
  );
}
