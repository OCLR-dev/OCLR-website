import type { AppTranslator } from "@/i18n/translate";
import type { HistoricalArchive } from "./historical-archive";

/** Historical role labels are source content, separate from account permissions. */
export function archivePlayerRoleLabel(
  archive: Pick<HistoricalArchive, "sourceUrl">,
  player: Pick<
    HistoricalArchive["players"][number],
    "role" | "tier" | "sourceRole"
  > & { source?: string },
  tr: AppTranslator,
) {
  if (player.sourceRole === "VICE") return "VICE";
  if (player.role === "captain") return "Captain";
  if (player.role === "coach") return tr("Coach");
  if (player.role === "free_agent") return tr("Free agent");
  if (player.tier !== null) return `Tier ${player.tier}`;
  // TEAM!F4 names these ten source positions ASSITANT (#926). Bind the label
  // to both workbook and roster cell: later substitutes also lack a draft Tier.
  if (
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/1lQrHwsbPb5nC-MDPbHSNkL2RFD1eEcS-LbGonEr10QY(?:\/edit)?$/.test(
      archive.sourceUrl,
    ) &&
    /^TEAM!F(?:6|10|14|18|22|26|30|34|38|42)$/.test(player.source ?? "")
  )
    return "ASSITANT";
  return tr("Not recorded");
}
