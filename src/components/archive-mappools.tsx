"use client";

import { InfoNote } from "@/components/info-note";

import { BeatmapActions } from "./beatmap-actions";
import { BeatmapCover } from "./beatmap-cover";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import {
  parseArchiveTitle,
  type ArchiveDisplayMap,
  type ArchiveDisplayPool,
} from "@/lib/archive-map-metadata";
import { formatBeatmapDuration } from "@/lib/mappool-model";
import { MapCardBand } from "./map-card-band";
import { WorkspaceTabs } from "./workspace-tabs";
import {
  displayDifficulty,
  type DifficultyChoice,
} from "@/lib/difficulty-display";
import {
  DifficultyControls,
  DifficultyReadout,
  DifficultyStatus,
} from "./difficulty-display";

type MapEntry = ArchiveDisplayMap;
function ArchiveMapDetails({
  map,
  stats,
  setId,
  originalSetId,
  beatmapMissing,
  previous,
  next,
  onMove,
  onClose,
}: {
  map: MapEntry;
  stats: React.ReactNode;
  setId: number | null | undefined;
  originalSetId: number | null | undefined;
  beatmapMissing?: boolean;
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
          <BeatmapCover
            setId={setId}
            coverPath={map.coverPath}
            backgroundSetId={map.backgroundSetId}
            fallbackSetId={originalSetId}
          />
          <div>
            <h2 id={title}>{map.title ?? tr("Not recorded")}</h2>
            {map.artist && <p className="muted">{map.artist}</p>}
            {map.difficulty && (
              <p className="muted">
                {tr("Difficulty")}: {map.difficulty}
              </p>
            )}
            {map.mapper && !map.title?.includes(map.mapper) && (
              <p className="muted">
                {tr("Mapper")}: {map.mapper}
              </p>
            )}
          </div>
        </div>
        {stats}
        {map.backgroundSetId && (
          <p className="muted small">
            {tr("Alternative background")}:{" "}
            <a
              href={`https://osu.ppy.sh/beatmapsets/${map.backgroundSetId}`}
              aria-label={tr("Alternative background")}
              target="_blank"
              rel="noreferrer"
            >
              {tr("Source")}
            </a>
          </p>
        )}
        <BeatmapActions
          beatmapId={map.beatmapId}
          downloadMirror={map.downloadMirror}
          setId={setId}
          searchTitle={parseArchiveTitle(map.title)?.title ?? map.title}
          originalBeatmapId={map.originalId}
          originalSetId={originalSetId}
          beatmapMissing={beatmapMissing}
          preferOriginal={map.preferOriginal}
        />
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
type Pool = ArchiveDisplayPool;
export function ArchiveMappools({
  pool,
  stages,
  artworkSetIds,
  missingBeatmapIds = [],
}: {
  pool: Pool;
  artworkSetIds: Record<number, number | null>;
  missingBeatmapIds?: number[];
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
  const [choice, setChoice] = useState<DifficultyChoice>({
    adjusted: false,
    fm: "",
  });
  const difficulty = (m: MapEntry) =>
    displayDifficulty(
      {
        beatmapId: m.beatmapId,
        category: m.slot.replace(/\d+$/, ""),
        historical: true,
        snapshot: m.difficultySnapshot,
        base: {
          stars: m.stars,
          bpm: m.bpm,
          duration: m.drainSeconds,
          ar: m.ar,
          od: m.od,
          cs: m.cs,
          hp: m.hp ?? null,
        },
      },
      choice,
    );
  // Preserve source order and literal titles; archive stats are not live osu! metadata.
  const mods = [...new Set(pool.maps.map((m) => m.slot.replace(/\d+$/, "")))];
  const query = search.trim().toLocaleLowerCase();
  const maps = pool.maps.filter(
    (m) =>
      (mod === "all" || m.slot.replace(/\d+$/, "") === mod) &&
      (!query ||
        [
          m.slot,
          m.title,
          m.artist,
          m.difficulty,
          m.mapper,
          m.beatmapId,
          m.originalId,
        ]
          .filter((v) => v !== null)
          .join(" ")
          .toLocaleLowerCase()
          .includes(query)),
  );
  const number = new Intl.NumberFormat(tr.locale, { maximumFractionDigits: 2 });
  if (sort === "title")
    maps.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
  if (sort === "stars")
    maps.sort(
      (a, b) =>
        (difficulty(b).values.stars ?? -Infinity) -
        (difficulty(a).values.stars ?? -Infinity),
    );
  const activeIndex = maps.findIndex((m) => m.slot === selected);
  const artwork = (m: MapEntry) => {
    const originalSetId = m.originalId
      ? (artworkSetIds[m.originalId] ?? null)
      : null;
    return {
      beatmapMissing: !!m.beatmapId && missingBeatmapIds.includes(m.beatmapId),
      setId:
        m.beatmapSetId ??
        (m.preferOriginal
          ? originalSetId
          : m.beatmapId
            ? (artworkSetIds[m.beatmapId] ?? null)
            : null),
      originalSetId,
    };
  };
  const active = maps[activeIndex];
  const activeArtwork = active ? artwork(active) : null;
  const fieldLabels = {
    title: tr("Song title"),
    artist: tr("Artist"),
    difficulty: tr("Difficulty"),
    mapper: tr("Mapper"),
    stars: tr("SR"),
    bpm: tr("BPM"),
    drainSeconds: tr("Length"),
    cs: tr("CS"),
    ar: tr("AR"),
    od: tr("OD"),
    hp: tr("HP"),
  };
  const supplemented = (m: MapEntry) =>
    (m.supplemented?.length || m.archivalSource) && (
      <>
        {!!m.supplemented?.length && (
          <InfoNote>
            <p className="muted small">
              {tr(
                "Missing archive fields supplemented with current osu! base metadata (no mods): {fields}.",
                {
                  fields: m.supplemented
                    .map((field) => fieldLabels[field])
                    .join(", "),
                },
              )}{" "}
              <a href={m.metadataSource} target="_blank" rel="noreferrer">
                {tr("Source")}
              </a>{" "}
              <time dateTime={m.metadataFetchedAt}>
                {m.metadataFetchedAt?.slice(0, 10)}
              </time>
            </p>
          </InfoNote>
        )}
        {m.archivalSource && (
          <InfoNote>
            <p className="muted small">
              {tr("Historical source")}:{" "}
              {m.archivalSupplemented
                ?.map((field) => fieldLabels[field])
                .join(", ")}{" "}
              <a href={m.archivalSource} target="_blank" rel="noreferrer">
                {tr("Source")}
              </a>
            </p>
          </InfoNote>
        )}
      </>
    );
  const stats = (original: MapEntry) => {
    const d = difficulty(original),
      m = { ...original, ...d.values, drainSeconds: d.values.duration };
    return (
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
          [tr("HP"), m.hp, m.hp === null ? null : number.format(m.hp)],
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
  };
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
      <div className="map-browse-settings">
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
        <DifficultyControls
          choice={choice}
          onChange={setChoice}
          hasFM={pool.maps.some((m) => /^FM\d*$/.test(m.slot))}
        />
      </div>
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
            {maps.map((m) => {
              const { setId, originalSetId, beatmapMissing } = artwork(m);
              const d = difficulty(m),
                values = d.values;
              if (view === "cards") {
                const parsed = parseArchiveTitle(m.title);
                return (
                  <MapCardBand
                    as="li"
                    className="archive-map-item"
                    key={m.slot}
                    id={`map-${m.slot}`}
                    dataCategory={m.slot.replace(/\d+$/, "")}
                    slot={m.slot}
                    title={parsed?.title ?? m.title ?? tr("Not recorded")}
                    searchTitle={parsed?.title ?? m.title}
                    artist={parsed?.artist ?? m.artist}
                    difficulty={parsed?.difficulty ?? m.difficulty}
                    mapper={parsed?.mapper ?? m.mapper}
                    beatmapId={m.beatmapId}
                    downloadMirror={m.downloadMirror}
                    setId={setId}
                    coverPath={m.coverPath}
                    backgroundSetId={m.backgroundSetId}
                    originalBeatmapId={m.originalId}
                    originalSetId={originalSetId}
                    beatmapMissing={beatmapMissing}
                    preferOriginal={m.preferOriginal}
                    stars={values.stars}
                    bpm={values.bpm}
                    durationSeconds={values.duration}
                    cs={values.cs}
                    ar={values.ar}
                    od={values.od}
                    hp={values.hp}
                    chips={<DifficultyStatus display={d} />}
                    headingLevel={3}
                    openLabel={tr("View {value0}: {value1}", {
                      value0: m.slot,
                      value1: m.title ?? tr("Not recorded"),
                    })}
                    onOpen={() => setSelected(m.slot)}
                    note={supplemented(m)}
                  />
                );
              }
              return (
                <li
                  className="archive-map-item"
                  key={m.slot}
                  id={`map-${m.slot}`}
                  data-category={m.slot.replace(/\d+$/, "")}
                >
                  <div className="archive-map-thumbnail">
                    <BeatmapCover
                      setId={setId}
                      coverPath={m.coverPath}
                      backgroundSetId={m.backgroundSetId}
                      fallbackSetId={originalSetId}
                      compact
                    />
                    <span className="archive-map-slot">{m.slot}</span>
                  </div>
                  <div className="archive-map-compact-copy">
                    <div className="archive-map-identity">
                      <h3>
                        <button
                          type="button"
                          className="map-open-button"
                          aria-label={tr("View {value0}: {value1}", {
                            value0: m.slot,
                            value1: m.title ?? tr("Not recorded"),
                          })}
                          onClick={() => setSelected(m.slot)}
                        >
                          {m.title ?? tr("Not recorded")}
                        </button>
                      </h3>
                      {m.artist && <p className="muted small">{m.artist}</p>}
                      {m.difficulty && (
                        <p className="muted small">
                          {tr("Difficulty")}: {m.difficulty}
                        </p>
                      )}
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
                      <DifficultyStatus display={d} />
                      {supplemented(m)}
                    </div>
                    {stats(m)}
                    <BeatmapActions
                      compact
                      beatmapId={m.beatmapId}
                      downloadMirror={m.downloadMirror}
                      setId={setId}
                      searchTitle={parseArchiveTitle(m.title)?.title ?? m.title}
                      originalBeatmapId={m.originalId}
                      originalSetId={originalSetId}
                      beatmapMissing={beatmapMissing}
                      preferOriginal={m.preferOriginal}
                      name={m.slot}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="notice">{tr("No maps match these filters.")}</p>
        )}
      </div>
      {active && activeArtwork && (
        <ArchiveMapDetails
          map={active}
          setId={activeArtwork.setId}
          originalSetId={activeArtwork.originalSetId}
          beatmapMissing={activeArtwork.beatmapMissing}
          stats={
            <>
              <DifficultyReadout display={difficulty(active)} />
              {active.difficultySnapshot && (
                <details>
                  <summary>{tr("Recorded historical values")}</summary>
                  <p>
                    {active.stars ?? "—"} ★ · {active.bpm ?? "—"} {tr("BPM")} ·{" "}
                    {formatBeatmapDuration(active.drainSeconds)} · {tr("AR")}{" "}
                    {active.ar ?? "—"} / {tr("OD")} {active.od ?? "—"} /{" "}
                    {tr("CS")} {active.cs ?? "—"}
                  </p>
                </details>
              )}
              {supplemented(active)}
            </>
          }
          previous={maps[activeIndex - 1]}
          next={maps[activeIndex + 1]}
          onMove={setSelected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
