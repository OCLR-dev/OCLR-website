import { profileBws } from "./bws";
import { z } from "zod";
import type { User } from "./auth/sessions";
import {
  readCapabilityScope,
  isDeveloper,
  staffAccess,
  permits,
} from "./auth/staff";
import { publicPlayer } from "./players";
import { cachedOsuUserProfile, getOsuUserProfile } from "./osu-profiles";
import { parseOsuProfile } from "./osu-profile-model";
import { HttpError } from "./http";
import { safeSavedOsuProfile } from "./read-api-contract";
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
) {
  const identity = parseOsuProfile(input, mode);
  const participation = await publicPlayer(identity.osuId, edition);
  if (!participation.length)
    throw new HttpError(404, "Published player not found.");
  let snapshot = null;
  let error = null;
  try {
    snapshot = projectSavedPlayerProfile(
      await getOsuUserProfile(identity.osuId, identity.mode),
      identity.osuId,
      identity.mode,
    );
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    error = { status: e.status, message: e.message };
  }
  // Check again after provider I/O: publication may have been withdrawn meanwhile.
  const bws =
    snapshot && identity.mode === "osu"
      ? await profileBws(snapshot, edition)
      : null;
  const current = await publicPlayer(identity.osuId, edition);
  if (!current.length) throw new HttpError(404, "Published player not found.");
  return { identity, participation: current, snapshot, error, bws };
}
const lookup = z
  .object({
    input: z.string().trim().min(1).max(300),
    mode: z.enum(["osu", "taiko", "fruits", "mania"]).optional(),
    refresh: z.boolean().default(false),
  })
  .strict();
export async function staffPlayerProfile(user: User, input: unknown) {
  // Operational lookup doesn't grant applicant, captain or draft access.
  await readCapabilityScope(user, "manage_registrations");
  const parsed = lookup.safeParse(input);
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
