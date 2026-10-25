import { z } from "zod";
import { HttpError } from "./http";
import type { DeveloperReadPrincipal } from "./developer-api";
const slugSchema = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const idSchema = z.uuid();
/** Only registered resources can reach their existing, independently authorized read service. */
export async function extendedRead(
  id: string,
  params: Record<string, string>,
  query: URLSearchParams,
  principal: DeveloperReadPrincipal | null,
): Promise<unknown> {
  const slug = params.edition ? slugSchema.parse(params.edition) : "";
  const target = params.id ? idSchema.parse(params.id) : "";
  const playerId = params.osuId
    ? z.coerce
        .number()
        .int()
        .positive()
        .max(Number.MAX_SAFE_INTEGER)
        .parse(params.osuId)
    : 0;
  const actor = principal?.subject;
  const filters = Object.fromEntries(query);
  switch (id) {
    case "publicContributors":
      return (await import("./contributors")).publicContributors();
    case "contributorsForAdmin":
      return (await import("./contributors")).contributorsForAdmin(actor!);
    case "publicPlayerParticipation":
      return (await import("./players")).publicPlayer(
        playerId,
        query.get("edition") || undefined,
      );
    case "publicStaff":
      return (await import("./public-staff")).publicStaff();
    case "publicCompetition":
      return (await import("./public-competition")).publicCompetition(slug);
    case "publicBracket":
      return (await import("./brackets")).publicBracket(slug);
    case "publicMappools":
      return (await import("./mappools")).publicMappools(
        slug,
        query.get("poolId") ?? undefined,
      );
    case "publishedTeams":
      return (await import("./teams")).publishedTeams(slug);
    case "publicCaptains":
      return (await import("./captains")).publicCaptains(slug);
    case "publicDraft":
      return (await import("./draft")).publicDraft(slug);
    case "publicBroadcastDraft":
      return (await import("./broadcast")).publicBroadcastDraft(slug);
    case "publicRoundRatings":
      return (await import("./ratings")).publicRoundRatings(slug);
    case "publicAwards":
      return (await import("./awards")).publicAwards(slug);
    case "publicArchiveStatistics":
      return (await import("./archive-statistics")).publicArchiveStatistics(
        slug,
      );
    case "publicFixture":
      return (await import("./public-competition")).publicFixture(slug, target);
    case "publicMatchRating":
      return (await import("./ratings")).publicMatchRating(slug, target);
    case "publicPlayerMessages":
      return (await import("./player-messages")).publicPlayerMessages(
        slug,
        playerId,
      );
    case "tournamentForAdmin":
      return (await import("./tournaments")).tournamentForAdmin(actor!, slug);
    case "captainSetup":
      return (await import("./captains")).captainSetup(actor!, slug);
    case "staffTeams":
      return (await import("./teams")).staffTeams(actor!, slug);
    case "staffDraft":
      return (await import("./draft")).staffDraft(actor!, slug);
    case "mappoolWorkspace":
      return (await import("./mappools")).mappoolWorkspace(actor!, slug);
    case "staffFixtures":
      return (await import("./fixtures")).staffFixtures(actor!, slug);
    case "awardWorkspace":
      return (await import("./awards")).awardWorkspace(actor!, slug);
    case "statisticsWorkspace":
      return (await import("./archive-statistics")).statisticsWorkspace(
        actor!,
        slug,
        query.get("fixtureId") ?? "",
      );
    case "streamingWorkspace":
      return (await import("./streaming")).streamingWorkspace(
        actor!,
        slug,
        Object.fromEntries([...query].filter(([key]) => key !== "fixtureId")),
        query.get("fixtureId") ?? undefined,
      );
    case "matchRatingWorkspace":
      return (await import("./ratings")).matchRatingWorkspace(
        actor!,
        slug,
        target,
      );
    case "matchReview":
      return (await import("./results")).matchReview(actor!, slug, target);
    case "replayList":
      return (await import("./mappool-replays")).replayList(
        actor!,
        slug,
        target,
      );
    case "tournamentList":
      return (await import("./tournaments")).tournamentList(actor!);
    case "listStaffRoles":
      return (await import("./staff-roles")).listStaffRoles(actor!);
    case "siteSettingsForAdmin":
      return (await import("./site-settings")).siteSettingsForAdmin(actor!);
    case "listApplications":
      return (await import("./staff")).listApplications(actor!, filters);
    case "applicationDetails":
      return (await import("./staff")).applicationDetails(actor!, target);
    case "auditLog":
      return (await import("./audit")).auditLog(actor!, filters);
    case "staffAccess":
      return (await import("./auth/staff")).staffAccess(actor!);
    case "playerApplications":
      return (await import("./dashboard")).playerApplications(actor!.osuId);
    case "ownRegistrations":
      return (await import("./registrations")).ownRegistrations(actor!.osuId);
    case "ownTeam":
      return (await import("./teams")).ownTeam(actor!.osuId, slug);
    case "captainAppointment":
      return (await import("./captains")).captainAppointment(
        actor!.osuId,
        slug,
      );
    case "captainDraft":
      return (await import("./draft")).captainDraft(actor!, slug);
    case "publicEnrollment":
      return (await import("./frontend-read-models")).publicConfigurationModel(
        slug,
      );
    case "privateSavedTournament":
      return (await import("./frontend-read-models")).privateSavedTournament(
        slug,
      );
    case "publicNewsModel":
      return (await import("./frontend-read-models")).publicNewsModel(
        query.get("locale") ?? "en",
      );
    case "captainIdentities":
      return (await import("./frontend-read-models")).captainIdentities(
        actor!,
        slug,
      );
    case "publicEnrollmentState":
      return (await import("./frontend-read-models")).publicEnrollmentState(
        slug,
      );
    case "ownSavedProfile":
      return (await import("./frontend-read-models")).ownSavedProfile(
        actor!,
        z
          .enum(["osu", "taiko", "fruits", "mania"])
          .parse(query.get("mode") ?? "osu"),
      );
    case "ownEligibility":
      return (await import("./frontend-read-models")).ownEligibility(
        actor!,
        slug,
      );
    case "fixtureForReview":
      return (await import("./fixtures")).fixtureForReview(
        actor!,
        slug,
        target,
        undefined,
        true,
      );
    case "staffBws":
      return (await import("./bws")).staffBws(
        actor!,
        slug,
        target,
        query.get("mode"),
      );
    case "ownRegistrationForm":
      return (await import("./frontend-read-models")).ownRegistrationForm(
        actor!,
        slug,
      );
    default:
      throw new HttpError(404, "Read resource not found.");
  }
}
