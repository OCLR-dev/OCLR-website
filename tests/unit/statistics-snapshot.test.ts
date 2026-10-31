import { describe, expect, it } from "vitest";
import {
  hasStatisticsAdjudication,
  parseStatisticsSnapshot,
  statisticsSnapshotSchema,
} from "../../src/lib/statistics-snapshot";
import { fixtureStatisticsIssues } from "../../src/lib/archive-statistics-model";
import { archiveMatchDetails } from "../../src/lib/match-details-model";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
const legacy = () => ({
  archiveKey: "a".repeat(64),
  source: statisticsSource(),
  poolId: "final",
  included: [1, 2],
  technicalAdjudication: true,
});

describe("structured statistics snapshot", () => {
  it("migrates legacy flags and unknown exclusion reasons without inventing evidence", () => {
    const raw = legacy();
    const s = parseStatisticsSnapshot(raw);
    expect(s.adjudication).toEqual({ kind: "technical" });
    expect(s.excludedGames).toEqual([
      { gameId: 3, reason: "unknown" },
      { gameId: 4, reason: "unknown" },
    ]);
    expect(s).not.toHaveProperty("technicalAdjudication");
    expect(s).not.toHaveProperty("reviewedAt");
    expect(s).not.toHaveProperty("reviewedBy");
    expect(s).not.toHaveProperty("evidenceUrl");
    expect(s.source).toEqual(raw.source);
    expect(raw.technicalAdjudication).toBe(true);
    expect(parseStatisticsSnapshot(s)).toEqual(s);
  });
  it("rejects contradictory representations and invalid or incomplete exclusion decisions", () => {
    const s = parseStatisticsSnapshot(legacy());
    for (const excludedGames of [
      [{ gameId: 3, reason: "warmup" }],
      [
        { gameId: 1, reason: "warmup" },
        { gameId: 3, reason: "aborted" },
        { gameId: 4, reason: "post-match" },
      ],
      [
        { gameId: 999, reason: "warmup" },
        { gameId: 4, reason: "post-match" },
      ],
      [
        { gameId: 3, reason: "warmup" },
        { gameId: 3, reason: "warmup" },
        { gameId: 4, reason: "warmup" },
      ],
      [
        { gameId: 3, reason: "made-up" },
        { gameId: 4, reason: "warmup" },
      ],
    ]) {
      expect(
        statisticsSnapshotSchema.safeParse({ ...s, excludedGames }).success,
      ).toBe(false);
      expect(
        fixtureStatisticsIssues(statisticsArchive, "one", [
          { ...s, excludedGames } as never,
        ]),
      ).toContain("Only eligible recorded games can be selected.");
    }
    expect(
      statisticsSnapshotSchema.safeParse({ ...s, technicalAdjudication: false })
        .success,
    ).toBe(false);
    expect(
      statisticsSnapshotSchema.safeParse({
        ...s,
        adjudication: { kind: "forfeit" },
      }).success,
    ).toBe(false);
  });
  it("checks reviewer pairs and safe evidence URLs", () => {
    const s = parseStatisticsSnapshot(legacy());
    expect(
      statisticsSnapshotSchema.safeParse({ ...s, reviewedBy: 123 }).success,
    ).toBe(false);
    expect(
      statisticsSnapshotSchema.safeParse({ ...s, reviewedAt: "yesterday" })
        .success,
    ).toBe(false);
    for (const evidenceUrl of [
      "http://example.com",
      "https://user:password@example.com",
      "javascript:alert(1)",
    ])
      expect(
        statisticsSnapshotSchema.safeParse({ ...s, evidenceUrl }).success,
      ).toBe(false);
    const reviewed = parseStatisticsSnapshot({
      ...s,
      reviewedBy: 123,
      reviewedAt: "2026-10-31T08:00:00Z",
      evidenceUrl: "https://example.com/evidence",
    });
    expect(reviewed.reviewedBy).toBe(123);
  });
  it("uses the structured decision for reconciliation without relaxing game validation", () => {
    const s = parseStatisticsSnapshot(legacy());
    s.source.games[1].scores[2].total = 999;
    expect(fixtureStatisticsIssues(statisticsArchive, "one", [s])).toEqual([]);
    expect(
      fixtureStatisticsIssues(statisticsArchive, "one", [
        { ...s, adjudication: null },
      ]),
    ).toContain(
      "Selected games do not reconcile with the recorded series score.",
    );
    s.source.games[0].scores[0].osuId = 999999;
    expect(fixtureStatisticsIssues(statisticsArchive, "one", [s])).toContain(
      "A score cannot be matched to the recorded roster.",
    );
    expect(
      hasStatisticsAdjudication({
        adjudication: null,
        technicalAdjudication: true,
      }),
    ).toBe(false);
  });
  it("projects reasons and the existing notice without disclosing reviewer evidence", () => {
    const s = parseStatisticsSnapshot({
      ...legacy(),
      reviewedBy: 123456789,
      reviewedAt: "2026-10-31T08:00:00Z",
      evidenceUrl: "https://private.example.com/evidence",
    });
    const details = archiveMatchDetails(statisticsArchive, "one", [
      { snapshot: s, revision: "one" },
    ]);
    expect(details.technicalAdjudication).toBe(true);
    expect(details.games.find((g) => g.gameId === 3)?.excludedReason).toBe(
      "unknown",
    );
    expect(
      details.games.find((g) => g.gameId === 1)?.excludedReason,
    ).toBeUndefined();
    expect(JSON.stringify(details)).not.toContain("123456789");
    expect(JSON.stringify(details)).not.toContain("private.example.com");
  });
});
