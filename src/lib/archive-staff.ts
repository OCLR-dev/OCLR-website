import { archiveStaffPositions } from "./archive-staff-groups";
import {
  spacedCommentatorCredits,
  staffCorrections,
  staffIdentities,
  staffWorkbooks,
} from "./archive-staff-evidence";
import {
  recordedArchiveMatch,
  type HistoricalArchive,
} from "./historical-archive";

type Staff = HistoricalArchive["staff"][number];

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

function staffCorrection(slug: string, username: string) {
  return staffCorrections.get(`${slug}:${staffNameKey(username)}`);
}

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

/** Show reviewed spellings while keeping the archived credit text intact. */
export function archiveMatchStaffLabel(
  archive: HistoricalArchive,
  field: (typeof matchRoles)[number][0],
  credit: string | null,
) {
  if (!credit || !reviewedStaffSource(archive)) return credit;
  const names =
    field === "commentators"
      ? matchCreditNames(archive.editionSlug, field, credit)
      : [credit];
  const corrected = names.map(
    (name) =>
      staffCorrection(archive.editionSlug, name.trim())?.username ??
      name.trim(),
  );
  return corrected.some((name, i) => name !== names[i].trim())
    ? corrected.join("、")
    : credit;
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

/** Merge saved credits and duties from recorded matches in reviewed sources. */
export function archiveStaff(archive: HistoricalArchive): Staff[] {
  if (!reviewedStaffSource(archive)) return archive.staff;
  const resolve = staffIdentity(archive);
  const project = (person: Staff): Staff => {
    const correction = staffCorrection(archive.editionSlug, person.username);
    return correction
      ? { ...person, ...correction }
      : { ...person, osuId: person.osuId ?? resolve(person.username) };
  };
  const staff = archive.staff.map(project);
  const key = (person: Staff, role: string) =>
    JSON.stringify([person.osuId, staffNameKey(person.username), role]);
  const seen = new Set(
    staff.flatMap((person) =>
      archiveStaffPositions(person.position).map((role) => key(person, role)),
    ),
  );
  for (const match of archive.matches.filter(recordedArchiveMatch)) {
    for (const [field, position] of matchRoles) {
      const credit = match[field];
      if (!credit) continue;
      const [role] = archiveStaffPositions(position);
      for (const name of matchCreditNames(archive.editionSlug, field, credit)) {
        const username = name.trim();
        if (!username || nonNames.has(staffNameKey(username))) continue;
        const person = project({
          username,
          osuId: null,
          position,
          source: `${match.source}; ${field}`,
        });
        const duty = key(person, role);
        if (seen.has(duty)) continue;
        staff.push(person);
        seen.add(duty);
      }
    }
  }
  return staff;
}
