import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { archiveStaff } from "../../src/lib/archive-staff";
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
    expect(new Set(record.matches.map((match) => match.id)).size).toBe(
      record.matches.length,
    );
    expect(
      historicalStaffHistory(9755808, [{ ...edition, published: false }]),
    ).toEqual([]);
  });
});
