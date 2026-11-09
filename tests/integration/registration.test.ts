import { seedEditions } from "../fixtures/editions";
import { assertTestDatabase } from "../database";
import {
  afterAll,
  beforeAll,
  beforeEach,
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
  editionState,
  registrationEvents,
  staffRoles,
} from "../../src/db/schema";
import {
  registrationAvailability,
  ownRegistrations,
} from "../../src/lib/registration-reads";
import {
  submitRegistration,
  withdrawRegistration,
} from "../../src/lib/registrations";
import { edition } from "../fixtures/edition";
import { withReadChannel } from "../../src/lib/read-channel";
import { POST as submitRegistrationRoute } from "../../src/app/api/tournaments/[edition]/registrations/route";
import { POST as withdrawRegistrationRoute } from "../../src/app/api/registrations/[id]/withdraw/route";
import {
  registrationFieldError,
  submitRegistrationWrite,
  withdrawRegistrationWrite,
} from "../../src/lib/registration-write-contract";
const testUrl = process.env.TEST_DATABASE_URL;
const a = { osuId: 20001, username: "Synthetic Registration A" };
const b = { osuId: 20002, username: "Synthetic Registration B" };
const valid = {
  rulesAcknowledged: true,
  configurationVersion: 0,
  eligibilityAcknowledged: true,
  rulesVersion: "test-v1",
  answers: {},
};
const origin = "https://oclr.example.test";
vi.mock("../../src/lib/auth/user", async (original) => ({
  ...(await original<typeof import("../../src/lib/auth/user")>()),
  requireUser: async () => a,
}));
function postRegistration(path: string, input: unknown) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
describe.skipIf(!testUrl)("individual registration transactions", () => {
  beforeAll(() => {
    assertTestDatabase(testUrl);
    vi.stubEnv("DATABASE_URL", testUrl!);
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "60001");
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([edition]);
    await db().insert(users).values([a, b]);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("allows Developer self-registration and withdrawal while preserving ownership and read-only transports", async () => {
    await db()
      .insert(staffRoles)
      .values({ userId: a.osuId, role: "developer", grantedBy: a.osuId });
    const saved = await submitRegistration(a, edition.slug, valid);
    expect(saved).toMatchObject({ userId: a.osuId, status: "pending" });
    await expect(
      withReadChannel(() =>
        withdrawRegistration(a, saved.id, { confirmed: true }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      withReadChannel(() => submitRegistration(a, edition.slug, valid)),
    ).rejects.toMatchObject({ status: 403 });
    vi.stubEnv("OCLR_DATA_SOURCE", "remote");
    try {
      await expect(
        submitRegistration(a, edition.slug, valid),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        withdrawRegistration(a, saved.id, { confirmed: true }),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      vi.stubEnv("OCLR_DATA_SOURCE", "database");
    }
    const other = await submitRegistration(b, edition.slug, valid);
    await expect(
      withdrawRegistration(a, other.id, { confirmed: true }),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await withdrawRegistration(a, saved.id, { confirmed: true })).status,
    ).toBe("withdrawn");
    expect((await ownRegistrations(b.osuId))[0].status).toBe("pending");
  });
  it("commits exactly one concurrent application with a database unique constraint", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        submitRegistration(a, edition.slug, valid),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await ownRegistrations(a.osuId)).toHaveLength(1);
    expect(await ownRegistrations(b.osuId)).toHaveLength(0);
    await expect(
      db().insert(registrations).values({
        editionSlug: edition.slug,
        userId: a.osuId,
        rulesVersion: "test-v1",
        answers: {},
      }),
    ).rejects.toThrow();
    expect(await db().select().from(registrationEvents)).toHaveLength(1);
  });
  it("fails closed for missing privacy configuration without changing existing applications", async () => {
    await submitRegistration(a, edition.slug, valid);
    const saved = await ownRegistrations(a.osuId);
    try {
      for (const contact of [undefined, "", "invalid", "60001,70001"]) {
        vi.stubEnv("PRIVACY_CONTACT_OSU_ID", contact);
        expect(await registrationAvailability(edition)).toBe("unavailable");
        await expect(
          submitRegistration(b, edition.slug, valid),
        ).rejects.toMatchObject({ status: 503 });
      }
      expect(await ownRegistrations(a.osuId)).toEqual(saved);
      expect(await ownRegistrations(b.osuId)).toHaveLength(0);
      expect(await db().select().from(registrationEvents)).toHaveLength(1);
    } finally {
      vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "60001");
    }
    expect(await registrationAvailability(edition)).toBe("open");
    expect((await submitRegistration(b, edition.slug, valid)).status).toBe(
      "pending",
    );
  });
  it("rejects forged identities/status, stale rules, invalid answers and closed windows", async () => {
    await expect(
      submitRegistration(a, edition.slug, { ...valid, userId: b.osuId }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      submitRegistration(a, edition.slug, { ...valid, status: "accepted" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      submitRegistration(a, edition.slug, { ...valid, rulesVersion: "old" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      submitRegistration(a, edition.slug, {
        ...valid,
        answers: { invented: "x" },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await seedEditions([
      {
        ...edition,
        registration: {
          ...edition.registration,
          opensAt: "2020-01-01T00:00:00Z",
          closesAt: "2021-01-01T00:00:00Z",
        },
      },
    ]);
    await expect(
      submitRegistration(a, edition.slug, valid),
    ).rejects.toMatchObject({ status: 409 });
    expect(await ownRegistrations(a.osuId)).toHaveLength(0);
  });
  it("keeps answers private and requires approved questions with bounded responses", async () => {
    await seedEditions([
      {
        ...edition,
        registration: {
          ...edition.registration,
          questions: [
            {
              id: "approved",
              label: "Synthetic question",
              required: true,
              maxLength: 5,
            },
          ],
        },
      },
    ]);
    const submit = (input: unknown, authorization?: string) => {
      const request = postRegistration(
        submitRegistrationWrite.path.replace("{edition}", edition.slug),
        input,
      );
      if (authorization) request.headers.set("authorization", authorization);
      return submitRegistrationRoute(request, {
        params: Promise.resolve({ edition: edition.slug }),
      });
    };
    const bearer = await submit(valid, "Bearer synthetic-read-token");
    expect(bearer.status).toBe(403);
    expect(await bearer.json()).toEqual({
      error: "Use a browser session for this operation.",
    });
    for (const input of [
      valid,
      { ...valid, answers: { approved: "123456" } },
    ]) {
      const rejected = await submit(input);
      expect(rejected.status).toBe(400);
      const error = await rejected.json();
      expect(registrationFieldError.parse(error)).toEqual(error);
      expect(error.field).toBe("approved");
    }
    const accepted = await submit({
      ...valid,
      answers: { approved: "  good " },
    });
    expect(accepted.status).toBe(201);
    const saved = await accepted.json();
    expect(submitRegistrationWrite.response.parse(saved)).toEqual(saved);
    expect(saved).toEqual({ id: expect.any(String), status: "pending" });
    expect((await ownRegistrations(a.osuId))[0].answers).toEqual({
      approved: "good",
    });
    await expect(
      withdrawRegistration(b, saved.id, { confirmed: true }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("withdraws only the owner with confirmation and records a terminal transition", async () => {
    const saved = await submitRegistration(a, edition.slug, valid);
    await expect(
      withdrawRegistration(a, saved.id, { confirmed: false }),
    ).rejects.toMatchObject({ status: 400 });
    const withdraw = () =>
      withdrawRegistrationRoute(
        postRegistration(
          withdrawRegistrationWrite.path.replace("{id}", saved.id),
          { confirmed: true },
        ),
        { params: Promise.resolve({ id: saved.id }) },
      );
    const response = await withdraw();
    expect(response.status).toBe(200);
    const receipt = await response.json();
    expect(withdrawRegistrationWrite.response.parse(receipt)).toEqual(receipt);
    expect(receipt).toEqual({ id: saved.id, status: "withdrawn" });
    expect((await withdraw()).status).toBe(409);
    expect(await db().select().from(registrationEvents)).toHaveLength(2);
  });
  it("blocks withdrawal and new applications when the edition is locked", async () => {
    expect(await registrationAvailability(edition)).toBe("open");
    const saved = await submitRegistration(a, edition.slug, valid);
    await db()
      .update(editionState)
      .set({ registrationPausedAt: new Date() })
      .where(eq(editionState.slug, edition.slug));
    expect(await registrationAvailability(edition)).toBe("closed");
    await expect(
      withdrawRegistration(a, saved.id, { confirmed: true }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      submitRegistration(b, edition.slug, valid),
    ).rejects.toMatchObject({ status: 409 });
  });
});
