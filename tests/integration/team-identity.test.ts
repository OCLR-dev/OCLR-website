import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { sql, eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import { teams, memberships, editionEvents } from "../../src/db/schema";
import { draftCommand } from "../../src/lib/draft";
import { publicDraft, staffDraft } from "../../src/lib/draft-reads";
import { prepareDraft } from "../fixtures/draft";
import { staffTeams, publishedTeams } from "../../src/lib/team-reads";
import { updateTeams } from "../../src/lib/teams";
import { assertTestDatabase } from "../database";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("targeted team identity corrections", () => {
  let f: Awaited<ReturnType<typeof prepareDraft>>;
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", "999001");
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
    f = await prepareDraft("team-identity-test", 999001);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("corrects one finalized team's branding while preserving roster/capacity and publication", async () => {
    const data = await staffTeams(f.staff, "team-identity-test"),
      team = data.teams[0],
      memberBefore = await db().select().from(memberships);
    await db()
      .update(teams)
      .set({ finalizedAt: new Date() })
      .where(eq(teams.id, team.id));
    const input = {
      expectedVersion: data.version,
      confirmed: true,
      command: {
        action: "edit",
        teamId: team.id,
        name: "Synthetic corrected identity",
        capacity: team.capacity,
        avatarKey: null,
      },
    };
    const teamsBefore = await staffTeams(f.staff, "team-identity-test");
    const sessionBefore = (
      await staffDraft(f.staff, "team-identity-test")
    ).session!;
    await db().execute(sql`
      CREATE FUNCTION test_reject_team_edit_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.kind = 'team_edit' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER test_reject_team_edit_audit BEFORE INSERT ON edition_events
      FOR EACH ROW EXECUTE FUNCTION test_reject_team_edit_audit();
    `);
    try {
      await expect(
        updateTeams(f.staff, "team-identity-test", input),
      ).rejects.toThrow();
      expect(await staffTeams(f.staff, "team-identity-test")).toEqual(
        teamsBefore,
      );
      expect((await staffDraft(f.staff, "team-identity-test")).session).toEqual(
        sessionBefore,
      );
    } finally {
      await db().execute(sql`
        DROP TRIGGER test_reject_team_edit_audit ON edition_events;
        DROP FUNCTION test_reject_team_edit_audit();
      `);
    }
    const updated = await updateTeams(f.staff, "team-identity-test", input);
    const sessionAfter = (await staffDraft(f.staff, "team-identity-test"))
      .session;
    expect(sessionAfter).toMatchObject({
      version: sessionBefore.version + 1,
      publicVersion: sessionBefore.publicVersion + 1,
      publishedRevision: sessionBefore.version + 1,
    });
    expect(
      (await publicDraft("team-identity-test"))?.rosters.find(
        (r) => r.team.id === team.id,
      )?.team.name,
    ).toBe("Synthetic corrected identity");
    expect(updated.teams.find((t) => t.id === team.id)?.name).toBe(
      "Synthetic corrected identity",
    );
    expect(await db().select().from(memberships)).toEqual(memberBefore);
    expect(
      (await publishedTeams("team-identity-test")).find((t) => t.id === team.id)
        ?.name,
    ).toBe("Synthetic corrected identity");
    await expect(
      updateTeams(f.staff, "team-identity-test", input),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateTeams(f.staff, "team-identity-test", {
        ...input,
        expectedVersion: updated.version,
        command: { ...input.command, capacity: 3 },
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateTeams(f.a, "team-identity-test", input),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      updateTeams(f.staff, "team-identity-test", {
        ...input,
        expectedVersion: updated.version,
        command: {
          ...input.command,
          avatarKey: "4ec6b145-6eca-43e5-b0d0-97bd628db098",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await db().select().from(editionEvents)).filter(
        (e) => e.kind === "team_edit",
      ),
    ).toHaveLength(1);
  });
  it("permits unlocked capacity changes but rejects shrinking below membership", async () => {
    const current = await staffDraft(f.staff, "team-identity-test");
    await draftCommand(f.staff, "team-identity-test", {
      command: {
        action: "unlock",
        expectedSetupVersion: current.edition!.setupVersion,
      },
      expectedVersion: current.session!.version,
      confirmed: true,
    });
    const data = await staffTeams(f.staff, "team-identity-test"),
      team = data.teams[0];
    const input = {
      expectedVersion: data.version,
      confirmed: true,
      command: {
        action: "edit",
        teamId: team.id,
        name: team.name,
        capacity: 1,
        avatarKey: null,
      },
    };
    expect(
      (await updateTeams(f.staff, "team-identity-test", input)).teams.find(
        (t) => t.id === team.id,
      )?.capacity,
    ).toBe(1);
  });
});
