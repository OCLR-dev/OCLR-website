import { useAppTranslations } from "@/i18n/shared";
import type { publicMappools } from "@/lib/mappools";
import {
  categories,
  categoryNames,
  fmModeNames,
  fmPolicyName,
  slotLabel,
  formatBeatmapDuration,
  formatBeatmapNumber,
} from "@/lib/mappool-model";
import { BeatmapCover } from "./beatmap-cover";
import { BeatmapActions } from "./beatmap-actions";

type Pool = Awaited<ReturnType<typeof publicMappools>>[number];
const columns = [
  "Base SR",
  "Official Mod SR",
  "BPM",
  "Length",
  "AR / OD / CS / HP",
] as const;

function MappoolRow({
  entry: e,
  fmMode,
  onSelect,
}: {
  entry: Pool["entries"][number];
  fmMode: Pool["fmMode"];
  onSelect?: (id: string) => void;
}) {
  const tr = useAppTranslations();

  const m = e.metadata;
  const url = `https://osu.ppy.sh/beatmaps/${e.beatmapId}`;
  const fields = [
    <span className="mappool-base-sr" key="base">
      {formatBeatmapNumber(m.stars, 2)}
      <span aria-hidden="true"> ★</span>
    </span>,
    m.attributes ? (
      <details className="mappool-mod-attributes" key="mods">
        <summary>
          {formatBeatmapNumber(m.attributes.stars, 2)}
          <small>{m.attributes.configuration}</small>
        </summary>
        <dl>
          <div>
            <dt>{tr("Ruleset")}</dt>
            <dd>{m.attributes.ruleset}</dd>
          </div>
          <div>
            <dt>{tr("Max combo")}</dt>
            <dd>{formatBeatmapNumber(m.attributes.maxCombo)}</dd>
          </div>
          {Object.entries(m.attributes.values).map(([key, value]) => (
            <div key={key}>
              <dt>{key.replaceAll("_", " ")}</dt>
              <dd>{formatBeatmapNumber(value)}</dd>
            </div>
          ))}
        </dl>
      </details>
    ) : (
      <span className="muted" key="mods">
        {e.category === "NM" ? (
          <span title={tr("Base SR is the No Mod difficulty")}>—</span>
        ) : e.category === "FM" || e.category === "TB" ? (
          tr("Variable")
        ) : (
          tr("Not calculated")
        )}
      </span>
    ),
    formatBeatmapNumber(m.bpm),
    formatBeatmapDuration(m.duration),
    <dl className="mappool-parameters" key="parameters">
      {(["AR", "OD", "CS", "HP"] as const).map((label) => (
        <div key={label}>
          <dt>{tr(label)}</dt>
          <dd>
            {formatBeatmapNumber(
              m[label.toLowerCase() as "ar" | "od" | "cs" | "hp"],
            )}
          </dd>
        </div>
      ))}
    </dl>,
  ];
  return (
    <tr id={`map-${e.id}`}>
      <th scope="row" className="mappool-slot-cell">
        <span className="mappool-slot">
          {slotLabel(e.category, e.position)}
        </span>
      </th>
      <td className="mappool-map">
        <div className="mappool-map-identity">
          <BeatmapCover setId={m.setId} compact />
          <div>
            {onSelect ? (
              <button
                type="button"
                className="map-open-button mappool-map-title"
                onClick={() => onSelect(e.id)}
                aria-label={tr("View {value0}: {value1}", {
                  value0: slotLabel(e.category, e.position),
                  value1: m.title,
                })}
              >
                <span>{m.artist} — </span>
                {m.title}
              </button>
            ) : (
              <a className="mappool-map-title" href={url}>
                <span>{m.artist} — </span>
                {m.title}
              </a>
            )}
            <p className="mappool-difficulty">[{m.difficulty}]</p>
            <p className="mappool-map-credit">
              <span>{m.mapper}</span>
              <span aria-hidden="true"> · </span>
              <a href={url}>
                {tr("BID ")}
                {e.beatmapId}
              </a>
            </p>
            {e.category === "FM" && (
              <p className="mappool-fm-policy small muted">
                {fmPolicyName(fmMode) ?? tr("FM policy not configured")}
              </p>
            )}
          </div>
        </div>
        <details className="mappool-mobile-details">
          <summary>
            <span>
              {formatBeatmapNumber(m.stars, 2)} {tr(" ★ base ·")}{" "}
              {formatBeatmapNumber(m.bpm)} {tr(" BPM ·")}{" "}
              {formatBeatmapDuration(m.duration)}
            </span>
            <span className="text-link">{tr("Details")}</span>
          </summary>
          <dl>
            {fields.map((value, i) => (
              <div key={columns[i]}>
                <dt>{tr(columns[i])}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      </td>
      {fields.map((value, i) => (
        <td className="mappool-extra" key={columns[i]}>
          {value}
        </td>
      ))}
      <td className="mappool-actions-cell">
        <BeatmapActions
          beatmapId={e.beatmapId}
          setId={m.setId}
          compact
          name={slotLabel(e.category, e.position)}
        />
      </td>
    </tr>
  );
}
export function MappoolView({
  pool,
  headingLevel = 2,
  onSelect,
  showCategoryLinks = true,
}: {
  pool: Pool;
  headingLevel?: 2 | 4 | 5;
  onSelect?: (id: string) => void;
  showCategoryLinks?: boolean;
}) {
  const tr = useAppTranslations();

  const populated = categories.filter((category) =>
    pool.entries.some((entry) => entry.category === category),
  );
  const prefix = `pool-${pool.id}`;
  const Heading = headingLevel === 5 ? "h5" : headingLevel === 4 ? "h4" : "h2";
  if (!populated.length)
    return (
      <p className="muted small">
        {tr("No beatmaps have been released for this pool.")}
      </p>
    );
  return (
    <div className="mappool-public">
      {showCategoryLinks && populated.length > 1 && (
        <nav
          className="mappool-category-links"
          aria-label={tr("{value0}: map categories", { value0: pool.name })}
        >
          {populated.map((category) => (
            <a key={category} href={`#${prefix}-maps-${category}`}>
              {category}{" "}
              <span>
                {
                  pool.entries.filter((entry) => entry.category === category)
                    .length
                }
              </span>
            </a>
          ))}
        </nav>
      )}
      <p id={`${prefix}-values`} className="mappool-values muted small">
        {populated.every((category) => category === "NM")
          ? tr("NM uses Base SR and unmodified map stats.")
          : tr(
              "Base stats are unmodified. Mod SR is calculated for the shown mods.",
            )}
      </p>
      {populated.map((category) => {
        const entries = pool.entries.filter(
          (entry) => entry.category === category,
        );
        const name =
          category === "FM" && pool.fmMode
            ? pool.fmMode === "free_mod"
              ? fmModeNames.free_mod
              : fmModeNames.force_mod
            : categoryNames[category];
        return (
          <section
            className="mappool-category"
            id={`${prefix}-maps-${category}`}
            key={category}
            aria-labelledby={`${prefix}-maps-${category}-title`}
          >
            <div className="mappool-category-heading">
              <Heading id={`${prefix}-maps-${category}-title`}>
                <strong>{category}</strong>
                <span>{name}</span>
              </Heading>
              <span className="muted small">
                {entries.length} {entries.length === 1 ? tr("map") : tr("maps")}
              </span>
            </div>
            {category === "FM" && (
              <p className="mappool-fm-note muted small">
                {name}:{" "}
                {pool.fmRestrictions ||
                  tr("Detailed mod restrictions have not been published.")}
              </p>
            )}
            <div
              className="table-scroll"
              role="region"
              aria-label={tr("{value0}: {value1} beatmaps", {
                value0: pool.name,
                value1: category,
              })}
              tabIndex={0}
            >
              <table
                className="mappool-sheet"
                aria-describedby={`${prefix}-values`}
              >
                <caption
                  id={`${prefix}-maps-${category}-caption`}
                  className="sr-only"
                >
                  {pool.name}: {category} / {tr(name)} {tr(" beatmaps")}
                </caption>
                <colgroup>
                  <col className="mappool-col-slot" />
                  <col />
                  <col className="mappool-extra mappool-col-sr" />
                  <col className="mappool-extra mappool-col-mod-sr" />
                  <col className="mappool-extra mappool-col-bpm" />
                  <col className="mappool-extra mappool-col-length" />
                  <col className="mappool-extra mappool-col-parameters" />
                  <col className="mappool-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className="mappool-slot-cell">
                      {tr("Slot")}
                    </th>
                    <th scope="col">{tr("Beatmap / Difficulty")}</th>
                    {columns.map((label) => (
                      <th className="mappool-extra" scope="col" key={label}>
                        {tr(label)}
                      </th>
                    ))}
                    <th scope="col" className="mappool-actions-cell">
                      <span className="sr-only">{tr("Actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <MappoolRow
                      key={entry.id}
                      entry={entry}
                      fmMode={pool.fmMode}
                      onSelect={onSelect}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
