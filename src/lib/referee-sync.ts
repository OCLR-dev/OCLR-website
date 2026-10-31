import type { RefereeWorkspace } from "./referee";

export type BpSyncStep = "notice" | "map" | "mods";
export type BpSyncMetadata = {
  eventId: string;
  selectionId: string;
  step: BpSyncStep;
  predecessorId: string | null;
  withdrawn: boolean;
};
/** Fixed-prefix, one-line notice. This cannot become a Bancho or raw IRC command. */
export function isBpNotice(text: string) {
  return (
    /^\[OCLR BP #\d{1,6}\] (?:WITHDRAW )?(?:BAN|PICK|TB) [A-Z]{2}\d{1,4} \| [^|\p{Cc}\p{Cf}\u2028\u2029]{1,64} \| https:\/\/osu\.ppy\.sh\/b\/[1-9]\d{0,9}$/u.test(
      text,
    ) && new TextEncoder().encode(text).length <= 380
  );
}
export function bpSyncSource(workspace: RefereeWorkspace, eventId: string) {
  const event = workspace.events.find((e) => e.id === eventId);
  if (!event) return null;
  const withdrawn = event.payload.type === "selection_voided";
  const selectionId =
    event.payload.type === "selection_recorded"
      ? event.id
      : event.payload.type === "selection_voided"
        ? event.payload.selectionId
        : null;
  const selection = workspace.projection.selections.find(
    (s) => s.id === selectionId,
  );
  const map = workspace.maps.find((m) => m.id === selection?.entryId);
  if (!selection || !map || !selectionId) return null;
  const team =
    workspace.teams.find((t) => t.id === selection.teamId)?.name ?? "TB";
  const name =
    Array.from(team.replace(/[|\p{Cc}\p{Cf}\u2028\u2029]/gu, " ").trim())
      .slice(0, 48)
      .join("") || "Team";
  const text = `[OCLR BP #${event.ordinal}] ${withdrawn ? "WITHDRAW " : ""}${selection.kind.toUpperCase()} ${map.category}${map.position} | ${name} | https://osu.ppy.sh/b/${map.beatmapId}`;
  return isBpNotice(text)
    ? { event, selection, map, selectionId, withdrawn, text }
    : null;
}
