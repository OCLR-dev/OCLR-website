import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  archiveMatchStaffLabel,
  archiveStaff,
} from "../../src/lib/archive-staff";
import { staffWorkbooks } from "../../src/lib/archive-staff-evidence";
import { groupArchiveStaff } from "../../src/lib/archive-staff-groups";
import { historicalStaffHistory } from "../../src/lib/archive-staff-history";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";

const load = (season: number) =>
  historicalArchiveSchema.parse(
    JSON.parse(readFileSync(`docs/imports/s${season}-archive.json`, "utf8")),
  );
const archive = load(8);

describe("historical staff from recorded match evidence", () => {
  it("keeps literal names and resolves reviewed aliases to the right UID", () => {
    const staff = archiveStaff(archive);
    expect(staff.filter((p) => p.position === "Referee")).toHaveLength(6);
    expect(staff.filter((p) => p.position === "Streamer")).toHaveLength(12);
    expect(staff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          username: "Alice Mana",
          position: "Commentators",
          osuId: 1698898,
        }),
        expect.objectContaining({ username: "Sonoboi", osuId: 10040597 }),
        expect.objectContaining({ username: "Sonoaoi", osuId: 9755808 }),
      ]),
    );
    expect(staff.filter((p) => p.username === "U4Dead")).toHaveLength(3);
    expect(staff.every((p) => p.source.startsWith("Schedule!"))).toBe(true);
    expect(archive.staff).toEqual([]);
  });

  it("preserves reviewed roster IDs and ignores unrelated or unrecorded matches", () => {
    const existing = {
      username: "U4Dead",
      osuId: 123,
      position: "Referee",
      source: "Confirmed staff source",
    };
    const staff = archiveStaff({ ...archive, staff: [existing] });
    expect(
      staff.filter((p) => p.username === "U4Dead" && p.position === "Referee"),
    ).toEqual([existing]);
    expect(
      archiveStaff({
        ...archive,
        sourceUrl: "https://example.com/s8",
        staff: [existing],
      }),
    ).toEqual([existing]);
    expect(
      archiveStaff({
        ...archive,
        matches: archive.matches.map((m) => ({ ...m, score: null })),
      }),
    ).toEqual([]);
  });

  it("splits reviewed comma, ampersand and space-delimited credits without splitting player names", () => {
    const s5 = load(5);
    const [match] = s5.matches.filter((m) =>
      m.commentators?.startsWith("Kishin Sagume"),
    );
    const releasedS5 = {
      ...s5,
      matches: [
        { ...match, score: [1, 0] as [number, number], review: undefined },
      ],
    };
    expect(archiveStaff(releasedS5)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          username: "Kishin Sagume",
          position: "Commentators",
          osuId: 596803,
        }),
        expect.objectContaining({ username: "demisemiquaver", osuId: 8501053 }),
        expect.objectContaining({ username: "B C", osuId: 3917377 }),
      ]),
    );
    expect(archiveStaff(load(9))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          username: "Shiki-Natsume",
          position: "Referee",
          osuId: 6338477,
        }),
      ]),
    );
    expect(archiveStaff(load(10))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          username: "Akisa 18",
          position: "Commentators",
          osuId: 16134378,
        }),
      ]),
    );
    expect(
      archiveStaff({
        ...releasedS5,
        matches: [
          {
            ...releasedS5.matches[0],
            streamer: "none",
            commentators: "好多人",
          },
        ],
      }).some((person) => ["none", "好多人"].includes(person.username)),
    ).toBe(false);
  });

  it("keeps conflicting names unlinked and omits unreviewed matches from UID history", () => {
    const input = {
      ...archive,
      staff: [
        { username: "Lapis", position: "Host", osuId: 1, source: "Staff!A1" },
        { username: "Lapis", position: "Host", osuId: 2, source: "Staff!A2" },
      ],
      matches: archive.matches.map((match) =>
        match.referee === "Sonoaoi" ? { ...match, score: null } : match,
      ),
    };
    expect(archiveStaff({ ...input, matches: archive.matches })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          username: "Lapis",
          position: "Streamer",
          osuId: null,
        }),
      ]),
    );
    const edition = {
      slug: "s8",
      name: "Season 8",
      published: true,
      archive: input,
    };
    const [record] = historicalStaffHistory(9755808, [edition]);
    expect(record.roles).toEqual(["streamer"]);
    expect(record).not.toHaveProperty("matches");
    expect(
      historicalStaffHistory(9755808, [{ ...edition, published: false }]),
    ).toEqual([]);
  });

  it("links organizer-confirmed spellings and aliases to the same numeric profile", () => {
    const credits = [
      ["s1", "傻呗", "ShaBae", 8501053],
      ["s2", "seira-", "Miyaguni Akari", 3407743],
      ["s3", "Gryo Zeppeli", "Gyro Zeppeli", 3824882],
      ["s3", "Refia Vrifdis", "Refia Vridis", 760389],
      ["s3", "Re_cycle", "Re_cyclc", 9043058],
      ["s4", "Segawa Emi", "Segawa Emi", 9043058],
      ["s4", "爆炸哥", "Explosive", 245276],
      ["s5", "FujiwaraNoMouko", "FujiwaraNoMokou", 685188],
      ["s5", "BC", "B C", 3917377],
      ["s5", "demq", "demq", 8501053],
      ["s7", "ye_ow", "ye__ow", 2992539],
    ] as const;
    for (const [slug, original, username, osuId] of credits) {
      const edition = {
        ...archive,
        editionSlug: slug,
        sourceUrl: `https://docs.google.com/spreadsheets/d/${staffWorkbooks[slug]}/edit`,
        staff: [
          {
            username: original,
            osuId: null,
            position: "Referee",
            source: "Staff!A2",
          },
        ],
        matches: [
          { ...archive.matches[0], referee: username, streamer: original },
        ],
      };
      const staff = archiveStaff(edition);
      expect(staff).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ username, osuId, position: "Referee" }),
          expect.objectContaining({ username, osuId, position: "Streamer" }),
        ]),
      );
      expect(
        groupArchiveStaff(staff).find((group) => group.key === "referee")
          ?.members,
      ).toHaveLength(1);
      expect(archiveMatchStaffLabel(edition, "streamer", original)).toBe(
        username,
      );
      expect(edition.staff[0].username).toBe(original);
    }
  });

  it("adds the confirmed S4 and S5 match duties and formats their public credits", () => {
    const s4 = load(4);
    const k8 = s4.matches.find((match) => match.id === "k8")!;
    const s4Staff = archiveStaff({ ...s4, matches: [k8] });
    expect(s4Staff).toContainEqual({
      username: "B C",
      osuId: 3917377,
      position: "Streamer",
      source: `${k8.source}; streamer`,
    });
    expect(archiveMatchStaffLabel(s4, "streamer", k8.streamer)).toBe(
      "Sonoaoi、B C",
    );

    const s5 = load(5);
    const b31 = s5.matches.find((match) => match.id === "b31")!;
    const released = {
      ...s5,
      matches: [{ ...b31, score: [6, 4] as [number, number] }],
    };
    const history = historicalStaffHistory(8501053, [
      { slug: "s5", name: "OCLR β", published: true, archive: released },
    ]);
    expect(history[0].roles).toEqual(["referee", "commentator"]);
    expect(archiveMatchStaffLabel(s5, "commentators", b31.commentators)).toBe(
      "Prophet、B C、demq",
    );
    expect(b31.commentators).toBe("Prophet BC demq");
  });

  it("orders released staff history by season and merges aliases into one role per UID", () => {
    const staffEdition = (slug: string, season: string | null) => ({
      slug,
      season,
      name: slug,
      published: true,
      archive: {
        ...archive,
        editionSlug: slug,
        staff: [
          {
            username: "-Inui Sana-",
            osuId: 9043058,
            position: "Referee",
            source: "Staff!A1",
          },
          {
            username: "Re_cyclc",
            osuId: 9043058,
            position: "裁判",
            source: "Staff!A2",
          },
          {
            username: "Segawa Emi",
            osuId: 9043058,
            position: "Streamer",
            source: "Staff!A3",
          },
        ],
        matches: [],
      },
    });
    const editions = [
      staffEdition("s2", "2"),
      staffEdition("s10", "10"),
      staffEdition("s1", null),
      staffEdition("s5", "β"),
    ];
    const records = historicalStaffHistory(9043058, editions);
    expect(records.map((record) => record.editionSlug)).toEqual([
      "s1",
      "s2",
      "s5",
      "s10",
    ]);
    expect(records.map((record) => record.roles)).toEqual(
      editions.map(() => ["referee", "streamer"]),
    );
  });
});
