import { profileBws } from "./bws";
import { refreshStaffProfileWrite } from "./admin-operations-write-contracts";
import type { User } from "./auth/sessions";
import {
  readCapabilityScope,
  isDeveloper,
  staffAccess,
  permits,
  assertReadCapability,
} from "./auth/staff";
import { publicPlayer, publicPlayerStillListed } from "./players";
import { cachedOsuUserProfile, getOsuUserProfile } from "./osu-profiles";
import { parseOsuProfile } from "./osu-profile-model";
import { HttpError } from "./http-error";
import { safeSavedOsuProfile } from "./read-api-contract";
import { knownPlayerIdentity } from "./player-identity";
import type { ProfileSnapshot, ProfileMode } from "./osu-profile-model";
/** Shared whitelist for saved diagnostics and legacy provider-backed consumers. */
export function projectSavedPlayerProfile(
  snapshot: ProfileSnapshot | null,
  osuId: number,
  mode: ProfileMode,
): ProfileSnapshot | null {
  const profile = safeSavedOsuProfile(snapshot?.profile, osuId, mode);
  return snapshot && profile ? { ...snapshot, profile } : null;
}
export async function readSavedPlayerProfile(osuId: number, mode: ProfileMode) {
  return projectSavedPlayerProfile(
    await cachedOsuUserProfile(osuId, mode),
    osuId,
    mode,
  );
}
export async function publishedPlayerProfile(
  input: string,
  mode?: string,
  edition?: string,
  selfId?: number,
  savedOnly = false,
  authorizedEdition?: string,
) {
  const identity = parseOsuProfile(input, mode);
  if (
    edition &&
    !authorizedEdition &&
    !(await (await import("./content")).getPublicEdition(edition))
  )
    throw new HttpError(404, "Known player not found.");
  const participation = await publicPlayer(identity.osuId, edition);
  const player = await knownPlayerIdentity(
    identity.osuId,
    participation,
    selfId,
    authorizedEdition,
  );
  let snapshot = null;
  let error = null;
  try {
    snapshot = projectSavedPlayerProfile(
      await (savedOnly
        ? cachedOsuUserProfile(identity.osuId, identity.mode)
        : getOsuUserProfile(identity.osuId, identity.mode, {
            staleWhileRevalidate: true,
          })),
      identity.osuId,
      identity.mode,
    );
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    error = { status: e.status, message: e.message };
  }
  // Check again after provider I/O: publication may have been withdrawn meanwhile.
  // Self/account-only access has no public listing to withdraw, so only re-check
  // identities that were just read from public participation.
  if (
    participation.length > 0 &&
    selfId !== identity.osuId &&
    !authorizedEdition &&
    !(await publicPlayerStillListed(identity.osuId, edition))
  )
    throw new HttpError(404, "Known player not found.");
  if (
    edition &&
    !authorizedEdition &&
    !(await (await import("./content")).getPublicEdition(edition))
  )
    throw new HttpError(404, "Known player not found.");
  const bws =
    snapshot &&
    identity.mode === "osu" &&
    (!edition || participation.length > 0 || authorizedEdition)
      ? await profileBws(snapshot, edition)
      : null;
  return {
    identity: { ...identity, ...player },
    participation,
    snapshot,
    error,
    bws,
  };
}
/** Edition-scoped staff evidence, never a grant to inspect another private season. */
export async function staffOclrPlayerProfile(
  user: User,
  input: string,
  mode: string | undefined,
  edition: string,
) {
  await assertReadCapability(user, "manage_registrations", edition);
  const { db } = await import("@/db");
  const { registrations } = await import("@/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const { readTournament } = await import("./tournaments");
  const identity = parseOsuProfile(input, mode);
  const row = await readTournament(edition);
  const [application] = await db()
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        eq(registrations.editionSlug, edition),
        eq(registrations.userId, identity.osuId),
      ),
    );
  const archive = row?.edition.archive;
  if (
    !application &&
    !archive?.players.some((p) => p.osuId === identity.osuId) &&
    !archive?.staff.some((p) => p.osuId === identity.osuId) &&
    !archive?.rosterReplacements?.some((r) =>
      r.people.some((p) => p.osuId === identity.osuId),
    )
  )
    throw new HttpError(404, "Known player not found.");
  return publishedPlayerProfile(input, mode, edition, undefined, true, edition);
}
export async function staffPlayerProfile(user: User, input: unknown) {
  // Operational lookup doesn't grant applicant, captain or draft access.
  await readCapabilityScope(user, "manage_registrations");
  const parsed = refreshStaffProfileWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Enter a valid profile ID or URL and ruleset.");
  const identity = parseOsuProfile(parsed.data.input, parsed.data.mode);
  const grants = await staffAccess(user);
  if (
    isDeveloper(grants) &&
    !grants.some((grant) =>
      permits([grant], "manage_registrations", grant.editionSlug ?? undefined),
    )
  ) {
    if (parsed.data.refresh)
      throw new HttpError(403, "Developer access is read-only.");
    const snapshot = await readSavedPlayerProfile(
      identity.osuId,
      identity.mode,
    );
    await readCapabilityScope(user, "manage_registrations");
    if (!snapshot) throw new HttpError(404, "No saved profile is available.");
    return snapshot;
  }
  return getOsuUserProfile(identity.osuId, identity.mode, {
    refresh: parsed.data.refresh,
  });
}
