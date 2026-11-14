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
}: {
  beatmapId: number;
  metadata: BeatmapMetadata;
  label?: string;
  category?: MappoolCategory;
  fetchedAt?: string;
  source?: HistoricalMapSource | null;
}) {
  const tr = useAppTranslations();

  return (
    <div className="beatmap-row">
      <BeatmapCover key={m.setId} setId={m.setId} />
      <div className="beatmap-copy">
        {source && (
          <p className="muted small">
            {tr("Historical source")}: {source.editionName} ·{" "}
            {mappoolDisplayName(tr, source.poolName, source.poolId)}{" "}
            · {source.slot}
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
            {Object.keys(m.attributes.values).length > 0 && (
              <details>
                <summary>{tr("Official ruleset attributes")}</summary>
                <dl className="detail-list">
                  {Object.entries(m.attributes.values).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key.replaceAll("_", " ")}</dt>
                      <dd>{Number(value.toFixed(3))}</dd>
                    </div>
                  ))}
                </dl>
              </details>
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
