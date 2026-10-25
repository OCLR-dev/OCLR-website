"use client";

import { useAppTranslations } from "@/i18n/shared";

import Link from "next/link";
import { useState } from "react";
import type { publicMappools } from "@/lib/mappools";
import {
  categories,
  categoryNames,
  fmPolicyName,
  slotLabel,
  formatBeatmapNumber as number,
  formatBeatmapDuration as duration,
} from "@/lib/mappool-model";
import { BeatmapCover } from "./beatmap-cover";
import { MappoolView } from "./mappool-view";
import { BeatmapActions } from "./beatmap-actions";
import { MapDetailsDialog } from "./map-details-dialog";
type Pool = Awaited<ReturnType<typeof publicMappools>>[number];
type Entry = Pool["entries"][number];
function modRating(entry: Entry) {
  const m = entry.metadata;
  return m.attributes
    ? `${number(m.attributes.stars, 2)} ★ · ${m.attributes.configuration}`
    : entry.category === "NM"
      ? "No Mod uses base difficulty"
      : entry.category === "TB"
        ? "Variable mods"
        : "Not calculated";
}
function MapDetails({
  entry,
  pool,
  slug,
  previous,
  next,
  onMove,
  onClose,
}: {
  entry: Entry;
  pool: Pool;
  slug: string;
  previous?: Entry;
  next?: Entry;
  onMove: (id: string) => void;
  onClose: () => void;
}) {
  const tr = useAppTranslations();

  const m = entry.metadata;
  return (
    <MapDetailsDialog
      context={`${pool.name} / ${slotLabel(entry.category, entry.position)}`}
      title={m.title}
      artist={m.artist}
      subtitle={
        <>
          <span>[{m.difficulty}]</span>
          <span>{m.mapper}</span>
        </>
      }
      beatmapId={entry.beatmapId}
      setId={m.setId}
      previous={Boolean(previous)}
      next={Boolean(next)}
      onPrevious={() => previous && onMove(previous.id)}
      onNext={() => next && onMove(next.id)}
      onClose={onClose}
      permalink={
        <Link
          className="text-link map-detail-permalink"
          href={`/tournaments/${slug}/mappools/${pool.id}#map-${entry.id}`}
          onClick={onClose}
        >
          {tr("Map permalink")}
        </Link>
      }
    >
      <dl className="map-detail-grid">
        {[
          ["Base difficulty", `${number(m.stars, 2)} ★`],
          ["Official Mod SR", tr(modRating(entry))],
          ["Base BPM", number(m.bpm)],
          ["Base length", duration(m.duration)],
          [
            "AR / OD / CS / HP",
            [m.ar, m.od, m.cs, m.hp].map((v) => number(v)).join(" / "),
          ],
          ...(m.attributes
            ? [
                ["Ruleset", m.attributes.ruleset],
                ["Max combo", number(m.attributes.maxCombo)],
                ...Object.entries(m.attributes.values).map(([label, value]) => [
                  label.replaceAll("_", " "),
                  number(value),
                ]),
              ]
            : []),
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{tr(String(label))}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {entry.category === "FM" && (
        <p className="notice">
          {fmPolicyName(pool.fmMode) ?? tr("FM policy not configured")}
          {pool.fmRestrictions
            ? `: ${pool.fmRestrictions}`
            : tr(": Detailed restrictions have not been published.")}
        </p>
      )}
    </MapDetailsDialog>
  );
}
export function MappoolBrowser({
  pool,
  slug,
  headingLevel = 2,
}: {
  pool: Pool;
  slug: string;
  headingLevel?: 2 | 4 | 5;
}) {
  const tr = useAppTranslations();

  const CardHeading =
    headingLevel === 5 ? "h5" : headingLevel === 4 ? "h4" : "h2";
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("slot");
  const [view, setView] = useState("cards");
  const [selected, setSelected] = useState<string | null>(null);
  const ordered = categories.flatMap((c) =>
    pool.entries
      .filter((e) => e.category === c)
      .sort((a, b) => a.position - b.position),
  );
  const term = search.trim().toLocaleLowerCase();
  const entries = ordered.filter(
    (e) =>
      (!category || e.category === category) &&
      (!term ||
        [
          slotLabel(e.category, e.position),
          e.beatmapId,
          e.metadata.title,
          e.metadata.artist,
          e.metadata.mapper,
          e.metadata.difficulty,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(term)),
  );
  if (sort === "title")
    entries.sort((a, b) => a.metadata.title.localeCompare(b.metadata.title));
  if (sort === "stars")
    entries.sort((a, b) => b.metadata.stars - a.metadata.stars);
  const activeIndex = entries.findIndex((e) => e.id === selected);
  const active = entries[activeIndex];
  const mean =
    pool.entries.length &&
    pool.entries.every((e) => Number.isFinite(e.metadata.stars))
      ? pool.entries.reduce((sum, e) => sum + e.metadata.stars, 0) /
        pool.entries.length
      : null;
  return (
    <div className="mappool-browse">
      <div className="pool-summary">
        <span role="status">
          <strong>{entries.length}</strong> / {pool.entries.length}{" "}
          {tr(" released maps")}
        </span>
        {mean !== null && (
          <span>
            <strong>{number(mean, 2)} ★</strong> {tr(" average base SR")}
          </span>
        )}
        <span>
          {categories
            .filter((c) => pool.entries.some((e) => e.category === c))
            .join(" / ")}
        </span>
      </div>
      <div className="map-browse-toolbar">
        <div
          className="event-pills"
          role="group"
          aria-label={tr("{value0}: mod filter", { value0: pool.name })}
        >
          {[
            ["", "All mods"],
            ...categories
              .filter((c) => pool.entries.some((e) => e.category === c))
              .map((c) => [c, c]),
          ].map(([value, label]) => (
            <button
              className="secondary"
              key={value}
              type="button"
              aria-pressed={category === value}
              onClick={() => {
                setCategory(value);
                setSelected(null);
              }}
            >
              {tr(label)}
            </button>
          ))}
        </div>
        <div
          className="event-pills map-view-control"
          role="group"
          aria-label={tr("{value0}: map view", { value0: pool.name })}
        >
          {["cards", "compact"].map((value) => (
            <button
              className="secondary"
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => {
                setView(value);
                setSelected(null);
              }}
            >
              {value === "cards" ? tr("Map cards") : tr("Compact table")}
            </button>
          ))}
        </div>

        <label className="field map-search">
          <span className="sr-only">
            {tr("Search ")}
            {pool.name}
          </span>
          <input
            type="search"
            value={search}
            placeholder={tr("Title, artist, mapper or slot")}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected(null);
            }}
          />
        </label>
        <label className="field map-sort">
          <span className="sr-only">
            {tr("Sort ")}
            {pool.name}
          </span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setSelected(null);
            }}
          >
            <option value="slot">{tr("Slot order")}</option>
            <option value="title">{tr("Song title")}</option>
            <option value="stars">{tr("Base difficulty")}</option>
          </select>
        </label>
      </div>

      {view === "compact" ? (
        <MappoolView
          pool={{ ...pool, entries }}
          headingLevel={headingLevel}
          onSelect={setSelected}
          showCategoryLinks={false}
        />
      ) : (
        <>
          <p className="map-values-note muted small">
            {tr(
              "Base stars, BPM and length · Official mod SR shown separately.",
            )}
          </p>
          {pool.entries.some((e) => e.category === "FM") && (
            <p className="map-values-note muted small">
              {fmPolicyName(pool.fmMode) ?? tr("FM policy not configured")}
              {pool.fmRestrictions
                ? `: ${pool.fmRestrictions}`
                : tr(": Detailed restrictions have not been published.")}
            </p>
          )}
          <div className="map-card-grid">
            {entries.map((e) => (
              <article
                className="map-browse-card"
                id={`map-${e.id}`}
                key={e.id}
                data-category={e.category}
              >
                <div className="map-card-cover">
                  <BeatmapCover setId={e.metadata.setId} />
                  <span className="map-slot-badge">
                    {slotLabel(e.category, e.position)}
                  </span>
                </div>
                <div className="map-card-copy">
                  <p className="eyebrow">
                    {categoryNames[e.category]} · {e.metadata.artist}
                  </p>
                  <CardHeading>
                    <button
                      className="map-open-button"
                      type="button"
                      aria-label={tr("View {value0}: {value1}", {
                        value0: slotLabel(e.category, e.position),
                        value1: e.metadata.title,
                      })}
                      onClick={() => setSelected(e.id)}
                    >
                      {e.metadata.title}
                    </button>
                  </CardHeading>
                  <p className="muted small">[{e.metadata.difficulty}]</p>
                  <p className="muted small">
                    {e.metadata.mapper} {tr(" · BID ")}
                    {e.beatmapId}
                  </p>
                  <div className="map-card-values">
                    <span>
                      {number(e.metadata.stars, 2)} {tr(" ★ base")}
                    </span>
                    <span>
                      {number(e.metadata.bpm)} {tr(" BPM")}
                    </span>
                    <span>{duration(e.metadata.duration)}</span>
                  </div>
                  {e.category === "FM" && (
                    <p className="map-fm-policy muted small">
                      {fmPolicyName(pool.fmMode) ??
                        tr("FM policy not configured")}
                    </p>
                  )}
                  {(e.category !== "FM" || e.metadata.attributes) && (
                    <p className="map-mod-rating muted small">
                      {tr(modRating(e))}
                    </p>
                  )}
                  <BeatmapActions
                    beatmapId={e.beatmapId}
                    setId={e.metadata.setId}
                    compact
                    name={slotLabel(e.category, e.position)}
                  />
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {!entries.length && (
        <p className="notice">{tr("No beatmaps match these filters.")}</p>
      )}
      {active && (
        <MapDetails
          entry={active}
          pool={pool}
          slug={slug}
          previous={entries[activeIndex - 1]}
          next={entries[activeIndex + 1]}
          onMove={setSelected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
