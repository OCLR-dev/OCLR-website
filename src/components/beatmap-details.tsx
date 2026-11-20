import type { HistoricalMapSource } from "@/lib/exhibition-pools";
import { InfoNote } from "@/components/info-note";
import { useAppTranslations } from "@/i18n/shared";
import type { BeatmapMetadata, MappoolCategory } from "@/lib/mappool-model";
import { mappoolDisplayName } from "@/lib/mappool-label";
import {
  formatBeatmapDuration,
  formatBeatmapNumber,
} from "@/lib/mappool-model";
import { BeatmapCover } from "./beatmap-cover";
export function BeatmapDetails({
  beatmapId,
  metadata: m,
  label,
  category,
  fetchedAt,
  source,
  showBeatmapId = false,
}: {
  beatmapId: number;
  metadata: BeatmapMetadata;
  label?: string;
  category?: MappoolCategory;
  fetchedAt?: string;
  source?: HistoricalMapSource | null;
  showBeatmapId?: boolean;
}) {
  const tr = useAppTranslations();
  const attributes = Object.entries(m.attributes?.values ?? {});

  return (
    <div className="beatmap-row">
      <BeatmapCover key={m.setId} setId={m.setId} />
      <div className="beatmap-copy">
        {source && (
          <p className="muted small">
            {tr("Historical source")}: {source.editionName} ·{" "}
            {mappoolDisplayName(tr, source.poolName, source.poolId)} ·{" "}
            {source.slot}
          </p>
        )}
        {label && <span className="badge">{label}</span>}
        <h3>
          <a
            className="text-link"
            href={`https://osu.ppy.sh/beatmaps/${beatmapId}`}
          >
            <span className="beatmap-artist">{m.artist} — </span>
            {m.title} ↗
          </a>
        </h3>
        <p className="muted small">
          {m.difficulty} {tr(" · mapped by ")}
          {m.mapper}
          {showBeatmapId && (
            <span className="ml-1 inline-block">
              {" · "}
              {tr("BID")} {beatmapId}
            </span>
          )}
        </p>
        <p className="small beatmap-stats">
          <span>
            <strong>{formatBeatmapNumber(m.stars, 2)}</strong> {tr(" ★ base")}
          </span>{" "}
          <span>
            {formatBeatmapNumber(m.bpm)} {tr(" BPM")}
          </span>{" "}
          <span>{formatBeatmapDuration(m.duration)}</span>
        </p>
        {(m.ar !== undefined ||
          m.od !== undefined ||
          m.cs !== undefined ||
          m.hp !== undefined) && (
          <p className="small muted beatmap-parameters">
            {tr("Base AR ")}
            {formatBeatmapNumber(m.ar)} {tr(" · OD ")}
            {formatBeatmapNumber(m.od)} {tr("· CS ")}
            {formatBeatmapNumber(m.cs)} {tr(" · HP ")}
            {formatBeatmapNumber(m.hp)}
          </p>
        )}
        {m.attributes ? (
          <div className="small beatmap-adjusted">
            <p>
              {m.attributes.configuration} ·{" "}
              {formatBeatmapNumber(m.attributes.stars, 2)}{" "}
              {tr(" ★ official adjusted ·")} {m.attributes.ruleset}
              {m.attributes.maxCombo !== null
                ? tr(" · {value0} max combo", { value0: m.attributes.maxCombo })
                : ""}
            </p>
            {attributes.length > 0 && (
              <p className="muted">
                {tr("Official ruleset attributes")}
                {attributes.map(([key, value]) => (
                  <span className="ml-1 inline-block" key={key}>
                    {" · "}
                    {key.replaceAll("_", " ")} {Number(value.toFixed(3))}
                  </span>
                ))}
              </p>
            )}
          </div>
        ) : (
          category &&
          category !== "NM" && (
            <p className="muted small beatmap-adjusted">
              {tr("Mod-adjusted difficulty:")}{" "}
              {category === "FM" || category === "TB"
                ? tr("Variable")
                : tr("Not calculated")}
              .
            </p>
          )
        )}
        {fetchedAt && (
          <InfoNote>
            <p className="muted small">
              {tr("Official osu! API · Beatmap ")}
              {beatmapId} {tr(" / Set ")}
              {m.setId} {tr(" · Fetched")}{" "}
              <time dateTime={fetchedAt}>
                {new Date(fetchedAt)
                  .toISOString()
                  .replace("T", " ")
                  .slice(0, 19)}{" "}
                UTC
              </time>
            </p>
          </InfoNote>
        )}
      </div>
    </div>
  );
}
