"use client";

import { BeatmapActions } from "./beatmap-actions";
import { BeatmapCover } from "./beatmap-cover";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { HistoricalArchive } from "@/lib/historical-archive";
import { formatBeatmapDuration } from "@/lib/mappool-model";
import { WorkspaceTabs } from "./workspace-tabs";

type MapEntry = HistoricalArchive["pools"][number]["maps"][number];
function ArchiveMapDetails({
  map,
  stats,
  setId,
  previous,
  next,
  onMove,
  onClose,
}: {
  map: MapEntry;
  stats: React.ReactNode;
  setId: number | null | undefined;
  previous?: MapEntry;
  next?: MapEntry;
  onMove: (slot: string) => void;
  onClose: () => void;
}) {
  const tr = useAppTranslations(),
    title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!,
      trigger = document.activeElement;
    node.showModal();
    return () => {
      node.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="map-dialog"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <span className="eyebrow">{map.slot}</span>
        <button
          type="button"
          className="secondary"
          aria-label={tr("Close map details")}
          onClick={onClose}
        >
          {tr("Close")}
        </button>
      </header>
      <div className="map-dialog-body">
        <div className="map-detail-identity">
          <BeatmapCover setId={setId} />
          <div>
            <h2 id={title}>{map.title}</h2>
            {map.mapper && !map.title.includes(map.mapper) && (
              <p className="muted">
                {tr("Mapper")}: {map.mapper}
              </p>
            )}
          </div>
        </div>
        {stats}
        <BeatmapActions beatmapId={map.beatmapId} setId={setId} />
        <div className="map-dialog-navigation">
          <button
            type="button"
            className="secondary"
            disabled={!previous}
            onClick={() => previous && onMove(previous.slot)}
          >
            {tr("Previous map")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!next}
            onClick={() => next && onMove(next.slot)}
          >
            {tr("Next map")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
type Pool = HistoricalArchive["pools"][number];
export function ArchiveMappools({
  pool,
  stages,
  artworkSetIds,
}: {
  pool: Pool;
  artworkSetIds: Record<number, number | null>;
  stages: { id: string; name: string; count: number; href: string }[];
}) {
  const tr = useAppTranslations(),
    tabId = useId();
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const strip = nav.current;
    const active = strip?.querySelector('[aria-current="page"]');
    if (!strip || !active) return;
    const item = active.getBoundingClientRect(),
      bounds = strip.getBoundingClientRect();
    if (item.left < bounds.left) strip.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right)
      strip.scrollLeft += item.right - bounds.right;
  }, [pool.id]);
  const [mod, setMod] = useState("all"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("slot"),
    [view, setView] = useState("cards"),
    [selected, setSelected] = useState<string | null>(null);
  // Preserve source order and literal titles; archive stats are not live osu! metadata.
  const mods = [...new Set(pool.maps.map((m) => m.slot.replace(/\d+$/, "")))];
  const query = search.trim().toLocaleLowerCase();
  const maps = pool.maps.filter(
    (m) =>
      (mod === "all" || m.slot.replace(/\d+$/, "") === mod) &&
      (!query ||
        [m.slot, m.title, m.mapper, m.beatmapId]
          .filter((v) => v !== null)
          .join(" ")
          .toLocaleLowerCase()
          .includes(query)),
  );
  const number = new Intl.NumberFormat(tr.locale, { maximumFractionDigits: 2 });
  if (sort === "title") maps.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "stars")
    maps.sort((a, b) => (b.stars ?? -Infinity) - (a.stars ?? -Infinity));
  const activeIndex = maps.findIndex((m) => m.slot === selected);
  const stats = (m: MapEntry) => (
    <dl className="archive-map-stats">
      {[
        [
          tr("SR"),
          m.stars,
          m.stars === null ? null : `${number.format(m.stars)} ★`,
        ],
        [tr("BPM"), m.bpm, m.bpm === null ? null : number.format(m.bpm)],
        [
          tr("Length"),
          m.drainSeconds,
          m.drainSeconds === null
            ? null
            : formatBeatmapDuration(m.drainSeconds),
        ],
        [tr("CS"), m.cs, m.cs === null ? null : number.format(m.cs)],
        [tr("AR"), m.ar, m.ar === null ? null : number.format(m.ar)],
        [tr("OD"), m.od, m.od === null ? null : number.format(m.od)],
      ].map(([label, raw, value]) => (
        <div key={String(label)}>
          <dt>{label}</dt>
          <dd title={raw === null ? tr("Not recorded") : String(raw)}>
            {value ?? <span aria-label={tr("Not recorded")}>—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="archive-pools mappool-browse">
      <nav
        ref={nav}
        className="archive-pool-stages"
        aria-label={tr("Mappool stages")}
      >
        {stages.map((s) => (
          <Link
            key={s.id}
            href={s.href}
            aria-current={s.id === pool.id ? "page" : undefined}
          >
            <span>{s.name}</span>
            <span className="archive-pool-count">{s.count}</span>
          </Link>
        ))}
      </nav>
      <div className="pool-summary">
        <p className="muted small" role="status">
          {tr("{shown} / {total} maps", {
            shown: maps.length,
            total: pool.maps.length,
          })}
        </p>
      </div>
      <div className="map-browse-toolbar">
        <div
          className="event-pills map-view-control"
          role="group"
          aria-label={tr("{value0}: map view", { value0: pool.name })}
        >
          {["cards", "compact"].map((value) => (
            <button
              type="button"
              className="secondary"
              key={value}
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
        <label className="field map-sort">
          <span className="sr-only">
            {tr("Sort ")}
            {pool.name}
          </span>
          <select
            aria-label={`${tr("Sort ")}${pool.name}`}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setSelected(null);
            }}
          >
            <option value="slot">{tr("Slot order")}</option>
            <option value="title">{tr("Song title")}</option>
            <option value="stars">{tr("SR")}</option>
          </select>
        </label>
        <label className="field map-search">
          <span className="sr-only">{tr("Search maps")}</span>
          <input
            type="search"
            placeholder={tr("Title, mapper, slot or beatmap ID")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <WorkspaceTabs
        id={tabId}
        label={tr("Mod filter")}
        appearance="line"
        value={mod}
        onChange={setMod}
        items={[
          { value: "all", label: tr("All mods") },
          ...mods.map((value) => ({ value, label: value })),
        ]}
      />
      <div
        id={`${tabId}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabId}-${mod}`}
        tabIndex={0}
      >
        <h2 className="sr-only">{pool.name}</h2>
        {maps.length ? (
          <ol
            className={
              view === "cards"
                ? "archive-map-cards map-card-grid"
                : "archive-map-list"
            }
          >
            {maps.map((m) => (
              <li
                className={
                  view === "cards"
                    ? "archive-map-item map-browse-card"
                    : "archive-map-item"
                }
                key={m.slot}
                id={`map-${m.slot}`}
                data-category={m.slot.replace(/\d+$/, "")}
              >
                {view === "cards" ? (
                  <div className="map-card-cover">
                    <BeatmapCover
                      setId={m.beatmapId ? artworkSetIds[m.beatmapId] : null}
                    />
                    <span className="map-slot-badge">{m.slot}</span>
                  </div>
                ) : (
                  <div className="archive-map-thumbnail">
                    <BeatmapCover
                      setId={m.beatmapId ? artworkSetIds[m.beatmapId] : null}
                      compact
                    />
                    <span className="archive-map-slot">{m.slot}</span>
                  </div>
                )}
                <div
                  className={
                    view === "cards"
                      ? "map-card-copy"
                      : "archive-map-compact-copy"
                  }
                >
                  <div className="archive-map-identity">
                    <h3>
                      <button
                        type="button"
                        className="map-open-button"
                        aria-label={tr("View {value0}: {value1}", {
                          value0: m.slot,
                          value1: m.title,
                        })}
                        onClick={() => setSelected(m.slot)}
                      >
                        {m.title}
                      </button>
                    </h3>
                    <p className="muted small">
                      {tr("Mapper")}: {m.mapper ?? tr("Not recorded")}
                      {m.beatmapId ? (
                        <>
                          {" "}
                          · <span>#{m.beatmapId}</span>
                        </>
                      ) : (
                        <> · {tr("Beatmap ID unresolved")}</>
                      )}
                    </p>
                  </div>
                  {stats(m)}
                  <BeatmapActions
                    compact
                    beatmapId={m.beatmapId}
                    setId={m.beatmapId ? artworkSetIds[m.beatmapId] : null}
                    name={m.slot}
                  />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="notice">{tr("No maps match these filters.")}</p>
        )}
      </div>
      {maps[activeIndex] && (
        <ArchiveMapDetails
          map={maps[activeIndex]}
          setId={
            maps[activeIndex].beatmapId
              ? artworkSetIds[maps[activeIndex].beatmapId!]
              : null
          }
          stats={stats(maps[activeIndex])}
          previous={maps[activeIndex - 1]}
          next={maps[activeIndex + 1]}
          onMove={setSelected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
