import { remoteMode } from "./data-source";
import type { Edition } from "./editions";
import {
  ELIGIBILITY_FRESH_MS,
  evaluateEligibility,
  hasEligibilityLimits,
  noEligibilityLimits,
} from "./eligibility-model";
import { getOsuUserProfile } from "./osu-profiles";
export async function verifyEligibility(
  userId: number,
  edition: Edition,
  revision: number,
) {
  if (remoteMode()) {
    const { assertRemoteSubject } = await import("./frontend-resource");
    await assertRemoteSubject(userId);
    const { frontendViewer } = await import("./frontend-data");
    return (await import("./frontend-read-models")).ownEligibility(
      (await frontendViewer())!,
      edition.slug,
    );
  }
  const limits = edition.automaticEligibility ?? noEligibilityLimits;
  if (!hasEligibilityLimits(limits)) return null;
  let snapshot = null;
  try {
    snapshot = await getOsuUserProfile(userId, "osu");
    if (
      Date.now() - Date.parse(snapshot.profile.fetchedAt) >=
      ELIGIBILITY_FRESH_MS
    )
      snapshot = await getOsuUserProfile(userId, "osu", { refresh: true });
  } catch {
    /* Unavailable is an explicit result, never a fabricated pass. */
  }
  return evaluateEligibility(userId, revision, limits, snapshot);
}
