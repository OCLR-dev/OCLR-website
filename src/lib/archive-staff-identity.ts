import type { User } from "./auth/sessions";
import { assertBusinessWrite, assertCapability } from "./auth/staff";
import { readTournament } from "./tournaments";
import { getOsuProfileByUsername } from "./osu-profiles";
import { archiveStaffLookupInput } from "./archive-staff-identity-model";
import { HttpError } from "./http";

/** Provider resolution is explicit, edition-authorized and never a public GET. */
export async function lookupArchiveStaffIdentity(
  actor: User,
  slug: string,
  input: unknown,
) {
  await assertBusinessWrite(actor, slug);
  await assertCapability(actor, "configure_tournament", slug);
  const parsed = archiveStaffLookupInput.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Select a historical staff member and enter a current osu! username.",
    );
  const c = parsed.data;
  async function context() {
    await assertCapability(actor, "configure_tournament", slug);
    const current = await readTournament(slug);
    if (!current) throw new HttpError(404, "Tournament not found.");
    if (current.revision !== c.expectedRevision)
      throw new HttpError(
        409,
        "Tournament settings changed. Refresh before saving your changes.",
      );
    const e = current.edition;
    if (!e.archive || e.status !== "completed" || e.registration)
      throw new HttpError(
        409,
        "Select a completed historical archive without registration.",
      );
    const person = e.archive.staff[c.staffIndex];
    if (!person || person.osuId !== null)
      throw new HttpError(409, "Select an unresolved historical staff member.");
    return { archive: e.archive, person };
  }
  await context();
  const snapshot = await getOsuProfileByUsername(c.username);
  if (snapshot.stale || snapshot.notice)
    throw new HttpError(
      503,
      "A current verified osu! profile is required. Retry when the provider is available.",
    );
  // Revocation, archive edits and identity conflicts may occur during provider I/O.
  const { archive, person } = await context();
  const profile = snapshot.profile;
  if (
    [...archive.staff, ...archive.players].some(
      (p) =>
        p.username === person.username &&
        p.osuId !== null &&
        p.osuId !== profile.osuId,
    )
  )
    throw new HttpError(
      409,
      "This historical name has conflicting confirmed IDs. Keep it unresolved.",
    );
  return {
    osuId: profile.osuId,
    username: profile.username,
    avatarUrl: profile.avatarUrl,
  };
}
