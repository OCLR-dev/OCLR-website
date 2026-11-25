import Link from "next/link";
import type { AppTranslator } from "@/i18n/translate";
import type { captainSetup } from "@/lib/captain-reads";
import type { MappoolWorkspace } from "@/lib/mappool-reads";
import type { FixtureWorkspace } from "@/lib/fixture-reads";
import type { StreamingWorkspace } from "@/lib/streaming-workspace";
import { formatDate } from "@/lib/editions";
import { fixtureSlot } from "@/lib/fixture-views";
import styles from "./tournament-dashboard-summary.module.css";

function nextScheduled<
  T extends { scheduledAt: Date | string | null; status: string },
>(rows: T[], now: number) {
  let next: T | undefined;
  let first = Infinity;
  for (const row of rows) {
    if (row.status !== "scheduled" || !row.scheduledAt) continue;
    const at = new Date(row.scheduledAt).getTime();
    if (at >= now && at < first) {
      next = row;
      first = at;
    }
  }
  return next;
}

export function TournamentDashboardSummary({
  base,
  captains,
  pools,
  fixtures,
  streams,
  tr,
  now,
}: {
  base: string;
  captains: Awaited<ReturnType<typeof captainSetup>>["captains"] | null;
  pools: MappoolWorkspace | null;
  fixtures: FixtureWorkspace | null;
  streams: StreamingWorkspace | null;
  tr: AppTranslator;
  now: number;
}) {
  const match =
    fixtures &&
    nextScheduled(
      fixtures.fixtures.filter((f) => f.result?.state !== "approved"),
      now,
    );
  const stream =
    streams &&
    nextScheduled(
      streams.fixtures.filter((f) => !f.completed),
      now,
    );
  const scheduled = match || stream;
  const roundName = match
    ? fixtures?.rounds.find(({ round }) => round.id === match.roundId)?.round
        .name
    : stream?.roundName;
  function side(position: "home" | "away") {
    if (match && fixtures) {
      const slot = fixtureSlot(fixtures, match, position);
      if (slot.teamId) return slot.label;
      const source = fixtures.fixtures.find((f) => f.id === slot.sourceMatchId);
      if (source)
        return slot.kind === "loser"
          ? tr("Loser of {value0}", { value0: source.label })
          : tr("Winner of {value0}", { value0: source.label });
    }
    if (stream) {
      const slot = stream[position];
      if (slot.name) return slot.name;
      if (slot.source)
        return slot.outcome === "loser"
          ? tr("Loser of {value0}", { value0: slot.source })
          : tr("Winner of {value0}", { value0: slot.source });
    }
    return tr("Team TBD");
  }
  const mapCounts = new Map<string, number>();
  for (const entry of pools?.entries ?? [])
    mapCounts.set(entry.poolId, (mapCounts.get(entry.poolId) ?? 0) + 1);
  if (!captains && !pools && !fixtures && !streams) return null;
  return (
    <div className={styles.summary}>
      {(fixtures || streams) && (
        <section className={styles.fixture}>
          <h2>{tr("Next match")}</h2>
          {scheduled && scheduled.scheduledAt ? (
            <div className={styles.matchBody}>
              <div>
                {roundName && roundName !== scheduled.label && (
                  <small className="muted">{roundName}</small>
                )}
                <Link
                  className={styles.matchName}
                  href={
                    match ? `${base}/matches/${match.id}` : `${base}/streaming`
                  }
                >
                  {scheduled.label}
                </Link>
                <p>
                  {side("home")} <span className="muted">vs</span>{" "}
                  {side("away")}
                </p>
              </div>
              <time dateTime={new Date(scheduled.scheduledAt).toISOString()}>
                {formatDate(
                  scheduled.scheduledAt,
                  scheduled.timeZone,
                  tr.locale,
                )}
              </time>
            </div>
          ) : (
            <p className="muted">{tr("No upcoming matches scheduled.")}</p>
          )}
        </section>
      )}
      {captains && (
        <section className={styles.card}>
          <h2>
            <Link href={`${base}/captains`}>{tr("Captains")}</Link>
            <span className="badge">{captains.length}</span>
          </h2>
          {captains.length ? (
            <ol className={styles.list}>
              {captains.map((c, index) => (
                <li key={c.userId}>
                  <span className={styles.number}>{index + 1}</span>
                  <strong>{c.username}</strong>
                  {c.teamName && c.teamName !== c.username && (
                    <small>{c.teamName}</small>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{tr("No captains appointed.")}</p>
          )}
        </section>
      )}
      {pools && (
        <section className={styles.card}>
          <h2>
            <Link href={`${base}/mappools`}>{tr("Mappools")}</Link>
            <span className="badge">{pools.pools.length}</span>
          </h2>
          {pools.pools.length ? (
            <ul className={styles.list}>
              {pools.pools.map((p) => (
                <li key={p.id} className={styles.pool}>
                  <strong>{p.name}</strong>
                  <small>
                    {tr("{count} maps", {
                      count: mapCounts.get(p.id) ?? 0,
                    })}
                  </small>
                  <span
                    className={styles.status}
                    data-published={p.publishedAt ? true : undefined}
                  >
                    {p.publishedAt ? tr("Published") : tr("Unpublished")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{tr("No mappools recorded.")}</p>
          )}
        </section>
      )}
    </div>
  );
}
