import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  users,
  registrations,
  registrationEvents,
  editionEvents,
  staffRoles,
} from "../../src/db/schema";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { applicationQuestions } from "../fixtures/application-questions";
import { seedEditions } from "../fixtures/editions";
import { readTournament } from "../../src/lib/tournament-reads";
import { tournamentCommand } from "../../src/lib/tournaments";
import { submitRegistration } from "../../src/lib/registrations";
import {
  applicationDetails,
  exportApplications,
  listApplications,
} from "../../src/lib/staff-registration-reads";
import { playerApplications } from "../../src/lib/dashboard";
import { applicationAnswers } from "../../src/lib/application-answers";
import { publicPlayers } from "../../src/lib/players";
const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 114001, username: "Synthetic Admin" };
const player = { osuId: 114002, username: "Synthetic Applicant" };
const scoped = { osuId: 114003, username: "Synthetic Scoped Admin" };
const payload = {
  configurationVersion: 0,
  answers: { availability: "weekend", introduction: "Original private text" },
};
describe.skipIf(!url)("single-choice application integrity", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", String(admin.osuId));
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await db().insert(users).values([admin, player, scoped]);
    await seedEditions([
      {
        ...edition,
        rules: null,
        eligibility: null,
        registration: {
          ...edition.registration,
          questions: applicationQuestions,
        },
      },
      { ...edition, slug: "other-test-cup" },
    ]);
    await db().insert(staffRoles).values({
      userId: scoped.osuId,
      role: "admin",
      editionSlug: "other-test-cup",
      grantedBy: admin.osuId,
    });
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("rejects forged/duplicate choices and stale submissions without writing registrations or success events", async () => {
    for (const answers of [
      {},
      { availability: "unknown" },
      { availability: ["evening", "weekend"] },
      { availability: "weekend", unknown: "answer" },
    ]) {
      await expect(
        submitRegistration(player, edition.slug, { ...payload, answers }),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(await db().select().from(registrations)).toEqual([]);
    expect(await db().select().from(registrationEvents)).toEqual([]);
    const current = (await readTournament(edition.slug))!;
    await tournamentCommand(admin, edition.slug, {
      action: "registration",
      expectedRevision: 0,
      confirmed: true,
      registration: {
        ...current.edition.registration,
        questions: applicationQuestions.map((q) => ({
          ...q,
          label: `${q.label} changed`,
        })),
      },
    });
    await expect(
      submitRegistration(player, edition.slug, payload),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("preserves original labels through reorder, relabel, option removal and question removal; private reads/export respect scopes", async () => {
    const saved = await submitRegistration(player, edition.slug, payload);
    let current = (await readTournament(edition.slug))!;
    for (const questions of [
      [
        applicationQuestions[0],
        {
          ...applicationQuestions[1],
          options: [
            { id: "weekend", label: "Rewritten meaning" },
            { id: "evening", label: "Other" },
          ],
        },
      ],
      [
        applicationQuestions[0],
        {
          ...applicationQuestions[1],
          options: [
            { id: "evening", label: "Other" },
            { id: "new_option", label: "New option" },
          ],
        },
      ],
      [],
    ]) {
      current = await tournamentCommand(admin, edition.slug, {
        action: "registration",
        expectedRevision: current.revision,
        confirmed: true,
        registration: { ...current.edition.registration, questions },
      });
    }
    const detail = await applicationDetails(admin, saved.id);
    const answers = applicationAnswers(
      detail.registration.answers,
      detail.acknowledgedConfiguration,
    );
    expect(answers.find((a) => a.id === "availability")).toMatchObject({
      value: 'Synthetic weekend, "original"',
      optionId: "weekend",
    });
    expect(
      (await playerApplications(player.osuId))[0].acknowledgedConfiguration,
    ).toEqual(detail.acknowledgedConfiguration);
    const exported = await exportApplications(admin, { edition: edition.slug });
    expect(exported[0].applicationAnswers).toContain(
      'Synthetic availability [availability]: Synthetic weekend, "original" [weekend]',
    );
    expect(exported[0].applicationAnswers).not.toContain("Rewritten meaning");
    expect(JSON.stringify(await listApplications(admin, {}))).not.toContain(
      "Original private text",
    );
    expect(await exportApplications(scoped, {})).toEqual([]);
    await expect(exportApplications(player, {})).rejects.toMatchObject({
      status: 403,
    });
    await expect(applicationDetails(scoped, saved.id)).rejects.toMatchObject({
      status: 403,
    });
    await db()
      .update(registrations)
      .set({ status: "accepted" })
      .where(eq(registrations.id, saved.id));
    expect(
      JSON.stringify(await publicPlayers({ edition: edition.slug })),
    ).not.toMatch(/Original private text|availability|weekend/);
    expect(await db().select().from(registrationEvents)).toHaveLength(1);
    expect(await db().select().from(editionEvents)).toHaveLength(3);
  });
});
