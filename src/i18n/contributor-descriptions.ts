import type { AppTranslator } from "./translate";

// Keep the stored English descriptions as values so existing entries resolve immediately.
export function contributionDescriptionOptions(tr: AppTranslator) {
  return new Map([
    [
      "Contribute to OCLR historical data discovery",
      tr("contribution_description_history"),
    ],
    [
      "Contribute code to the OCLR website",
      tr("contribution_description_code"),
    ],
    [
      "Contribute testing to the OCLR website",
      tr("contribution_description_testing"),
    ],
    [
      "Contribute design to the OCLR website",
      tr("contribution_description_design"),
    ],
    [
      "Provide SIP API for the OCLR website",
      tr("contribution_description_sip_api"),
    ],
  ]);
}
