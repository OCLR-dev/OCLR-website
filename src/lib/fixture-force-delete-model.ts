export type ForceDeleteBlocker =
  "official_result" | "bracket" | "published_statistics" | null;
type Records = Record<string, unknown>[];
export function fixtureForceDeleteBlocker(snapshot: {
  results: Records;
  resultRevisions: Records;
  claims: Records;
  history: Records;
  dependents: Records;
  statistics: Records;
}): ForceDeleteBlocker {
  if (
    snapshot.results.some(
      (row) =>
        row.state === "approved" ||
        row.published_revision != null ||
        row.published_at != null,
    ) ||
    snapshot.resultRevisions.some(
      (row) => row.approved_at != null || row.approved_by != null,
    ) ||
    snapshot.claims.length ||
    snapshot.history.some((row) =>
      ["result_approve", "result_approve_publish", "result_publish"].includes(
        String(row.action),
      ),
    )
  )
    return "official_result";
  if (snapshot.dependents.length) return "bracket";
  if (
    snapshot.statistics.some(
      (row) => row.published != null || row.published_at != null,
    )
  )
    return "published_statistics";
  return null;
}
export type FixtureForceDeletePreview = {
  fixtureId: string;
  label: string;
  version: number;
  assignmentRevision: number;
  fingerprint: string;
  blocker: ForceDeleteBlocker;
  counts: Record<
    | "imports"
    | "games"
    | "results"
    | "resultRevisions"
    | "refereeSessions"
    | "refereeEvents"
    | "reconciliations"
    | "connections"
    | "commands"
    | "referees"
    | "streams"
    | "commentators"
    | "statistics",
    number
  >;
};
export function forceDeleteBlockerMessage(
  tr: (message: string) => string,
  blocker: ForceDeleteBlocker,
) {
  switch (blocker) {
    case "official_result":
      return tr(
        "Approved or published result history cannot be force deleted.",
      );
    case "bracket":
      return tr(
        "Another fixture uses this match for bracket progression. Clear that fixture's source selection first.",
      );
    case "published_statistics":
      return tr(
        "Published statistics reference this fixture and cannot be force deleted.",
      );
    default:
      return "";
  }
}
