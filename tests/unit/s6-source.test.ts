import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";

const source = JSON.parse(
  readFileSync("docs/imports/s6-source-records.json", "utf8"),
);

describe("S6 surviving source evidence", () => {
  it("retains all source slots and keeps unresolved identities explicit", () => {
    expect(source.teams).toHaveLength(12);
    expect(source.teams.map((t: { id: string }) => t.id)).toEqual(
      [..."abcdefghijkl"].map((letter) => `team-${letter}`),
    );
    const members = source.teams.flatMap(
      (t: { members: { osuId: number | null }[] }) => t.members,
    );
    expect(members).toHaveLength(84);
    expect(
      members.filter((m: { osuId: number | null }) => m.osuId),
    ).toHaveLength(70);
    expect(
      source.teams.filter((t: { name: string | null }) => t.name),
    ).toHaveLength(3);
    expect(source.teams[11].members[0]).toMatchObject({
      name: "Fushimi Rio",
      osuId: null,
    });
    expect(source.teams[3].members[2]).toMatchObject({
      name: "970",
      osuId: null,
    });
    for (const team of source.teams) {
      expect(team.members[1]).toMatchObject({ role: "vice", tier: null });
      expect(team.members[2]).toMatchObject({ role: "coach", tier: null });
    }
  });

  it("applies only the organizer-confirmed aliases, timezone and replacement history", () => {
    expect(source.teams[4].members[3]).toMatchObject({
      name: "Re_CYCLE",
      osuId: 9043058,
    });
    expect(source.teams[6].members[5]).toMatchObject({
      name: "Inverse Lu Yang",
      osuId: 3753204,
    });
    const replacement = source.teams[10].members[6];
    expect(replacement.osuId).toBeNull();
    expect(
      replacement.replacementHistory.map((p: { osuId: number }) => p.osuId),
    ).toEqual([8425774, 14947596]);
    expect(replacement.replacementConfirmation).toContain("not simultaneous");
    expect(source.schedule).toHaveLength(6);
    expect(source.schedule[0].scheduledAt).toBe("2021-05-08T18:00:00+08:00");
    expect(source.schedule[5].scheduledAt).toBe("2021-05-09T21:00:00+08:00");
    expect(
      source.schedule.every(
        (m: { score: null; mpUrls: string[] }) =>
          m.score === null && m.mpUrls.length === 0,
      ),
    ).toBe(true);
    expect(source.templateLabels).toHaveLength(28);
    expect(source.results).toEqual([]);
    expect(source.standings).toEqual([]);
    expect(source.picks).toEqual([]);
  });

  it("keeps source pool statistics and raw qualifier scores without cached ranks", () => {
    expect(source.pools.map((p: { maps: unknown[] }) => p.maps.length)).toEqual(
      [19, 7, 7, 19, 19],
    );
    expect(source.pools[0].maps.at(-1)).toMatchObject({
      sourceSlot: "TB",
      slot: "TB1",
      beatmapId: 2349180,
      drainSeconds: 304,
    });
    expect(source.pools[0].maps[0]).toMatchObject({
      beatmapId: 2245984,
      stars: 5.34,
      drainSeconds: 132,
      cs: null,
      ar: null,
      od: null,
    });
    expect(source.pools[2].maps[5]).toMatchObject({
      slot: "DT1",
      stars: 4.2,
      bpm: 120,
      drainSeconds: null,
    });
    expect(source.qualifiers[0].records).toHaveLength(15);
    expect(source.qualifiers[0].records[0]).toMatchObject({
      name: "wdwdwww",
      scores: { NM1: 4139150, DT2: 8033802 },
      rank: null,
    });
    expect(source.qualifiers[1].records[0]).toMatchObject({
      name: "Azureus",
      scores: {},
      rank: null,
    });
    expect(source.staff).toHaveLength(5);
  });

  it("corroborates GS without duplicating it and keeps ES/FS metadata unknown", () => {
    const snapshot = JSON.parse(
      readFileSync("docs/imports/s6-pool-source-snapshot.json", "utf8"),
    );
    expect(snapshot.sheets.map((s: { sheetId: number }) => s.sheetId)).toEqual([
      405667568, 1310799675, 1503362078,
    ]);
    expect(source.pools[0].maps[0].corroboratingSource).toBe("S6GS!C6:J6");
    expect(source.pools[3].maps[0]).toMatchObject({
      slot: "NM1",
      beatmapId: 2277760,
      title: null,
      stars: null,
      bpm: null,
    });
    expect(source.pools[4].maps.at(-1)).toMatchObject({
      slot: "TB1",
      beatmapId: 2510638,
      title: null,
    });
    expect(source.supplementalPoolSource.snapshotSha256).toBe(
      createHash("sha256")
        .update(
          // Verify Git's canonical LF bytes even in an autocrlf checkout.
          readFileSync(
            "docs/imports/s6-pool-source-snapshot.json",
            "utf8",
          ).replaceAll("\r\n", "\n"),
        )
        .digest("hex"),
    );
    expect(snapshot.sheets[1].maps[0].observedMetadata.title).toMatchObject({
      value: null,
      error: "LOADING",
      formulaDerived: true,
    });
  });

  it("cannot be mistaken for an uploadable archive or complete source workbook", () => {
    expect(source.importReady).toBe(false);
    expect(historicalArchiveSchema.safeParse(source).success).toBe(false);
    const contents = JSON.stringify(source);
    expect(contents).not.toMatch(
      /自我介绍|讨论区|是否单身|@qq|@gmail|Harubi Lira|17859623/,
    );
    expect(source.sourceSha256).toBe(
      "63a4926e5077d4ae46721de60349025ef44c8be70c3c88fe9c5b38f1af312a75",
    );
    expect(
      createHash("sha256")
        .update(readFileSync("public/archive/s6/key-visual.jpg"))
        .digest("hex"),
    ).toBe("3f40ae9a494ef7b349229e45c016c0e8fb82719b125bd4c407cd121099e720b7");
  });
});
