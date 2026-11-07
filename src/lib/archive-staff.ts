import { archiveStaffPositions } from "./archive-staff-groups";
import {
  spacedCommentatorCredits,
  staffIdentities,
  staffWorkbooks,
} from "./archive-staff-evidence";
import {
  recordedArchiveMatch,
  type HistoricalArchive,
} from "./historical-archive";

type Staff = HistoricalArchive["staff"][number];
type Match = HistoricalArchive["matches"][number];

function reviewedStaffSource(archive: HistoricalArchive) {
  if (archive.editionSlug === "s6")
    return (
      archive.sourceUrl ===
      "https://github.com/OCLR-dev/OCLR-website/issues/289"
    );
  const workbook = staffWorkbooks[archive.editionSlug];
  const source = new URL(archive.sourceUrl);
  return (
    Object.hasOwn(staffWorkbooks, archive.editionSlug) &&
    source.origin === "https://docs.google.com" &&
    [
      `/spreadsheets/d/${workbook}`,
      `/spreadsheets/d/${workbook}/edit`,
    ].includes(source.pathname)
  );
}

const matchRoles = [
  ["referee", "Referee"],
  ["streamer", "Streamer"],
  ["commentators", "Commentators"],
] as const;
const nonNames = new Set([
  "-",
  "—",
  "/",
  "\\",
  "none",
  "n/a",
  "鸽了",
  "好多人",
]);
const staffNameKey = (name: string) => name.toLowerCase();

function matchCreditNames(
  slug: string,
  field: (typeof matchRoles)[number][0],
  credit: string,
) {
  if (slug === "s4") {
    if (field === "referee" && credit === "Sonoaoi(感谢爆炸哥替了一会)")
      return ["Sonoaoi", "爆炸哥"];
    if (field === "streamer" && credit === "Sonoaoi(感谢BC临时帮忙)")
      return ["Sonoaoi"];
  }
  return field === "commentators"
    ? (spacedCommentatorCredits.get(`${slug}:${credit}`) ??
        credit.split(/[,，、]/))
    : slug === "s9"
      ? credit.split("&")
      : [credit];
}

function staffIdentity(archive: HistoricalArchive) {
  const staffIds = new Map<string, Set<number>>();
  const playerIds = new Map<string, Set<number>>();
  for (const [records, ids] of [
    [archive.staff, staffIds],
    [archive.players, playerIds],
  ] as const) {
    for (const { username, osuId } of records) {
      if (osuId === null) continue;
      const key = staffNameKey(username);
      const matches = ids.get(key) ?? new Set();
      matches.add(osuId);
      ids.set(key, matches);
    }
  }
  return (username: string) => {
    const key = staffNameKey(username);
    const confirmed = staffIds.get(key);
    if (confirmed) return confirmed.size === 1 ? [...confirmed][0] : null;
    const reviewed = staffIdentities.get(key);
    const players = playerIds.get(key);
    return reviewed &&
      (!players || (players.size === 1 && players.has(reviewed)))
      ? reviewed
      : null;
  };
}

/** The saved roster and recorded match credits share the same identity rules. */
export function historicalStaffCredits(archive: HistoricalArchive) {
  if (!reviewedStaffSource(archive))
    return {
      roster: archive.staff,
      matches: [] as { match: Match; staff: Staff[] }[],
    };
  const resolve = staffIdentity(archive);
  const roster = archive.staff.map((person) =>
    person.osuId === null
      ? { ...person, osuId: resolve(person.username) }
      : person,
  );
  const matches = archive.matches.filter(recordedArchiveMatch).map((match) => ({
    match,
    staff: matchRoles.flatMap(([field, position]) => {
      const credit = match[field];
      if (!credit) return [];
      const names = matchCreditNames(archive.editionSlug, field, credit)
        .map((name) => name.trim())
        .filter((name) => name && !nonNames.has(staffNameKey(name)));
      return names.map((username) => ({
        username,
        osuId: resolve(username),
        position,
        source: `${match.source}; ${field}`,
      }));
    }),
  }));
  return { roster, matches };
}

/** Add each observed signature once to the edition roster. Per-match evidence is
 * retained independently so a player's history can show all recorded duties. */
export function archiveStaff(archive: HistoricalArchive): Staff[] {
  const { roster, matches } = historicalStaffCredits(archive);
  const staff = [...roster];
  const key = (person: Staff, role: string) =>
    JSON.stringify([person.osuId, staffNameKey(person.username), role]);
  const seen = new Set(
    roster.flatMap((person) =>
      archiveStaffPositions(person.position).map((role) => key(person, role)),
    ),
  );
  for (const { staff: credits } of matches) {
    for (const person of credits) {
      const [role] = archiveStaffPositions(person.position);
      const duty = key(person, role);
      if (seen.has(duty)) continue;
      staff.push(person);
      seen.add(duty);
    }
  }
  return staff;
}
