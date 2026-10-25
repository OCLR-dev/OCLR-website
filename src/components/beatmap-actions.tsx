import { useAppTranslations } from "@/i18n/shared";
import { beatmapLinks } from "@/lib/beatmap-links";

function ActionIcon({ kind }: { kind: "web" | "direct" }) {
  if (kind === "direct")
    return (
      // Font Awesome Free 5.15.4, solid/download (CC BY 4.0).
      // Same icon as osu-web's direct button; see LICENSES/Font-Awesome-Free.md.
      <svg
        width="18"
        height="18"
        viewBox="0 0 512 512"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z" />
      </svg>
    );
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3h7v7m0-7L11 13" />
      <path d="M10 5H4v15h15v-6" />
    </svg>
  );
}

export function BeatmapActions({
  beatmapId,
  setId,
  compact = false,
  name,
}: {
  beatmapId: number | null | undefined;
  setId: number | null | undefined;
  compact?: boolean;
  name?: string;
}) {
  const tr = useAppTranslations();
  const links = beatmapLinks(beatmapId, setId);
  const labels = {
    web: tr("Open on osu!"),
    direct: tr("osu!direct"),
  };
  if (!links.web && !links.direct)
    return compact ? null : (
      <p className="muted small">{tr("Beatmap ID unresolved")}</p>
    );
  return (
    <div
      className={`beatmap-actions${compact ? " beatmap-actions-compact" : ""}`}
    >
      {(["direct", "web"] as const).map(
        (kind) =>
          links[kind] && (
            <a
              key={kind}
              href={links[kind]!}
              className={`button${kind === "direct" && !compact ? "" : " secondary"}`}
              aria-label={name ? `${labels[kind]} · ${name}` : labels[kind]}
              title={compact ? labels[kind] : undefined}
            >
              <ActionIcon kind={kind} />
              <span className={compact ? "sr-only" : undefined}>
                {labels[kind]}
              </span>
            </a>
          ),
      )}
    </div>
  );
}
