import { edition } from "./edition";
import { historicalArchive } from "./historical-archive";
import type { Edition } from "../../src/lib/editions";

// Isolated synthetic UI only. Counts are not S3 historical records.
export const frostPreview: Edition = {
  ...edition,
  slug: "s3",
  season: "3",
  name: "OCLR Season 3",
  published: true,
  status: "completed",
  summary: "合成介面樣本；以下計數僅為測試佔位，不代表 S3 歷史賽事資料。",
  branding: {
    logo: "/archive/s3/key-visual.avif",
    keyVisual: "/archive/s3/key-visual.avif",
    background: null,
  },
  registration: null,
  eligibility: null,
  schedule: [],
  rules: {
    version: "design-only",
    sections: [
      {
        heading: "設計樣本",
        body: "本頁使用合成測試資料，只供外觀審閱；不代表 S3 賽制、參賽名單、日期或比分。",
      },
    ],
  },
  archive: {
    ...historicalArchive,
    editionSlug: "s3",
    sourceUrl: "https://example.com/design-only",
    notes: ["Synthetic design fixture; no historical data."],
    links: [],
    teams: [
      {
        id: "placeholder",
        name: "Design placeholder — not a historical team",
        source: "Synthetic design only",
      },
    ],
    players: [
      {
        osuId: 91001,
        username: "Synthetic preview captain",
        teamId: "placeholder",
        role: "captain",
        tier: 0,
        source: "Synthetic design only",
      },
    ],
    picks: [],
    staff: [],
    standings: [],
    matches: [],
    pools: [],
  },
};
