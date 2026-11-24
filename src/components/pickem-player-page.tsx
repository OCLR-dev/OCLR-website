import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getAppTranslations } from "@/i18n/server";
import { localBrowserUser } from "@/lib/auth/user";
import { remoteMode } from "@/lib/data-source";
import { formatDate } from "@/lib/editions";
import { pickemRead, PickemError } from "@/lib/pickem";
import { pickemPage } from "@/lib/pickem-model";
import { pickemStatusText } from "@/lib/pickem-labels";
import type { PickemRank, PickemStatus } from "@/lib/pickem-types";
import { PickemMatchCard } from "./pickem-match-card";
import styles from "./pickem.module.css";

type View = "matches" | "mine" | "leaderboard";
type Query = Record<string, string | string[] | undefined>;

const pageSize = 25;

function displayPage<T>(rows: T[], requestedCursor: number) {
  const cursor =
    requestedCursor < rows.length
      ? requestedCursor
      : Math.floor(Math.max(0, rows.length - 1) / pageSize) * pageSize;
  return { ...pickemPage(rows, cursor, pageSize), cursor };
}

export async function PickemPlayerPage({
  slug,
  view,
  query,
}: {
  slug: string;
  view: View;
  query: Query;
}) {
  if (remoteMode() || !process.env.DATABASE_URL) notFound();
  const [user, tr] = await Promise.all([
    localBrowserUser(),
    getAppTranslations(),
  ]);
  const requested = z.uuid().safeParse(query.round);
  const data = await pickemRead(
    slug,
    user,
    requested.success ? requested.data : undefined,
    true,
  ).catch((error: unknown) => {
    if (error instanceof PickemError && error.status === 404) notFound();
    throw error;
  });
  const round = data.selectedRound;
  const base = `/tournaments/${slug}/pickem`;
  const path = view === "matches" ? base : `${base}/${view}`;
  const signIn = `/auth/osu?pickem_return=${encodeURIComponent(path)}`;
  const status = user && typeof query.status === "string" ? query.status : "";
  const scope = query.scope === "round" && round ? "round" : "season";
  const parsedCursor = z.coerce
    .number()
    .int()
    .nonnegative()
    .max(100000)
    .safeParse(query.cursor);
  const requestedCursor = parsedCursor.success ? parsedCursor.data : 0;
  const inRound = data.cards.filter(
    (card) => !round || card.roundId === round.id,
  );
  const openCards = inRound.filter((card) => card.status === "open");
  const pickedOpen = openCards.filter((card) => card.mine).length;
  const groups: { title: string; states: PickemStatus[] }[] = [
    { title: tr("Open for picks"), states: ["open"] },
    { title: tr("Picks closed"), states: ["closed", "pending"] },
    { title: tr("Scored and void"), states: ["settled", "void"] },
  ];
  const tabs = [
    { view: "matches", href: base, name: tr("Round matches") },
    { view: "mine", href: `${base}/mine`, name: tr("My predictions") },
    {
      view: "leaderboard",
      href: `${base}/leaderboard`,
      name: tr("Leaderboard"),
    },
  ];
  const filterLinks = [
    { value: "", label: tr("All") },
    { value: "open", label: tr("Open for picks") },
    { value: "closed", label: tr("Picks closed") },
    { value: "settled", label: tr("Scored") },
  ];
  const withQuery = (
    changes: Record<string, string | number | undefined>,
    url = path,
  ) => {
    const values = new URLSearchParams();
    const entries = {
      round: round?.id,
      status: status || undefined,
      scope: view === "leaderboard" ? scope : undefined,
      ...changes,
    };
    for (const [key, value] of Object.entries(entries)) {
      if (value !== undefined && value !== "") values.set(key, String(value));
    }
    return values.size ? `${url}?${values}` : url;
  };
  const board = scope === "round" ? data.leaderboard : data.seasonLeaderboard;
  const myPlace = board.findIndex((row) => row.mine);
  const boardPage = displayPage(board, requestedCursor);
  const history = displayPage(
    inRound.filter((card) => card.mine),
    requestedCursor,
  );
  const visibleCards = displayPage(
    inRound.filter(
      (card) =>
        !status ||
        card.status === status ||
        (status === "closed" && card.status === "pending") ||
        (status === "settled" && card.status === "void"),
    ),
    requestedCursor,
  );
  const relevantPage =
    view === "leaderboard"
      ? boardPage
      : view === "mine"
        ? history
        : visibleCards;
  const list = (rows: PickemRank[], preview = false) =>
    rows.length ? (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{tr("Rank")}</th>
              <th scope="col">{tr("Player")}</th>
              <th scope="col">{tr("Points")}</th>
              {!preview && (
                <>
                  <th scope="col">{tr("Correct predictions")}</th>
                  <th scope="col">{tr("Exact scores")}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={index}
                id={!preview && row.mine ? "my-rank" : undefined}
                data-mine={row.mine || undefined}
                tabIndex={!preview && row.mine ? -1 : undefined}
              >
                <td>
                  {row.position}
                  {row.tied && <small> {tr("Tied")}</small>}
                </td>
                <th scope="row">
                  {row.username}
                  {row.mine && <small> · {tr("You")}</small>}
                </th>
                <td>{row.points}</td>
                {!preview && (
                  <>
                    <td>
                      {row.correct}/{row.settled}
                    </td>
                    <td>{row.exact}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className={styles.muted}>{tr("No scored predictions yet.")}</p>
    );

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>{tr("Match predictions")}</h1>
      </header>
      <nav className={styles.tabs} aria-label={tr("Match predictions")}>
        {tabs.map((tab) => (
          <Link
            key={tab.view}
            href={withQuery({ status: undefined, scope: undefined }, tab.href)}
            aria-current={tab.view === view ? "page" : undefined}
          >
            {tab.name}
          </Link>
        ))}
      </nav>
      {!user && (
        <p className={styles.login}>
          {tr("Sign in to make predictions and see the leaderboard.")}{" "}
          <a className="button" href={signIn}>
            {tr("Sign in with osu!")}
          </a>
        </p>
      )}
      {(view !== "leaderboard" || scope === "round") &&
        data.rounds.length > 0 && (
          <nav className={styles.rounds} aria-label={tr("Rounds")}>
            {data.rounds.map((item) => (
              <Link
                key={item.id}
                href={withQuery({ round: item.id })}
                aria-current={item.id === round?.id ? "page" : undefined}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        )}
      {view === "matches" && (
        <div className={styles.layout}>
          <section aria-label={tr("Round matches")}>
            {user && (
              <nav className={styles.filters} aria-label={tr("Status")}>
                {filterLinks.map((filter) => (
                  <Link
                    key={filter.value}
                    href={withQuery({ status: filter.value })}
                    aria-current={status === filter.value ? "page" : undefined}
                  >
                    {filter.label}
                  </Link>
                ))}
              </nav>
            )}
            {!visibleCards.rows.length && (
              <p className={styles.aside}>
                {tr("No matches match these filters.")}
              </p>
            )}
            {groups.map((group) => {
              const cards = visibleCards.rows.filter((card) =>
                group.states.includes(card.status),
              );
              return cards.length ? (
                <section className={styles.group} key={group.title}>
                  <h2>{group.title}</h2>
                  <div className={styles.cards}>
                    {cards.map((card) => (
                      <PickemMatchCard
                        key={card.windowId}
                        card={card}
                        slug={slug}
                        signedIn={Boolean(user)}
                        userId={user?.osuId ?? null}
                        serverNow={data.serverNow}
                      />
                    ))}
                  </div>
                </section>
              ) : null;
            })}
          </section>
          <aside className={styles.sidebar}>
            {user && (
              <>
                <section className={styles.aside}>
                  <h2>{tr("My progress")}</h2>
                  <p>
                    {tr("{picked} of {total} open matches picked", {
                      picked: pickedOpen,
                      total: openCards.length,
                    })}
                  </p>
                  <progress
                    value={pickedOpen}
                    max={Math.max(1, openCards.length)}
                    aria-label={tr("My progress")}
                  />
                  <div className={styles.metrics}>
                    <div>
                      <strong>{data.myScore.points}</strong>
                      <span>{tr("Round points")}</span>
                    </div>
                    <div>
                      <strong>{data.seasonScore.points}</strong>
                      <span>{tr("Season points")}</span>
                    </div>
                  </div>
                  {openCards[0] && (
                    <p className={styles.muted}>
                      {tr("Next deadline")} ·{" "}
                      {formatDate(
                        openCards[0].closesAt,
                        openCards[0].timeZone,
                        tr.locale,
                      )}
                    </p>
                  )}
                </section>
                <section className={styles.aside}>
                  <h2>{tr("Round leaderboard")}</h2>
                  {list(data.leaderboard.slice(0, 5), true)}
                  <Link
                    href={withQuery(
                      { scope: "round", status: undefined },
                      `${base}/leaderboard`,
                    )}
                  >
                    {tr("View leaderboard")}
                  </Link>
                </section>
              </>
            )}
            <Rules tr={tr} />
          </aside>
        </div>
      )}
      {view === "mine" && user && (
        <section className={styles.aside}>
          <h2>{tr("My predictions")}</h2>
          <div className={styles.metrics}>
            <div>
              <strong>{data.myScore.points}</strong>
              <span>{tr("Round points")}</span>
            </div>
            <div>
              <strong>{data.seasonScore.points}</strong>
              <span>{tr("Season points")}</span>
            </div>
          </div>
          {history.rows.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{tr("Match")}</th>
                    <th scope="col">{tr("Your prediction")}</th>
                    <th scope="col">{tr("Official result")}</th>
                    <th scope="col">{tr("Points")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.rows.map((card) => {
                    const key = card.mine!.outcomeKey;
                    const result = card.result;
                    const score = card.mine!.score;
                    return (
                      <tr key={card.windowId}>
                        <th scope="row">
                          <Link
                            href={`/tournaments/${slug}/matches/${card.fixtureId}`}
                          >
                            {card.label}
                          </Link>
                          <small> · {pickemStatusText(tr, card.status)}</small>
                        </th>
                        <td>
                          {key === "draw"
                            ? tr("Draw")
                            : card[key].name || tr("To be announced")}
                          {score && ` · ${score.homeWins} : ${score.awayWins}`}
                        </td>
                        <td>
                          {result
                            ? result.outcomeKey === "draw"
                              ? tr("Draw")
                              : card[result.outcomeKey].name
                            : "—"}
                          {result?.score &&
                            ` · ${result.score.homeWins} : ${result.score.awayWins}`}
                        </td>
                        <td>{card.points?.points ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p>{tr("You have not made a prediction yet.")}</p>
          )}
        </section>
      )}
      {view === "leaderboard" && user && (
        <section className={styles.aside}>
          <h2>{tr("Leaderboard")}</h2>
          <nav className={styles.filters} aria-label={tr("Leaderboard")}>
            <Link
              href={withQuery({ scope: "season" })}
              aria-current={scope === "season" ? "page" : undefined}
            >
              {tr("Season")}
            </Link>
            {round && (
              <Link
                href={withQuery({ scope: "round" })}
                aria-current={scope === "round" ? "page" : undefined}
              >
                {tr("This round")}
              </Link>
            )}
          </nav>
          {list(boardPage.rows)}
          {myPlace >= 0 && (
            <Link
              href={`${withQuery({ cursor: Math.floor(myPlace / pageSize) * pageSize })}#my-rank`}
            >
              {tr("Find my rank")}
            </Link>
          )}
        </section>
      )}
      {(relevantPage.cursor > 0 || relevantPage.nextCursor !== null) && (
        <nav className={styles.filters} aria-label={tr("Pagination")}>
          {relevantPage.cursor > 0 && (
            <Link
              href={withQuery({
                cursor: Math.max(0, relevantPage.cursor - pageSize),
              })}
            >
              {tr("Previous")}
            </Link>
          )}
          {relevantPage.nextCursor !== null && (
            <Link href={withQuery({ cursor: relevantPage.nextCursor })}>
              {tr("Next")}
            </Link>
          )}
        </nav>
      )}
      {view !== "matches" && <Rules tr={tr} />}
    </div>
  );
}
function Rules({ tr }: { tr: Awaited<ReturnType<typeof getAppTranslations>> }) {
  return (
    <section className={styles.aside}>
      <h2>{tr("How to play")}</h2>
      <ul>
        <li>{tr("You can change your prediction until the deadline.")}</li>
        <li>
          {tr(
            "Pick each match before its deadline. A correct result earns 1 point.",
          )}
        </li>
        <li>{tr("An exact score earns 1 extra point.")}</li>
        <li>
          {tr(
            "After the match ends, anyone can see your osu! name, pick and optional score.",
          )}
        </li>
        <li>
          {tr(
            "The leaderboard shows the osu! name and points of every player with a scored prediction.",
          )}
        </li>
      </ul>
    </section>
  );
}
