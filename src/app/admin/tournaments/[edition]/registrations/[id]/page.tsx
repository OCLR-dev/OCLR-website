import { BwsReview } from "@/components/bws-review";
import { EligibilitySummary } from "@/components/eligibility-summary";
import { RegistrationRemoval } from "@/components/registration-removal";
import { ReviewForm } from "@/components/review-form";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { applicationAnswers } from "@/lib/application-answers";
import { authorizedPage } from "@/lib/auth/page";
import {
  hasCapability,
  isDeveloper,
  requireStaff,
  staffAccess,
} from "@/lib/auth/staff";
import { formatDate } from "@/lib/editions";
import { cachedOsuUserProfile, getOsuUserProfile } from "@/lib/osu-profiles";
import { remotePage } from "@/lib/remote-page";
import { applicationDetails } from "@/lib/staff";
import { readTournament } from "@/lib/tournaments";
import Link from "next/link";
import { notFound } from "next/navigation";
async function Issue271Page({
  params,
}: {
  params: Promise<{ id: string; edition: string }>;
}) {
  const tr = await getAppTranslations();

  return authorizedPage(async () => {
    const actor = await requireStaff();
    const { id, edition: slug } = await params;
    const data = await applicationDetails(actor, id);
    if (data.registration.editionSlug !== slug) notFound();
    const { registration: r, username } = data;
    const developer =
      isDeveloper(await staffAccess(actor)) &&
      !(await hasCapability(actor, "manage_registrations", slug));
    const [record, snapshot] = await Promise.all([
      readTournament(r.editionSlug),
      (developer ? cachedOsuUserProfile : getOsuUserProfile)(
        r.userId,
        "osu",
      ).catch(() => null),
    ]);
    const edition = record?.edition;
    const profile = snapshot?.profile;
    const stats = profile?.statistics;
    const number = new Intl.NumberFormat(tr.locale, {
      maximumFractionDigits: 2,
    });
    return (
      <>
        <div className="application-heading">
          <PageHeading
            eyebrow={edition?.name ?? r.editionSlug}
            title={username}
          >
            {tr("Private individual application · osu! ID ")}
            {r.userId}
          </PageHeading>
          <div className="application-profile-summary">
            <span className="muted small">{"osu!standard"}</span>
            <dl>
              <div>
                <dt>{tr("Global rank")}</dt>
                <dd>
                  {stats?.globalRank != null && stats.globalRank > 0
                    ? `#${number.format(stats.globalRank)}`
                    : tr("Unavailable")}
                </dd>
              </div>
              <div>
                <dt>PP</dt>
                <dd>
                  {stats?.pp != null
                    ? number.format(stats.pp)
                    : tr("Unavailable")}
                </dd>
              </div>
            </dl>
            {snapshot?.stale && (
              <span className="badge">{tr("SAVED SNAPSHOT")}</span>
            )}
            <p className="muted small">
              {profile
                ? tr("Updated {value0}{value1}", {
                    value0: formatDate(profile.fetchedAt, "UTC", tr.locale),
                    value1: "",
                  })
                : tr("osu! statistics are temporarily unavailable.")}
            </p>
          </div>
        </div>
        <section className="panel">
          <span className={`badge status-${r.status}`}>{tr(r.status)}</span>
          {r.status === "withdrawn" &&
            data.lastOperation === "staff_remove" && (
              <p role="status" className="notice small">
                {tr("Registration removed by staff. Its history is retained.")}
              </p>
            )}
          {r.status === "pending" && data.lastOperation === "staff_restore" && (
            <p role="status" className="notice small">
              {tr(
                "Registration restored for review. No new player acknowledgments were recorded.",
              )}
            </p>
          )}
          <dl className="detail-list">
            <div>
              <dt>{tr("Submitted")}</dt>
              <dd>{tr(formatDate(r.createdAt, "UTC", tr.locale))}</dd>
            </div>
            <div>
              <dt>{tr("Registration source")}</dt>
              <dd>
                {r.source === "staff"
                  ? tr("Staff-assisted entry")
                  : tr("Player submission")}
              </dd>
            </div>
            <div>
              <dt>{tr("Rules acknowledged")}</dt>
              <dd>
                {r.rulesVersion ??
                  (r.source === "staff"
                    ? tr("Not acknowledged by the player")
                    : tr("No rules configured at submission"))}
              </dd>
            </div>
            {applicationAnswers(r.answers, data.acknowledgedConfiguration).map(
              ({ id, label, value }) => (
                <div key={id}>
                  <dt>{label}</dt>
                  <dd className="preserve-lines">{value || tr("No answer")}</dd>
                </div>
              ),
            )}
            {r.statusReason && (
              <div>
                <dt>{tr("Explanation")}</dt>
                <dd>{r.statusReason}</dd>
              </div>
            )}
          </dl>
        </section>
        {data.attempts.length > 0 && (
          <details className="spaced application-history">
            <summary>{tr("Previous applications")}</summary>
            {data.attempts.map((attempt) => (
              <section className="panel" key={attempt.attempt}>
                <h2>
                  {tr("Application {number}", { number: attempt.attempt })}
                </h2>
                <p className="muted small">
                  {tr(formatDate(attempt.snapshot.createdAt, "UTC", tr.locale))}{" "}
                  · {tr(attempt.snapshot.status)} ·{" "}
                  {attempt.snapshot.source === "staff"
                    ? tr("Staff-assisted entry")
                    : tr("Player submission")}
                </p>
                <dl className="detail-list">
                  <div>
                    <dt>{tr("Rules acknowledged")}</dt>
                    <dd>
                      {attempt.snapshot.rulesVersion ??
                        tr("Not acknowledged by the player")}
                    </dd>
                  </div>
                  {applicationAnswers(
                    attempt.snapshot.answers,
                    attempt.configuration,
                  ).map((answer) => (
                    <div key={answer.id}>
                      <dt>{answer.label}</dt>
                      <dd className="preserve-lines">
                        {answer.value || tr("No answer")}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </details>
        )}
        {r.eligibilityVerification && (
          <EligibilitySummary
            value={r.eligibilityVerification}
            currentRevision={record?.revision}
          />
        )}
        {r.status !== "withdrawn" && <BwsReview slug={slug} id={r.id} />}
        {["pending", "deferred"].includes(r.status) && (
          <ReviewForm
            key={r.updatedAt.toISOString()}
            id={r.id}
            status={r.status as "pending" | "deferred"}
            updatedAt={r.updatedAt.toISOString()}
          />
        )}
        <RegistrationRemoval
          id={r.id}
          slug={slug}
          tournament={edition?.name ?? slug}
          username={username}
          osuId={r.userId}
          status={r.status}
          updatedAt={r.updatedAt.toISOString()}
          staffRemoved={data.lastOperation === "staff_remove"}
        />
        <Link
          className="context-link spaced"
          href={`/admin/tournaments/${slug}/registrations`}
        >
          {tr("View registrations")}
        </Link>
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
