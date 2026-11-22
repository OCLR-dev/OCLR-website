"use client";

import { Fragment } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { etxMods } from "@/lib/etx-rating-model";
import {
  profileSipTotal,
  type ProfileRatings,
} from "@/lib/profile-ratings-model";
import type { SipRating } from "@/lib/sip-rating-model";
import { BwsCardNote } from "./bws-card-note";
import styles from "./player-profile-ratings.module.css";

type Props = { ratings?: ProfileRatings | null };

function etxTimeLabel(
  etx: ProfileRatings["etx"] | undefined,
  tr: ReturnType<typeof useAppTranslations>,
) {
  if (etx?.source === "api") return tr("Elitebotix API · OCLR fetch time");
  if (etx?.source === "csv") return tr("S11 CSV · OCLR import time");
  return tr("Last updated");
}

function number(locale: string, value: number, fractionDigits?: number) {
  if (fractionDigits !== undefined) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  }
  const abs = Math.abs(value);
  return new Intl.NumberFormat(locale, {
    maximumSignificantDigits: 17,
    notation:
      abs >= 1e12 || (abs > 0 && abs < 1e-6) ? "scientific" : "standard",
  }).format(value);
}

function EtxTotal({
  etx,
  fractionDigits,
}: {
  etx?: ProfileRatings["etx"];
  fractionDigits?: number;
}) {
  const tr = useAppTranslations();
  if (!etx) return <>{tr("No rating data")}</>;
  return (
    <>
      {number(tr.locale, etx.value, fractionDigits)} ★
      {etx.provisional && <> · {tr("Provisional rating")}</>}
      {etx.outdated && <> · {tr("Outdated rating")}</>}
    </>
  );
}

export function CompactPlayerRatings({
  ratings,
  etxFractionDigits,
  showNotes = false,
}: Props & { etxFractionDigits?: number; showNotes?: boolean }) {
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
        <dd className={showNotes ? styles.compactValue : undefined}>
          {sip === null ? tr("No rating data") : number(tr.locale, sip)}
          {showNotes && <PlayerRatingNote provider="SIP" ratings={ratings} />}
        </dd>
      </div>
      <div>
        <dt>{tr("ETX")}</dt>
        <dd className={showNotes ? styles.compactValue : undefined}>
          <EtxTotal etx={ratings?.etx} fractionDigits={etxFractionDigits} />
          {showNotes && <PlayerRatingNote provider="ETX" ratings={ratings} />}
        </dd>
      </div>
    </dl>
  );
}

export function CoverPlayerRatings({ ratings }: Props) {
  const tr = useAppTranslations();
  const etx = ratings?.etx;
  const metrics = [
    {
      provider: "SIP" as const,
      label: tr("SIP"),
      value: profileSipTotal(ratings),
    },
    {
      provider: "ETX" as const,
      label: tr("ETX"),
      value: etx?.value ?? null,
      unit: " ★",
      fractionDigits: 2,
      provisional: etx?.provisional,
      outdated: etx?.outdated,
    },
  ];

  return metrics.map(
    ({
      provider,
      label,
      value,
      unit,
      fractionDigits,
      provisional,
      outdated,
    }) => (
      <Fragment key={provider}>
        <span className="bws-card-divider" aria-hidden="true" />
        <div className="bws-card-metric">
          <div className="bws-card-label-row">
            <span className="bws-card-label">{label}</span>
            <PlayerRatingNote provider={provider} ratings={ratings} />
          </div>
          <div className="bws-card-value-row">
            {value === null ? (
              <span className="bws-card-state">{tr("No rating data")}</span>
            ) : (
              <strong className="bws-value">
                {number(tr.locale, value, fractionDigits)}
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
    ),
  );
}

export function RatingObservation({
  label,
  time,
}: {
  label: string;
  time: string | null;
}) {
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
    <div>
      <h4>{title}</h4>
      {Object.entries(entries).map(([key, rating]) => (
        <SipIndicators key={key} label={key} rating={rating} />
      ))}
    </div>
  );
}

function PlayerRatingNote({
  provider,
  ratings,
}: Props & { provider: "SIP" | "ETX" }) {
  const tr = useAppTranslations();
  const api = ratings?.sip.api;
  const csv = ratings?.sip.csv;
  const etx = ratings?.etx;
  return (
    <BwsCardNote label={tr("About the {value0} rating", { value0: provider })}>
      <div className={styles.noteContent}>
        {provider === "SIP" ? (
          <>
            <p className="small muted">
              {tr("osu!standard tournament rating from SkillIssue.")}
            </p>
            {api?.value == null && csv && (
              <>
                <p>
                  {tr("Overall SIP rating")}: {number(tr.locale, csv.value)}
                </p>
                <RatingObservation
                  label={tr("S11 CSV · OCLR import time")}
                  time={csv.importedAt}
                />
              </>
            )}
            {api && (
              <RatingObservation
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
            <div className={styles.sipGroups}>
              <SipGroup
                title={tr("Mod ratings")}
                entries={api?.snapshot?.modifications}
              />
              <SipGroup
                title={tr("Skillset ratings")}
                entries={api?.snapshot?.skillsets}
              />
            </div>
          </>
        ) : (
          <>
            <p className="small muted">
              {tr("osu!standard tournament rating from Elitebotix.")}
            </p>
            {etx && (
              <RatingObservation
                label={etxTimeLabel(etx, tr)}
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
                        : `${number(tr.locale, stars, 2)} ★`}
                    </dd>
                  </div>
                );
              })}
              {etx &&
                (
                  [
                    [tr("Provisional rating"), etx.provisional],
                    [tr("Outdated rating"), etx.outdated],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {value === null
                        ? tr("Unknown")
                        : value
                          ? tr("Yes")
                          : tr("No")}
                    </dd>
                  </div>
                ))}
            </dl>
          </>
        )}
      </div>
    </BwsCardNote>
  );
}
