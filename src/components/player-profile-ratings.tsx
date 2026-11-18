"use client";

import { Fragment } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { etxMods } from "@/lib/etx-rating-model";
import {
  profileSipTotal,
  type ProfileRatings,
} from "@/lib/profile-ratings-model";
import type { SipRating } from "@/lib/sip-rating-model";
import styles from "./player-profile-ratings.module.css";

type Props = { ratings?: ProfileRatings | null };

function number(locale: string, value: number) {
  const abs = Math.abs(value);
  return new Intl.NumberFormat(locale, {
    maximumSignificantDigits: 17,
    notation:
      abs >= 1e12 || (abs > 0 && abs < 1e-6) ? "scientific" : "standard",
  }).format(value);
}

function EtxTotal({ etx }: { etx?: ProfileRatings["etx"] }) {
  const tr = useAppTranslations();
  if (!etx) return <>{tr("No rating data")}</>;
  return (
    <>
      {number(tr.locale, etx.value)} ★
      {etx.provisional && <> · {tr("Provisional rating")}</>}
      {etx.outdated && <> · {tr("Outdated rating")}</>}
    </>
  );
}

export function CompactPlayerRatings({ ratings }: Props) {
  const tr = useAppTranslations();
  const sip = profileSipTotal(ratings);
  return (
    <dl className={styles.compactMetrics}>
      <div>
        <dt>o!TR</dt>
        <dd>
          {ratings?.otr
            ? new Intl.NumberFormat(tr.locale, {
                maximumFractionDigits: 2,
              }).format(ratings.otr.value)
            : tr("No rating data")}
        </dd>
      </div>
      <div>
        <dt>{tr("SIP")}</dt>
        <dd>{sip === null ? tr("No rating data") : number(tr.locale, sip)}</dd>
      </div>
      <div>
        <dt>{tr("ETX")}</dt>
        <dd>
          <EtxTotal etx={ratings?.etx} />
        </dd>
      </div>
    </dl>
  );
}

export function CoverPlayerRatings({ ratings }: Props) {
  const tr = useAppTranslations();
  const etx = ratings?.etx;
  const metrics = [
    { label: tr("SIP"), value: profileSipTotal(ratings) },
    {
      label: tr("ETX"),
      value: etx?.value ?? null,
      unit: " ★",
      provisional: etx?.provisional,
      outdated: etx?.outdated,
    },
  ];

  return metrics.map(({ label, value, unit, provisional, outdated }) => (
    <Fragment key={label}>
      <span className="bws-card-divider" aria-hidden="true" />
      <div className="bws-card-metric">
        <span className="bws-card-label">{label}</span>
        <div className="bws-card-value-row">
          {value === null ? (
            <span className="bws-card-state">{tr("No rating data")}</span>
          ) : (
            <strong className="bws-value">
              {number(tr.locale, value)}
              {unit}
            </strong>
          )}
        </div>
        {provisional && (
          <span className="bws-card-state">{tr("Provisional rating")}</span>
        )}
        {outdated && (
          <span className="bws-card-state">{tr("Outdated rating")}</span>
        )}
      </div>
    </Fragment>
  ));
}

function Observation({ label, time }: { label: string; time: string | null }) {
  const tr = useAppTranslations();
  return (
    <p className="small muted">
      {label}:{" "}
      {time === null ? (
        tr("Unavailable")
      ) : (
        <time dateTime={time}>
          {new Intl.DateTimeFormat(tr.locale, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "UTC",
          }).format(new Date(time))}{" "}
          UTC
        </time>
      )}
    </p>
  );
}

function SipIndicators({
  label,
  rating,
}: {
  label: string;
  rating: SipRating;
}) {
  const tr = useAppTranslations();
  const percent = new Intl.NumberFormat(tr.locale, {
    style: "percent",
    maximumFractionDigits: 2,
  });
  return (
    <details>
      <summary>
        {label}: {number(tr.locale, rating.value)}
      </summary>
      <dl className={styles.detailedMetrics}>
        <div>
          <dt>{tr("SIP SR")}</dt>
          <dd>{number(tr.locale, rating.sr)} ★</dd>
        </div>
        <div>
          <dt>{tr("SIP PP")}</dt>
          <dd>{number(tr.locale, rating.pp)}</dd>
        </div>
        <div>
          <dt>{tr("SIP global rank")}</dt>
          <dd>#{number(tr.locale, rating.globalRank)}</dd>
        </div>
        <div>
          <dt>{tr("SIP country rank")}</dt>
          <dd>#{number(tr.locale, rating.countryRank)}</dd>
        </div>
        <div>
          <dt>{tr("Model accuracy share")}</dt>
          <dd>{percent.format(rating.accuracy)}</dd>
        </div>
        <div>
          <dt>{tr("Model combo share")}</dt>
          <dd>{percent.format(rating.combo)}</dd>
        </div>
      </dl>
    </details>
  );
}

function SipGroup({
  title,
  entries,
}: {
  title: string;
  entries?: Record<string, SipRating> | null;
}) {
  if (!entries || !Object.keys(entries).length) return null;
  return (
    <>
      <h4>{title}</h4>
      {Object.entries(entries).map(([key, rating]) => (
        <SipIndicators key={key} label={key} rating={rating} />
      ))}
    </>
  );
}

export function PlayerRatingDetails({ ratings }: Props) {
  const tr = useAppTranslations();
  const api = ratings?.sip.api;
  const csv = ratings?.sip.csv;
  const total = profileSipTotal(ratings);
  const etx = ratings?.etx;
  return (
    <section className="panel" aria-label={tr("Tournament ratings")}>
      <h2>{tr("Tournament ratings")}</h2>
      <div className={styles.sources}>
        <section>
          <h3>{tr("SkillIssue (SIP)")}</h3>
          <p>
            <strong>
              {total === null ? tr("No rating data") : number(tr.locale, total)}
            </strong>
          </p>
          {api?.value == null && csv && (
            <Observation
              label={tr("S11 CSV · OCLR import time")}
              time={csv.importedAt}
            />
          )}
          {api && (
            <Observation
              label={tr("SkillIssue API · OCLR fetch time")}
              time={api.fetchedAt}
            />
          )}
          {api?.snapshot?.rating && (
            <SipIndicators
              label={tr("Overall SIP rating")}
              rating={api.snapshot.rating}
            />
          )}
          <SipGroup
            title={tr("Mod ratings")}
            entries={api?.snapshot?.modifications}
          />
          <SipGroup
            title={tr("Skillset ratings")}
            entries={api?.snapshot?.skillsets}
          />
        </section>
        <section>
          <h3>{tr("Elitebotix (ETX)")}</h3>
          <p>
            <strong>
              <EtxTotal etx={etx} />
            </strong>
          </p>
          {etx && (
            <Observation
              label={tr("S11 CSV · OCLR import time")}
              time={etx.importedAt}
            />
          )}
          <dl className={styles.detailedMetrics}>
            {etxMods.map((mod) => {
              const stars = etx?.mods?.[mod];
              return (
                <div key={mod}>
                  <dt>{mod}</dt>
                  <dd>
                    {stars == null
                      ? tr("No rating data")
                      : `${number(tr.locale, stars)} ★`}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      </div>
    </section>
  );
}
