import { PlayerProfile } from "@/components/player-profile";
import { RoundRatings } from "@/components/round-ratings";
import { PageHeading } from "@/components/ui";
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
