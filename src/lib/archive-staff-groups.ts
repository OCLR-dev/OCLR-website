import type { HistoricalArchive } from "./historical-archive";

type Staff = HistoricalArchive["staff"][number];
export type ArchiveStaffRole =
  "referee" | "streamer" | "commentator" | "unspecified";
const aliases: Record<string, ArchiveStaffRole> = {
  referee: "referee",
  referees: "referee",
  裁判: "referee",
  streamer: "streamer",
  streamers: "streamer",
  直播: "streamer",
  直播员: "streamer",
  直播員: "streamer",
  commentator: "commentator",
  commentators: "commentator",
  解说: "commentator",
  解說: "commentator",
};
function knownRole(value: string) {
  const key = value.trim().toLowerCase();
  return Object.hasOwn(aliases, key) ? aliases[key] : undefined;
}

/** Normalize presentation only. Source text and identities remain untouched. */
export function archiveStaffPositions(position: string) {
  const tokens = position
    .replace(
      /裁判\s*\/\s*直播\s*\/\s*解[说說]\s*[（(]Staff原文[统統][称稱][）)]/gi,
      "__unspecified__",
    )
    .split(/[;；]/)
    .flatMap((part) => {
      const value = part.trim();
      if (!value) return [];
      if (value === "__unspecified__") return ["unspecified"];
      const role = knownRole(value);
      if (role) return [role];
      const combined = value.split("/").map(knownRole);
      // Do not split unknown role names such as “统计 / 表格”.
      return combined.every(Boolean) ? combined : [value];
    })
    .filter((value): value is string => Boolean(value));
  const roles = [...new Set(tokens)];
  // The source's umbrella adds no new role when explicit duties are recorded.
  return roles.length > 1
    ? roles.filter((role) => role !== "unspecified")
    : roles;
}

export function groupArchiveStaff(staff: readonly Staff[]) {
  const groups = new Map<
    string,
    {
      key: string;
      members: { osuId: number | null; names: string[]; records: Staff[] }[];
    }
  >();
  for (const person of staff) {
    for (const key of archiveStaffPositions(person.position)) {
      const group = groups.get(key) ?? { key, members: [] };
      // Unknown identities must not be merged by name. Exact duplicate evidence
      // may be collapsed, but similarly named people stay separate.
      const member = group.members.find((m) =>
        person.osuId !== null
          ? m.osuId === person.osuId
          : m.osuId === null &&
            m.records.some(
              (record) =>
                record.username === person.username &&
                record.position === person.position &&
                record.source === person.source,
            ),
      );
      if (member) {
        if (!member.names.includes(person.username))
          member.names.push(person.username);
        member.records.push(person);
      } else {
        group.members.push({
          osuId: person.osuId,
          names: [person.username],
          records: [person],
        });
      }
      groups.set(key, group);
    }
  }
  return [...groups.values()];
}
