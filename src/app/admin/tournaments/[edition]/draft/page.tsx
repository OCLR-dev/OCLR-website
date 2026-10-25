import Link from "next/link";
import "./broadcast-tools.css";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireStaff } from "@/lib/auth/staff";
import { staffDraft } from "@/lib/draft";
import { PageHeading } from "@/components/ui";
import { ObsSourceLink } from "@/components/obs-source-link";
import { appUrl } from "@/lib/http";
import { StaffDraftRoom } from "@/components/staff-draft";
export default async function ControlRoom({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();

  return authorizedPage(async () => {
    const actor = await requireStaff();
    const { edition } = await params;
    const initial = await staffDraft(actor, edition);
    let origin: string | undefined;
    try {
      origin = appUrl();
    } catch {
      /* Browser origin remains the fallback. */
    }
    return (
      <>
        <div className="draft-control-heading">
          <PageHeading eyebrow={edition} title={tr("Draft control room")} />
        </div>
        <section
          className="draft-broadcast-tools"
          aria-label={tr("Draft broadcast")}
        >
          <nav className="actions" aria-label={tr("Draft broadcast")}>
            <Link
              className="button secondary"
              href={`/tournaments/${edition}/draft?presenter=1`}
            >
              {tr("Open presenter view")}
            </Link>
            <Link
              className="button secondary"
              href={`/tournaments/${edition}/draft/overlay`}
            >
              {tr("Open broadcast overlay")}
            </Link>
          </nav>
          <ObsSourceLink slug={edition} origin={origin} />
        </section>
        <StaffDraftRoom slug={edition} initial={initial} />
      </>
    );
  });
}
