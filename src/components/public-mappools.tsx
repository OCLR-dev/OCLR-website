"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { competitionStageLabel } from "@/lib/competition-stage";
import type { publicMappools } from "@/lib/mappool-reads";
import { MappoolBrowser } from "./mappool-browser";
import { WorkspaceTabs } from "./workspace-tabs";
import styles from "./public-mappools.module.css";

type Pool = Awaited<ReturnType<typeof publicMappools>>[number];

/** Only published snapshots cross this boundary; changing a tab is a local read. */
export function PublicMappools({
  pools: published,
  slug,
}: {
  pools: Pool[];
  slug: string;
}) {
  const tr = useAppTranslations();
  const id = useId();
  const pools = (["group", "knockout", "exhibition"] as const).flatMap(
    (stage) => published.filter((pool) => pool.stage === stage),
  );
  const [selected, setSelected] = useState(pools[0]?.id);
  const active = pools.find((pool) => pool.id === selected) ?? pools[0];
  if (!active) return null;
  const poolLabel = (pool: Pool) =>
    pools.filter((other) => other.name === pool.name).length > 1
      ? [
          ...new Set([
            tr(competitionStageLabel(pool.stage)),
            pool.roundName,
            pool.name,
          ]),
        ].join(" · ")
      : pool.name;
  return (
    <div className={styles.collection}>
      <header className={styles.context}>
        <div>
          <span className={styles.stage}>
            {tr(competitionStageLabel(active.stage))}
          </span>
          {active.roundName !== active.name && (
            <span className={styles.round}>{active.roundName}</span>
          )}
        </div>
        <div className={styles.poolMeta}>
          {active.publishedAt && (
            <p>
              {tr("Released")} ·{" "}
              <time dateTime={active.publishedAt.toISOString()}>
                {new Intl.DateTimeFormat(tr.locale, {
                  timeZone: "UTC",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(active.publishedAt)}{" "}
                {tr("(UTC)")}
              </time>
            </p>
          )}
          <Link
            className={styles.poolLink}
            href={`/tournaments/${slug}/mappools/${active.id}`}
            aria-label={`${tr("Mappool")}: ${active.name} ↗`}
            title={`${tr("Mappool")}: ${active.name}`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M14 3h7v7m0-7L11 13M10 5H4v15h15v-6" />
            </svg>
          </Link>
        </div>
      </header>
      {pools.length > 1 ? (
        <WorkspaceTabs
          id={id}
          label={tr("Mappools")}
          appearance="line"
          value={active.id}
          onChange={setSelected}
          items={pools.map((pool) => ({
            value: pool.id,
            label: `${poolLabel(pool)} · ${pool.entries.length}`,
            literal: true,
          }))}
        />
      ) : (
        <h2 id={`${id}-name`} className={styles.singleName}>
          {active.name}
        </h2>
      )}
      <section
        id={`${id}-panel`}
        role={pools.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={pools.length > 1 ? `${id}-${active.id}` : `${id}-name`}
      >
        <MappoolBrowser key={active.id} slug={slug} pool={active} />
      </section>
    </div>
  );
}
