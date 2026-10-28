import { describe, expect, it } from "vitest";
import {
  archiveStaffPositions,
  groupArchiveStaff,
} from "../../src/lib/archive-staff-groups";
import { confirmArchiveStaffIdentity } from "../../src/lib/archive-staff-identity-model";
import { publicHistoricalArchive } from "../../src/lib/historical-archive";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics";
import { historicalArchive } from "../fixtures/historical-archive";

describe("historical staff presentation", () => {
  it.each([
    ["裁判", ["referee"]],
    ["REFEREE", ["referee"]],
    ["直播", ["streamer"]],
    ["直播員", ["streamer"]],
    ["解說", ["commentator"]],
    ["解说", ["commentator"]],
    ["Commentators", ["commentator"]],
    ["Commentator / Referee", ["commentator", "referee"]],
    ["Referee；裁判 / 直播 / 解说（Staff原文统称）", ["referee"]],
    ["裁判 / 直播 / 解說（Staff原文統稱）", ["unspecified"]],
    [
      "Commentator / Streamer；主办；裁判 / 直播 / 解说（Staff原文统称）；选图组",
      ["commentator", "streamer", "主办", "选图组"],
    ],
    ["统计 / 表格", ["统计 / 表格"]],
    ["Referee / Unknown role", ["Referee / Unknown role"]],
    ["constructor", ["constructor"]],
    ["__proto__", ["__proto__"]],
  ])("groups %s without inventing duties", (source, expected) => {
    expect(archiveStaffPositions(source)).toEqual(expected);
  });
  it("deduplicates confirmed UIDs within each role and retains names and source evidence", () => {
    const records = [
      {
        osuId: 1,
        username: "Original Name",
        position: "裁判",
        source: "Staff!A1",
      },
      {
        osuId: 1,
        username: "Later Name",
        position: "Referee / Streamer",
        source: "Schedule!B2",
      },
      {
        osuId: 2,
        username: "Original Name",
        position: "Referee",
        source: "Staff!A3",
      },
      {
        osuId: null,
        username: "Original Name",
        position: "Referee",
        source: "Staff!A4",
      },
      {
        osuId: null,
        username: "Original Name",
        position: "Referee",
        source: "Staff!A5",
      },
    ];
    const before = structuredClone(records);
    const groups = groupArchiveStaff(records);
    expect(groups.map((g) => g.key)).toEqual(["referee", "streamer"]);
    expect(groups[0].members).toHaveLength(4);
    expect(groups[0].members[0]).toEqual({
      osuId: 1,
      names: ["Original Name", "Later Name"],
      records: records.slice(0, 2),
    });
    expect(groups[1].members).toHaveLength(1);
    expect(records).toEqual(before);
  });
});

describe("confirmed historical staff identity", () => {
  const archive = {
    ...historicalArchive,
    staff: [
      {
        username: "Historical Name",
        osuId: null,
        position: "Referee",
        source: "Staff!A2",
      },
    ],
  };
  const confirmation = {
    staffIndex: 0,
    username: "Current Name",
    osuId: 983001,
    expectedRevision: 0,
    source: "Organizer verified against original record",
    identityConfirmed: true as const,
  };
  it("changes only the chosen UID without altering archive format, public notes or competition data", () => {
    const before = structuredClone(archive);
    const after = confirmArchiveStaffIdentity(archive, confirmation);
    expect(after.staff[0]).toEqual({ ...archive.staff[0], osuId: 983001 });
    expect({ ...after, staff: archive.staff }).toEqual(archive);
    expect({ ...publicHistoricalArchive(after), staff: archive.staff }).toEqual(
      publicHistoricalArchive(archive),
    );
    expect(statisticsArchiveKey(after)).toBe(statisticsArchiveKey(archive));
    expect(archive).toEqual(before);
  });
  it("does not overwrite confirmed IDs or accept conflicting same-name evidence", () => {
    const after = confirmArchiveStaffIdentity(archive, confirmation);
    expect(() => confirmArchiveStaffIdentity(after, confirmation)).toThrow();
    expect(() =>
      confirmArchiveStaffIdentity(
        {
          ...archive,
          staff: [...archive.staff, { ...archive.staff[0], osuId: 99 }],
        },
        confirmation,
      ),
    ).toThrow();
    expect(() =>
      confirmArchiveStaffIdentity(archive, { ...confirmation, source: " " }),
    ).toThrow();
  });
});
