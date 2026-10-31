import type { AppTranslator } from "./translate";

/** Only interface messages are translated; map, team and identity text stays literal. */
export function refereeMessage(tr: AppTranslator, message: string): string {
  const conflict =
    /^Withdraw conflicting steps in reverse order before changing the order: (\d+(?:, \d+)*)\.$/.exec(
      message,
    );
  if (conflict)
    return tr(
      "Withdraw conflicting steps in reverse order before changing the order: {steps}.",
      { steps: conflict[1] },
    );
  switch (message) {
    case "Room settings inherit the saved round rules and streaming task. Reload the workspace.":
      return tr(
        "Room settings inherit the saved round rules and streaming task. Reload the workspace.",
      );
    case "pending":
      return tr("Pending");
    case "playing":
      return tr("In progress");
    case "completed":
      return tr("Completed");
    case "tied":
      return tr("Tied");
    case "aborted":
      return tr("Aborted");
    case "order_set":
      return tr("Order applied");
    case "selection_recorded":
      return tr("Selection recorded");
    case "attempt_started":
      return tr("Actual start recorded");
    case "attempt_resolved":
      return tr("Attempt outcome recorded");
    case "attempt_replayed":
      return tr("Replay recorded");
    case "selection_voided":
      return tr("Selection withdrawn");
    case "settings_saved":
      return tr("Command settings saved");
    case "policy_configured":
      return tr("Round policy saved");
    case "dependencies_reconfirmed":
      return tr("Dependencies rechecked");
    case "firstBan":
      return tr("First Ban team");
    case "secondBan":
      return tr("Second Ban team");
    case "firstPick":
      return tr("First Pick team");
    case "secondPick":
      return tr("Second Pick team");
    case "neutral":
      return tr("Neutral tiebreaker");
    case "banSeconds":
      return tr("Ban timer seconds");
    case "pickSeconds":
      return tr("Pick timer seconds");
    case "prepareSeconds":
      return tr("Preparation timer seconds");
    case "startSeconds":
      return tr("Start countdown seconds");
    case "A tied or aborted attempt has no winner.":
      return tr("A tied or aborted attempt has no winner.");
    case "Apply both the first-ban and first-pick teams.":
      return tr("Apply both the first-ban and first-pick teams.");
    case "Both fixture teams must be resolved.":
      return tr("Both fixture teams must be resolved.");
    case "Cancelled fixtures cannot record referee activity.":
      return tr("Cancelled fixtures cannot record referee activity.");
    case "Choose an active pick.":
      return tr("Choose an active pick.");
    case "Choose an entry from the current round pool.":
      return tr("Choose an entry from the current round pool.");
    case "Choose the two teams from this fixture.":
      return tr("Choose the two teams from this fixture.");
    case "Choose the winning team for a completed attempt.":
      return tr("Choose the winning team for a completed attempt.");
    case "Fixture dependencies changed. Withdraw affected steps and recheck the saved configuration.":
      return tr(
        "Fixture dependencies changed. Withdraw affected steps and recheck the saved configuration.",
      );
    case "Historical archives cannot record referee activity.":
      return tr("Historical archives cannot record referee activity.");
    case "Neutral tiebreaker":
      return tr("Neutral tiebreaker");
    case "Not set":
      return tr("Not set");
    case "Only a pending attempt can be marked as started.":
      return tr("Only a pending attempt can be marked as started.");
    case "Record the current outcome before creating a replay.":
      return tr("Record the current outcome before creating a replay.");
    case "Resolve the current map or record a replay before continuing.":
      return tr(
        "Resolve the current map or record a replay before continuing.",
      );
    case "The configured tiebreak score has not been reached.":
      return tr("The configured tiebreak score has not been reached.");
    case "The fixture needs a saved round mappool.":
      return tr("The fixture needs a saved round mappool.");
    case "The round referee policy has not been configured.":
      return tr("The round referee policy has not been configured.");
    case "The round scoring rules have not been configured.":
      return tr("The round scoring rules have not been configured.");
    case "The temporary series is complete.":
      return tr("The temporary series is complete.");
    case "The tiebreak condition is incompatible with the round series.":
      return tr(
        "The tiebreak condition is incompatible with the round series.",
      );
    case "There are no further configured steps.":
      return tr("There are no further configured steps.");
    case "There is no active step to withdraw.":
      return tr("There is no active step to withdraw.");
    case "This map category is not permitted for the current step.":
      return tr("This map category is not permitted for the current step.");
    case "This map has already been banned or picked.":
      return tr("This map has already been banned or picked.");
    case "This map is not permitted for the current step.":
      return tr("This map is not permitted for the current step.");
    case "This team has already picked this category.":
      return tr("This team has already picked this category.");
    case "This team has already banned this restricted category.":
      return tr("This team has already banned this restricted category.");
    case "Tiebreaker maps cannot be banned.":
      return tr("Tiebreaker maps cannot be banned.");
    case "Tiebreaker maps are reserved for their configured step.":
      return tr("Tiebreaker maps are reserved for their configured step.");
    case "Unable to reload the referee workspace.":
      return tr("Unable to reload the referee workspace.");
    case "Unable to save the referee action.":
      return tr("Unable to save the referee action.");
    case "Withdraw later steps before correcting this pick.":
      return tr("Withdraw later steps before correcting this pick.");
    case "The replay limit for this map has been reached.":
      return tr("The replay limit for this map has been reached.");
    case "Declare EX on the current pick before its first start.":
      return tr("Declare EX on the current pick before its first start.");
    case "Configure EX player count for this round first.":
      return tr("Configure EX player count for this round first.");
    case "EX declaration is ambiguous for this beatmap. Review the referee selections.":
      return tr(
        "EX declaration is ambiguous for this beatmap. Review the referee selections.",
      );
    case "EX player count is not configured for this round.":
      return tr("EX player count is not configured for this round.");
    default:
      return tr(message);
  }
}
