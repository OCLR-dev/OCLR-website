import { expect, it } from "vitest";
import { buildDraftSnapshots } from "../../src/lib/draft-board";
import type { DraftData } from "../../src/lib/draft-data";

it("projects captain and public draft snapshots under their separate visibility rules", () => {
  const captain = { osuId: 1, username: "Synthetic Captain" };
  const candidate = { osuId: 2, username: "Synthetic Candidate" };
  const team = {
    id: "team-a",
    editionSlug: "test-cup",
    captainId: captain.osuId,
    name: "Synthetic Team",
    capacity: 2,
    avatarKey: null,
    identityPublished: true,
    rosterPublished: false,
    finalizedAt: null,
    archivedAt: null,
  };
  const roster = { id: team.id, name: team.name, captain };
  const timestamp = new Date("2026-11-09T00:00:00Z");
  const data = {
    session: {
      id: "session",
      editionSlug: team.editionSlug,
      state: "live",
      version: 4,
      publicVersion: 2,
      publishedRevision: -1,
      publicSnapshot: null,
      captainSnapshot: null,
      turnIndex: 0,
      turnSequence: [team.id],
      pool: [candidate.osuId],
    },
    edition: {
      slug: team.editionSlug,
      configuration: null,
      configurationVersion: 0,
      createdAt: timestamp,
      configurationUpdatedAt: timestamp,
      lockedAt: null,
      registrationPausedAt: null,
      setupVersion: 1,
      poolPublished: false,
    },
    teams: [{ team, captainName: captain.username, captainPublished: true }],
    members: [
      {
        membership: {
          id: "captain-membership",
          editionSlug: team.editionSlug,
          teamId: team.id,
          userId: captain.osuId,
          origin: "captain",
          joinedAt: timestamp,
          leftAt: null,
        },
        username: captain.username,
      },
    ],
    picks: [],
    identities: [candidate],
  } satisfies DraftData;

  expect(buildDraftSnapshots(data)).toMatchObject({
    publicSnapshot: null,
    publishedRevision: -1,
    captainSnapshot: {
      eligiblePool: [candidate],
      capacities: { [team.id]: 2 },
    },
  });
  const released = buildDraftSnapshots(data, true);
  expect(released).toMatchObject({
    publicVersion: 3,
    publishedRevision: 4,
    publicSnapshot: {
      activeTeam: roster,
      rosters: [{ team: roster, players: [captain] }],
      pool: null,
    },
  });
  const withdrawn = buildDraftSnapshots({
    ...data,
    session: { ...data.session, publicSnapshot: released.publicSnapshot },
    teams: [{ ...data.teams[0], captainPublished: false }],
  });
  expect(withdrawn.publicSnapshot).toBeNull();
  expect(withdrawn.publishedRevision).toBe(-1);
  expect(withdrawn.captainSnapshot).toEqual(released.captainSnapshot);
});
