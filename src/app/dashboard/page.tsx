import { publicPlayer } from "@/lib/players";
import { applicationAnswers } from "@/lib/application-answers";
import { getAppTranslations } from "@/i18n/server";
import Link from "next/link";
import Image from "next/image";
import { getOsuUserProfile } from "@/lib/osu-profiles";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/user";
import { playerApplications, statusCopy } from "@/lib/dashboard";
import { formatDate } from "@/lib/editions";
import { Action, EmptyState, PageHeading } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { ConfirmMutation } from "@/components/confirm-mutation";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return {
    title: tr("Player dashboard"),
    robots: { index: false, follow: false },
  };
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const tr = await getAppTranslations();

  const user = await currentUser();
  if (!user) redirect("/login");
  const [applications, snapshot, publishedParticipation] = await Promise.all([
    playerApplications(user.osuId),
    getOsuUserProfile(user.osuId, "osu").catch(() => null),
    publicPlayer(user.osuId),
  ]);
  const profile = snapshot?.profile;
  const country = profile?.countryCode;
  const flag = country
    ? String.fromCodePoint(
        ...[...country].map((letter) => letter.charCodeAt(0) + 127397),
      )
    : null;
  const stats = profile?.statistics;
  const number = new Intl.NumberFormat(tr.locale, { maximumFractionDigits: 2 });
  const params = await searchParams;
  return (
    <div className="container page player-workspace">
      <div className="workspace-main">
        <div className="player-page-heading">
          <PageHeading title={tr("Player dashboard")} />
          <form action="/auth/logout" method="post">
            <button className="secondary">{tr("Sign out")}</button>
          </form>
        </div>
        {params.submitted && (
          <p className="notice" role="status">
            {tr("Application submitted. Your saved status appears below.")}
          </p>
        )}
        <section
          className="panel identity-panel"
          id="identity"
          aria-label={tr("osu! identity")}
        >
          <Avatar
            osuId={user.osuId}
            username={user.username}
            avatarUrl={profile?.avatarUrl ?? undefined}
          />
          <div className="player-identity">
            <p className="eyebrow">{tr("OSU! IDENTITY")}</p>
            <h2>
              <a
                href={`https://osu.ppy.sh/users/${user.osuId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {user.username}{" "}
                <span
                  className="muted"
                  aria-label={tr("opens osu! profile in a new tab")}
                >
                  ↗
                </span>
              </a>
            </h2>
            <p className="muted small">
              {tr("osu! ID: ")}
              {user.osuId}
            </p>
            {publishedParticipation.length ? (
              <p className="small">
                <Link
                  className="text-link"
                  href={`/players/${user.osuId}`}
                  prefetch={false}
                >
                  {tr("OCLR profile")} →
                </Link>
              </p>
            ) : (
              <p className="muted small">
                {tr(
                  "Your OCLR profile is available after you have public tournament participation.",
                )}
              </p>
            )}
            {country && (
              <p className="small">
                <span
                  role="img"
                  aria-label={tr("{value0} flag", {
                    value0: profile?.countryName ?? country,
                  })}
                >
                  {flag}
                </span>{" "}
                {profile?.countryName ?? country}
              </p>
            )}
          </div>
          <div className="player-statistics">
            <p className="eyebrow">
              {tr("OSU! · ")}
              {snapshot?.stale ? tr("SAVED SNAPSHOT") : tr("PROFILE")}
            </p>
            <dl>
              <div>
                <dt>{tr("Global rank")}</dt>
                <dd>
                  {stats?.globalRank != null
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
              <div>
                <dt>{tr("Accuracy")}</dt>
                <dd>
                  {stats?.accuracy != null
                    ? `${number.format(stats.accuracy)}%`
                    : tr("Unavailable")}
                </dd>
              </div>
            </dl>
            <p className="muted small">
              {profile
                ? tr("Updated {value0}{value1}", {
                    value0: tr(formatDate(profile.fetchedAt, "UTC", tr.locale)),
                    value1: snapshot?.stale
                      ? " · Refresh temporarily unavailable"
                      : "",
                  })
                : tr("osu! statistics are temporarily unavailable.")}
            </p>
          </div>
        </section>
        <section className="section-space" id="registrations">
          <div className="section-title">
            <h2>{tr("My registrations")}</h2>
            <Link href="/tournaments" className="context-link">
              {tr("Browse tournaments")}
            </Link>
          </div>
          {applications.length ? (
            <div className="stack">
              {applications.map(
                ({
                  registration: r,
                  lastOperation,
                  edition,
                  withdrawable,
                  reapplyAvailable,
                  captainAssigned,
                  acknowledgedConfiguration,
                }) => (
                  <article className="panel registration-card" key={r.id}>
                    <div className="registration-cover" aria-hidden="true">
                      {edition?.branding?.logo ? (
                        <Image
                          src={edition.branding.logo}
                          alt=""
                          width={120}
                          height={120}
                          unoptimized
                        />
                      ) : (
                        <span>OCLR</span>
                      )}
                    </div>
                    <div className="registration-details">
                      <div className="section-title">
                        <h3>
                          {edition?.name ??
                            tr("Edition: {value0}", { value0: r.editionSlug })}
                        </h3>
                        <span className={`badge status-${r.status}`}>
                          {tr(r.status)}
                        </span>
                      </div>
                      <p className="muted small">
                        {r.status === "withdrawn" &&
                        lastOperation === "staff_remove"
                          ? tr(
                              "Staff withdrew this registration. Your application history is retained.",
                            )
                          : r.status === "deferred"
                            ? tr(
                                "Your rank eligibility is awaiting further review. You have not been accepted or rejected.",
                              )
                            : tr(statusCopy[r.status])}
                      </p>
                      <p className="small muted">
                        {tr("Submitted")}{" "}
                        {tr(
                          formatDate(
                            r.createdAt,
                            edition?.timeZone ?? "UTC",
                            tr.locale,
                          ),
                        )}
                      </p>
                      {r.source === "staff" && (
                        <p className="small muted">
                          {tr(
                            "Staff-assisted entry. No player answers or acknowledgments are recorded.",
                          )}
                        </p>
                      )}
                      {r.statusReason && r.status !== "withdrawn" && (
                        <p className="notice small">
                          {tr("Staff explanation: ")}
                          {r.statusReason}
                        </p>
                      )}
                      {Object.keys(r.answers).length > 0 && (
                        <details className="spaced">
                          <summary>{tr("My application")}</summary>
                          <dl className="detail-list">
                            {applicationAnswers(
                              r.answers,
                              acknowledgedConfiguration,
                            ).map(({ id, label, value }) => (
                              <div key={id}>
                                <dt>{label}</dt>
                                <dd className="preserve-lines">
                                  {value || tr("No answer")}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      )}
                      <div className="actions">
                        {edition && reapplyAvailable && (
                          <Action
                            href={`/tournaments/${edition.slug}/register`}
                          >
                            {tr("Apply again")}
                          </Action>
                        )}
                        {edition && captainAssigned && (
                          <>
                            <Action
                              href={`/tournaments/${edition.slug}/team`}
                              secondary
                            >
                              {tr("My captain team")}
                            </Action>
                            <Action
                              href={`/tournaments/${edition.slug}/draft/captain`}
                            >
                              {tr("Captain draft room")}
                            </Action>
                          </>
                        )}
                        {edition && (
                          <Action
                            href={`/tournaments/${edition.slug}`}
                            secondary
                          >
                            {tr("Edition details")}
                          </Action>
                        )}
                        {withdrawable && (
                          <ConfirmMutation
                            label={tr("Withdraw application")}
                            title={tr("Withdraw your application?")}
                            description={tr(
                              "This removes your application from consideration. You cannot resubmit automatically. Contact staff if you need help.",
                            )}
                            url={`/api/registrations/${r.id}/withdraw`}
                            payload={{ confirmed: true }}
                          />
                        )}
                      </div>
                    </div>
                  </article>
                ),
              )}
            </div>
          ) : (
            <EmptyState title={tr("Your stage starts here.")}>
              {tr(
                "You have no applications yet. Browse the tournaments and apply individually when registration is open.",
              )}
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}
