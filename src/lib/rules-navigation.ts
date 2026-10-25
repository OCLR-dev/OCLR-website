/** Deterministic Unicode anchors; duplicate/colliding headings never duplicate IDs. */
export function rulesSectionIds(headings: string[]) {
  const used = new Set<string>();
  return headings.map((heading) => {
    const base =
      "rule-" +
      (heading
        .normalize("NFKC")
        .toLocaleLowerCase("en")
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "section");
    let id = base,
      suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    return id;
  });
}

/** Keep old chapter links within the same edition; unknown/malformed fragments use its rules section. */
export function rulesRedirectHref(
  base: string,
  hash: string,
  anchors: Record<string, string>,
) {
  let anchor: string;
  try {
    anchor = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    anchor = "";
  }
  return `${base}#${encodeURIComponent(Object.hasOwn(anchors, anchor) ? anchors[anchor] : "rules")}`;
}

/** Archival punctuation stays in headings and anchors; only TOC labels are cleaned. */
export function rulesContentsLabel(heading: string, archiveSeason?: string) {
  return ["8", "9", "10"].includes(archiveSeason ?? "")
    ? heading.replace(/[:：]+\s*$/u, "")
    : heading;
}

/** Normalize rendered S8 fragments after matching the unchanged figure anchors. */
export function rulesBodyText(text: string, archiveSeason?: string) {
  return archiveSeason === "8"
    ? text.replace(/\n(?:[ \t]*\n){2,}/g, "\n\n").trim()
    : text.trim();
}
