import type { HistoricalArchive } from "./historical-archive";

const visuals: Record<string, { src: string; width: number; height: number }> =
  {
    "1QqF8leIqov2l3loi92hFHu82HEuplb9Iau2zPNUcySk": {
      src: "/archive/s4/key-visual.avif",
      width: 1728,
      height: 1080,
    },
    "100CrQhmcX3lQ_7yn4xcP3cC316A7t35wK6kGfSW2tyM": {
      src: "/archive/s5/key-visual.png",
      width: 1920,
      height: 1080,
    },
    "1vZ7JN6ePxDqjdVZ1527fvyeoV1m5rbHzSvXObDUuf7I": {
      src: "/archive/s7/key-visual.jpg",
      width: 1920,
      height: 1080,
    },
    "16ASDCD95p3TgfjgSHCjXmRN3KJuuAD4KS0fImpcTiiM": {
      src: "/archive/s8/thumbnail.jpg",
      width: 1920,
      height: 1080,
    },
    "11PwNlEsUFb6f3VCY2-sdGlPysP0ukihN8_lE4DGuzfA": {
      src: "/archive/s9/thumbnail.png",
      width: 1920,
      height: 1080,
    },
    "12BGS8WRnl10OdeUKyvmOypFzpTYCpHgx9QY1mw-0hlw": {
      src: "/archive/s10/thumbnail.png",
      width: 1024,
      height: 1024,
    },
  };
export function archiveKeyVisual<
  T extends Pick<HistoricalArchive, "sourceUrl">,
>(archive: T, configured: string | null | undefined) {
  const url = new URL(archive.sourceUrl);
  const sheet =
    url.hostname === "docs.google.com"
      ? /^\/spreadsheets\/d\/([^/]+)(?:\/edit)?$/.exec(url.pathname)?.[1]
      : undefined;
  const original =
    archive.sourceUrl === "https://github.com/OCLR-dev/OCLR-website/issues/289"
      ? { src: "/archive/s6/key-visual.jpg", width: 1920, height: 1080 }
      : sheet
        ? visuals[sheet]
        : undefined;
  // Explicit edition branding still takes priority over the source supplement.
  return configured
    ? {
        src: configured,
        width: original?.src === configured ? original.width : 1672,
        height: original?.src === configured ? original.height : 941,
      }
    : original;
}
