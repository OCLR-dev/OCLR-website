import { edition } from "./edition";
import { historicalArchive } from "./historical-archive";
import rules from "../../docs/imports/s2-rules.json" with { type: "json" };
export const verdantPreview = {
  ...edition,
  slug: "s2",
  season: "2",
  name: "OCLR S2",
  published: true,
  status: "completed" as const,
  summary: "Synthetic UI Preview · S2 主題設計樣本，非歷史資料快照。",
  registration: null,
  eligibility: null,
  schedule: [],
  rules: {
    version: "s2-preview",
    sections: rules.map(({ title, content }) => ({
      heading: title,
      body: content,
    })),
  },
  archive: {
    ...historicalArchive,
    editionSlug: "s2",
    sourceUrl:
      "https://docs.google.com/spreadsheets/d/1lQrHwsbPb5nC-MDPbHSNkL2RFD1eEcS-LbGonEr10QY",
    notes: [
      "Synthetic UI Preview; all team, player, match and map records are component test fixtures, not S2 historical records.",
    ],
  },
};
