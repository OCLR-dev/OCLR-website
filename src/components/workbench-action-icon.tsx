/** Compact workbench actions follow the existing outline icon style. */
export function WorkbenchActionIcon({
  kind,
}: {
  kind: "rounds" | "pool" | "history";
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "rounds" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="m7 8 1 1 2-2M13 8h4M7 13h3M13 13h4M7 17h3M13 17h4" />
        </>
      ) : kind === "pool" ? (
        <>
          <rect x="3" y="3" width="14" height="14" rx="2" />
          <path d="M7 21h12a2 2 0 0 0 2-2V7M10 7v6m-3-3h6" />
        </>
      ) : (
        <>
          <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.4 2.6L3 8M3 3v5h5M12 7v5l4 2" />
        </>
      )}
    </svg>
  );
}
