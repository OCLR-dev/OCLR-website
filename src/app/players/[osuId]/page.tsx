import { PlayerProfile } from "@/components/player-profile";
import { ProfileRulesetFilter } from "@/components/profile-ruleset-filter";
import { RoundRatings } from "@/components/round-ratings";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { frontendProfile } from "@/lib/frontend-data";
import { publicRoundRatings } from "@/lib/ratings";
import { remotePage } from "@/lib/remote-page";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HttpError } from "@/lib/http";
import { formatDate } from "@/lib/editions";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Player profile") };
}

async function ProfileContent({
  params,
  searchParams,
}: {
  params: Promise<{ osuId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tr = await getAppTranslations();

  const { osuId } = await params;
  const query = await searchParams;
  if (
    Object.keys(query).some((key) => !["mode", "edition"].includes(key)) ||
    (query.mode !== undefined && typeof query.mode !== "string") ||
    (query.edition !== undefined &&
      (typeof query.edition !== "string" ||
        !/^[a-z0-9-]+$/.test(query.edition)))
  )
    notFound();
  let data;
  try {
    data = await frontendProfile(
      osuId,
      query.mode as string | undefined,
      query.edition as string | undefined,
    );
  } catch (e) {
    if (e instanceof HttpError && [400, 404].includes(e.status)) notFound();
    throw e;
  }
  const ratingHistory =
    typeof query.edition === "string"
      ? (await publicRoundRatings(query.edition))
          .filter((r) =>
            r.report.players.some((p) => p.userId === Number(osuId)),
          )
          .map((r) => ({
            ...r,
            report: {
              ...r.report,
              players: r.report.players.filter(
                (p) => p.userId === Number(osuId),
              ),
            },
          }))
      : [];
  return (
    <div
      className={
        query.edition
          ? "public-tournament public-player-page"
          : "container page"
      }
    >
      <Link
        className="context-link"
        href={
          query.edition
            ? `/tournaments/${query.edition}/players`
            : "/tournaments"
        }
      >
        {query.edition ? tr("← Tournament players") : tr("← Tournaments")}
      </Link>
      <PageHeading eyebrow={tr("OCLR PLAYER")} title={data.identity.username}>
        {tr("Public osu! statistics and published OCLR participation.")}
      </PageHeading>
      <section className="panel spaced" aria-labelledby="oclr-identity">
        <h2 id="oclr-identity">{tr("osu! identity")}</h2>
        <p>
          <a className="context-link" href={data.identity.canonicalUrl}>
            {tr("osu! ID: ")}
            {data.identity.osuId} ↗
          </a>
        </p>
        {data.identity.currentUsername ? (
          <p>
            {tr("Current username")}: {data.identity.currentUsername}
          </p>
        ) : (
          <p className="muted">
            {tr(
              "Current username unavailable; showing a verified historical name.",
            )}
          </p>
        )}
        <h3>{tr("Previous usernames")}</h3>
        <p className="muted small">
          {tr(
            "Verified names observed by OCLR. Observation dates are not rename dates; unobserved names may be missing.",
          )}
        </p>
        {data.identity.names.filter(
          (n) =>
            n.username.toLowerCase() !==
            data.identity.currentUsername?.toLowerCase(),
        ).length ? (
          <ul className="stack">
            {data.identity.names
              .filter(
                (n) =>
                  n.username.toLowerCase() !==
                  data.identity.currentUsername?.toLowerCase(),
              )
              .map((name) => (
                <li key={name.username.toLowerCase()}>
                  <strong>{name.username}</strong>
                  {name.evidence.length > 0 && (
                    <details>
                      <summary>{tr("Name evidence")}</summary>
                      <ul>
                        {name.evidence.map((e, i) => (
                          <li className="small muted" key={i}>
                            {e.source === "account"
                              ? tr("Account observation")
                              : e.source.startsWith("osu_")
                                ? tr("osu! profile observation")
                                : tr("Historical archive")}
                            {e.editionSlug && (
                              <>
                                {" "}
                                ·{" "}
                                <Link
                                  className="context-link"
                                  href={`/tournaments/${e.editionSlug}`}
                                >
                                  {e.editionSlug}
                                </Link>
                              </>
                            )}
                            {e.reference && <> · {e.reference}</>}
                            {e.firstObservedAt ? (
                              <>
                                {" "}
                                · {tr("First observed")}:{" "}
                                {tr(
                                  formatDate(
                                    e.firstObservedAt,
                                    "UTC",
                                    tr.locale,
                                  ),
                                )}
                              </>
                            ) : (
                              <> · {tr("Observation date unknown")}</>
                            )}
                            {e.lastObservedAt &&
                              e.lastObservedAt !== e.firstObservedAt && (
                                <>
                                  {" "}
                                  · {tr("Last observed")}:{" "}
                                  {tr(
                                    formatDate(
                                      e.lastObservedAt,
                                      "UTC",
                                      tr.locale,
                                    ),
                                  )}
                                </>
                              )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
          </ul>
        ) : (
          <p className="muted">
            {tr("No verified previous usernames are available.")}
          </p>
        )}
      </section>
      <ProfileRulesetFilter
        key={data.identity.mode}
        mode={data.identity.mode}
        edition={query.edition as string | undefined}
      />
      {!query.mode && (
        <p className="muted small">
          {tr(
            "Select a ruleset to view its BWS estimate. No tournament mode is inferred.",
          )}
        </p>
      )}
      {data.snapshot ? (
        <PlayerProfile
          snapshot={{
            ...data.snapshot,
            profile: {
              ...data.snapshot.profile,
              previousUsernames: data.identity.names
                .map((n) => n.username)
                .filter(
                  (name) =>
                    name.toLowerCase() !==
                    data.identity.currentUsername?.toLowerCase(),
                ),
            },
          }}
          bws={data.bws}
        />
      ) : (
        <p className="notice" role="status">
          {tr("osu! statistics are temporarily unavailable.")}
        </p>
      )}
      {typeof query.edition === "string" && (
        <RoundRatings data={ratingHistory} slug={query.edition} />
      )}
      <section className="spaced" aria-labelledby="participation">
        <h2 id="participation">{tr("Published participation")}</h2>
        {!data.participation.length && (
          <p className="notice">
            {tr("No published tournament participation is available.")}
          </p>
        )}
        <ul className="player-directory">
          {data.participation.map((p) => (
            <li className="panel" key={p.editionSlug}>
              <h3>
                <Link
                  href={`/tournaments/${p.editionSlug}`}
                  className="context-link"
                >
                  {p.editionName}
                </Link>
              </h3>
              <p>{p.username}</p>
              <p>
                {p.participation === "historical"
                  ? tr("Historical archive")
                  : p.participation === "coach"
                    ? tr("Coach")
                    : p.captain
                      ? tr("Captain")
                      : p.participation === "finalized_roster"
                        ? tr("Finalized roster player")
                        : tr("Accepted player")}
              </p>
              {p.participation === "historical" && (
                <p>
                  {p.role === "captain"
                    ? tr("Captain")
                    : p.role === "coach"
                      ? tr("Coach")
                      : p.role === "free_agent"
                        ? tr("Free agent")
                        : tr("Player")}
                </p>
              )}
              {p.placing != null && (
                <p>
                  {tr("Recorded placing")}: {p.placing}
                </p>
              )}
              {p.sourceReference && (
                <p className="muted small">{p.sourceReference}</p>
              )}
              {p.coachedTeams?.map((t) => (
                <p key={t.id}>
                  <span className="badge">{tr("Coach")}</span>{" "}
                  <Link
                    className="context-link"
                    href={`/tournaments/${p.editionSlug}/teams/${t.id}`}
                  >
                    {t.name}
                  </Link>
                </p>
              ))}
              {p.participation !== "coach" &&
                (p.team ? (
                  <Link
                    href={`/tournaments/${p.editionSlug}/teams/${p.team.id}`}
                    className="context-link"
                  >
                    {p.team.name}
                  </Link>
                ) : (
                  <p className="muted">{tr("Team awaiting publication")}</p>
                ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function Profile(props: Parameters<typeof ProfileContent>[0]) {
  return remotePage(() => ProfileContent(props));
}
