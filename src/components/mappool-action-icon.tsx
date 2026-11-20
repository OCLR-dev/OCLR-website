export function MappoolActionIcon({
  kind,
}: {
  kind:
    | "edit"
    | "refresh"
    | "remove"
    | "replays"
    | "play"
    | "cache"
    | "cached"
    | "suggester";
}) {
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
      focusable="false"
    >
      {kind === "edit" && (
        <path d="m15 5 4 4M3 21l5-1L20 8a2.8 2.8 0 0 0-4-4L4 16Z" />
      )}
      {kind === "refresh" && (
        <>
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M6 6a8 8 0 0 1 13 3l1 3M4 12l1 3a8 8 0 0 0 13 3" />
        </>
      )}
      {kind === "remove" && (
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      )}
      {kind === "play" && <path d="m9 6 10 6-10 6Z" fill="currentColor" />}
      {kind === "replays" && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="m10 8 6 4-6 4Z" />
        </>
      )}
      {(kind === "cache" || kind === "cached") && (
        <>
          <path d="M4 15v5h16v-5" />
          {kind === "cached" ? (
            <path d="m8 9 3 3 5-5" />
          ) : (
            <path d="M12 4v9m-4-4 4 4 4-4" />
          )}
        </>
      )}
      {kind === "suggester" && (
        <>
          <circle cx="9" cy="7" r="3.5" />
          <path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m4-12v6m-3-3h6" />
        </>
      )}
    </svg>
  );
}
