import { PlayerProfile } from "@/components/player-profile";
import { Avatar } from "@/components/avatar";
import { RoundRatings } from "@/components/round-ratings";
import { getAppTranslations } from "@/i18n/server";
import { frontendProfile } from "@/lib/frontend-data";
import { publicRoundRatings } from "@/lib/ratings";
import { remotePage } from "@/lib/remote-page";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "./profile.module.css";

import { HttpError } from "@/lib/http";
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
    Object.keys(query).some((key) => key !== "edition") ||
    (query.edition !== undefined &&
      (typeof query.edition !== "string" ||
        !/^[a-z0-9-]+$/.test(query.edition)))
  )
    notFound();
  let data;
  try {
    data = await frontendProfile(osuId, query.edition as string | undefined);
  } catch (e) {
    if (e instanceof HttpError && [400, 404].includes(e.status)) notFound();
    throw e;
  }
  const profile = data.snapshot?.profile;
  const country = profile?.countryName ?? profile?.countryCode;
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
      <header className={styles.heading}>
        <a
          href={data.identity.canonicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${styles.identityLink} ${styles.avatarLink}`}
          aria-label={tr("View on osu! ↗")}
        >
          <Avatar
            osuId={data.identity.osuId}
            username={data.identity.username}
            avatarUrl={profile?.avatarUrl ?? undefined}
          />
        </a>
        <div className={styles.headingText}>
          <h1>
            <a
              href={data.identity.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.identityLink}
            >
              {data.identity.username}
            </a>
          </h1>
          <p className="muted">
            {country && (
              <>
                {country}
                {profile?.countryName && profile.countryCode
                  ? ` (${profile.countryCode})`
                  : ""}
                {" · "}
              </>
            )}
            ID: {data.identity.osuId}
          </p>
        </div>
      </header>
      {data.snapshot ? (
        <PlayerProfile
          snapshot={{
            ...data.snapshot,
            profile: {
              ...data.snapshot.profile,
              username: data.identity.username,
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
        <ul
          className={
            data.participation.length ? `panel ${styles.history}` : undefined
          }
        >
          {data.participation.map((p) => (
            <li className={styles.record} key={p.editionSlug}>
              <div className={styles.edition}>
                <h3>
                  <Link
                    href={`/tournaments/${p.editionSlug}`}
                    className="context-link"
                  >
                    {p.editionName}
                  </Link>
                </h3>
                {p.participation === "historical" && (
                  <span className="muted small">
                    {tr("Historical archive")}
                  </span>
                )}
              </div>
              <div className={styles.identity}>
                <span>{p.username}</span>
                <span className="badge">
                  {p.participation === "historical"
                    ? p.role === "captain"
                      ? tr("Captain")
                      : p.role === "coach"
                        ? tr("Coach")
                        : p.role === "free_agent"
                          ? tr("Free agent")
                          : tr("Player")
                    : p.participation === "coach"
                      ? tr("Coach")
                      : p.captain
                        ? tr("Captain")
                        : p.participation === "finalized_roster"
                          ? tr("Finalized roster player")
                          : tr("Accepted player")}
                </span>
              </div>
              <div className={styles.team}>
                {p.coachedTeams?.map((t) => (
                  <div key={t.id}>
                    <span className="badge">{tr("Coach")}</span>{" "}
                    <Link
                      className="context-link"
                      href={`/tournaments/${p.editionSlug}/teams/${t.id}`}
                    >
                      {t.name}
                    </Link>
                  </div>
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
                    <span className="muted small">
                      {tr("Team awaiting publication")}
                    </span>
                  ))}
                {p.placing != null && (
                  <span className="muted small">
                    {tr("Recorded placing")}: {p.placing}
                  </span>
                )}
                {p.sourceReference && (
                  <span className="muted small">{p.sourceReference}</span>
                )}
              </div>
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
