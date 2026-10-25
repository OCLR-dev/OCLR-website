import { Avatar } from "@/components/avatar";
import { AwardPolicy } from "@/components/award-policy";
import { AwardTable } from "@/components/award-table";
import { historicalPage } from "@/components/historical-archive";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { awardValue } from "@/lib/award-model";
import { awardTierLabel } from "@/lib/award-tiers";
import { publicAwards } from "@/lib/awards";
import { remotePage } from "@/lib/remote-page";
import Link from "next/link";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
async function Issue271Page({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const tr = await getAppTranslations();
  const slug = (await params).edition;
  const archivePage = await historicalPage(slug, "awards");
  if (archivePage) return archivePage;
  const releases = await publicAwards(slug);
  if (!releases) notFound();
  const requested = Number((await searchParams).week);
  const selected = releases.some((r) => r.week === requested)
    ? requested
    : releases[0]?.week;
  return (
    <>
      <PageHeading title={tr("Weekly awards")} />
      <AwardPolicy policy={releases.find((r) => r.week === selected)?.policy} />
      {!releases.length && (
        <p className="muted">{tr("No weekly awards published yet.")}</p>
      )}
      <nav className="actions" aria-label={tr("Review week")}>
        {releases.map((r) => (
          <Link
            key={r.week}
            href={`?week=${r.week}`}
            aria-current={r.week === selected ? "page" : undefined}
          >
            {tr("Week {value0}", { value0: r.week })}
          </Link>
        ))}
      </nav>
      {releases
        .filter((r) => r.week === selected)
        .map((release) => (
          <section className="panel section" key={release.week}>
            <h2>{tr("Week {value0}", { value0: release.week })}</h2>
            <p className="muted small">
              {new Intl.DateTimeFormat(tr.locale, {
                timeZone: release.timeZone,
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(release.startsAt))}{" "}
              –{" "}
              {new Intl.DateTimeFormat(tr.locale, {
                timeZone: release.timeZone,
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(release.endsAt))}{" "}
              · {release.timeZone}
            </p>
            {release.stale ? (
              <p role="status">{tr("Source changed; review required.")}</p>
            ) : (
              <>
                <div className="award-winners">
                  {(["mvp", "mip", "rookie"] as const).map((kind) => (
                    <article key={kind}>
                      <h3>
                        {kind === "rookie"
                          ? tr("Best Rookie")
                          : kind.toUpperCase()}
                      </h3>
                      {!release[kind].length && (
                        <p className="muted">{tr("No eligible winner.")}</p>
                      )}
                      {release[kind].length > 1 && <p>{tr("Tied")}</p>}
                      {release[kind].map((id) => {
                        const player = release.candidates.find(
                          (p) => p.userId === id,
                        )!;
                        return (
                          <div key={id} className="award-winner">
                            <Avatar osuId={id} username={player.username} />
                            <div>
                              <a
                                href={`https://osu.ppy.sh/users/${id}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {player.username}
                              </a>
                              <p className="muted small">
                                {kind === "mip"
                                  ? release.policy === "yumu-mra-v1"
                                    ? `+${awardValue(player.improvement!, release.policy)}`
                                    : tr("{value0} percentage points", {
                                        value0: `+${(player.improvement! / 10_000_000).toFixed(7)}`,
                                      })
                                  : awardValue(
                                      player.performance,
                                      release.policy,
                                    )}{" "}
                                ·{" "}
                                {tr("{value0} appearances", {
                                  value0: player.appearances,
                                })}
                                {player.tier !== null
                                  ? ` · ${awardTierLabel(player.tier)}`
                                  : ""}
                                {kind === "mip" && (
                                  <>
                                    <br />
                                    {awardValue(
                                      player.previousPerformance!,
                                      release.policy,
                                    )}{" "}
                                    →{" "}
                                    {awardValue(
                                      player.performance,
                                      release.policy,
                                    )}
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </article>
                  ))}
                </div>
                <AwardTable {...release} />
              </>
            )}
          </section>
        ))}
    </>
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
