import s9 from "@/content/s9-rulebook.json" with { type: "json" };
import s10 from "@/content/s10-rulebook.json" with { type: "json" };
import s8 from "@/content/s8-rulebook.json" with { type: "json" };
import type { HistoricalArchive } from "./historical-archive";

type HistoricalRulebook = {
  title: string;
  version: string | null;
  documentUrl: string;
  cover?: typeof s8.cover;
  sections: {
    heading: string;
    body: string;
    figures?: (typeof s8.cover & { after: string })[];
  }[];
};

const s7SourceUrl =
  "https://docs.google.com/spreadsheets/d/1vZ7JN6ePxDqjdVZ1527fvyeoV1m5rbHzSvXObDUuf7I/edit";

const supplements: {
  sheetId: string;
  season: string;
  rules: HistoricalRulebook;
}[] = [
  {
    sheetId: "16ASDCD95p3TgfjgSHCjXmRN3KJuuAD4KS0fImpcTiiM",
    season: "8",
    rules: s8,
  },
  {
    sheetId: "11PwNlEsUFb6f3VCY2-sdGlPysP0ukihN8_lE4DGuzfA",
    season: "9",
    rules: s9,
  },
  {
    sheetId: "12BGS8WRnl10OdeUKyvmOypFzpTYCpHgx9QY1mw-0hlw",
    season: "10",
    rules: s10,
  },
];

/** Organizer-provided source pairs; never fall back to another season's live rules. */
export function historicalRulebook(
  archive: HistoricalArchive,
  configured?: {
    version: string;
    sections: HistoricalRulebook["sections"];
  } | null,
): HistoricalRulebook | null {
  // Bind S1 to its workbook, never the mutable edition slug or private facts.
  if (
    configured &&
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/10OvY6V2_nJpmv3LekQJZw6Eo5Hy1V-ggSoOQIxIdm6I(?:\/edit)?$/.test(
      archive.sourceUrl,
    )
  ) {
    return {
      title: "OCLR S1总规则",
      version: configured.version,
      documentUrl: "/archive/s1/rules.pdf",
      sections: configured.sections,
    };
  }
  // Use S2's saved native sections even after private source facts are removed.
  if (
    configured &&
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/1lQrHwsbPb5nC-MDPbHSNkL2RFD1eEcS-LbGonEr10QY(?:\/edit)?$/.test(
      archive.sourceUrl,
    )
  ) {
    return {
      title: "OCLR S2总规则",
      version: configured.version,
      documentUrl: "/archive/s2/rules.pdf",
      sections: configured.sections,
    };
  }
  // S3 uses the saved native sections, including after private source facts
  // have been removed from public page/API models.
  if (
    configured &&
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/1o4asx7nZQTAWwNjK_TyB_aq2ZWD471BHAxcdLp-TPAo(?:\/edit)?$/.test(
      archive.sourceUrl,
    )
  ) {
    return {
      title: "OCLR S3总规则",
      version: configured.version,
      documentUrl: "/archive/s3/rules.pdf",
      sections: configured.sections,
    };
  }
  // S4's organizer-provided PDF is maintained in the native versioned editor.
  // Match its source workbook, independently of the editable edition slug.
  if (
    configured &&
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/1QqF8leIqov2l3loi92hFHu82HEuplb9Iau2zPNUcySk(?:\/edit)?$/.test(
      archive.sourceUrl,
    )
  ) {
    return {
      title: "OCLR S4规则说明",
      version: configured.version,
      documentUrl: "/archive/s4/rules.pdf",
      sections: configured.sections,
    };
  }
  // S5 uses the same versioned editor, bound to its evidenced source pair.
  if (
    configured &&
    archive.sourceUrl ===
      "https://docs.google.com/spreadsheets/d/100CrQhmcX3lQ_7yn4xcP3cC316A7t35wK6kGfSW2tyM/edit" &&
    archive.links.some(
      ({ url }) => url === "https://docs.qq.com/doc/DRU92Zm1JbGFFSEdq",
    )
  ) {
    return {
      title: "OCLR β 规则表",
      version: configured.version,
      documentUrl: "https://docs.qq.com/doc/DRU92Zm1JbGFFSEdq",
      sections: configured.sections,
    };
  }
  // S6 is maintained through the edition's native, versioned section editor.
  // Require its evidenced source pair; do not borrow generic/live rules elsewhere.
  if (
    configured &&
    archive.sourceUrl ===
      "https://github.com/OCLR-dev/OCLR-website/issues/289" &&
    archive.links.some(
      ({ url }) => url === "https://docs.qq.com/doc/DUHFuRFBER1NKS3Bw",
    )
  ) {
    return {
      title: "OCLR S6 规则表",
      version: configured.version,
      documentUrl: "https://docs.qq.com/doc/DUHFuRFBER1NKS3Bw",
      sections: configured.sections,
    };
  }
  // S7 reconstruction is maintained in the native versioned editor.
  // Bind to its source workbook, not the editable slug or a frozen rules copy.
  if (configured && archive.sourceUrl === s7SourceUrl) {
    return {
      title: "OCLR S7 重建版规则",
      version: configured.version,
      documentUrl: s7SourceUrl,
      sections: configured.sections,
    };
  }
  const sheet = new URL(archive.sourceUrl);
  return (
    supplements.find(
      ({ sheetId, rules }) =>
        sheet.hostname === "docs.google.com" &&
        sheet.pathname === `/spreadsheets/d/${sheetId}/edit` &&
        archive.links.some(({ url }) => {
          const document = new URL(url);
          return (
            document.hostname === "docs.google.com" &&
            document.pathname.replace(/^\/document\/u\/\d+\//, "/document/") ===
              new URL(rules.documentUrl).pathname
          );
        }),
    )?.rules ?? null
  );
}

/** Identify the approved source pair independently of editable edition slugs. */
export function historicalRulebookSeason(rules: HistoricalRulebook) {
  if (
    rules.title === "OCLR S1总规则" &&
    rules.documentUrl === "/archive/s1/rules.pdf"
  )
    return "1";
  if (
    rules.title === "OCLR S2总规则" &&
    rules.documentUrl === "/archive/s2/rules.pdf"
  )
    return "2";
  if (
    rules.title === "OCLR S3总规则" &&
    rules.documentUrl === "/archive/s3/rules.pdf"
  )
    return "3";
  if (
    rules.title === "OCLR S4规则说明" &&
    rules.documentUrl === "/archive/s4/rules.pdf"
  )
    return "4";
  if (
    rules.title === "OCLR β 规则表" &&
    rules.documentUrl === "https://docs.qq.com/doc/DRU92Zm1JbGFFSEdq"
  )
    return "5";
  if (
    rules.title === "OCLR S6 规则表" &&
    rules.documentUrl === "https://docs.qq.com/doc/DUHFuRFBER1NKS3Bw"
  )
    return "6";
  if (rules.title === "OCLR S7 重建版规则" && rules.documentUrl === s7SourceUrl)
    return "7";
  return supplements.find((entry) => entry.rules === rules)?.season;
}
