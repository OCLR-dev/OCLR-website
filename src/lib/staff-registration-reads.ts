import { db, readOnlyData } from "@/db";
import {
  editionRevisions,
  registrationAttempts,
  registrations,
  users,
} from "@/db/schema";
import { and, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { applicationAnswers } from "./application-answers";
import type { User } from "./auth/sessions";
import {
  assertReadCapability,
  capabilityScope,
  readCapabilityScope,
} from "./auth/staff";
import { remoteMode } from "./data-source";
import type { EditionConfiguration } from "./editions";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http-error";
import {
  registrationAnswerValues,
  registrationReadColumns,
} from "./live-season-columns";
import { cachedExportStatistics } from "./osu-profiles";
import { staffApplicationFilters } from "./read-api-queries";
import { registrationOperation } from "./registration-reads";
import { RemoteDataError } from "./remote-errors";

export function parseFilters(input: unknown) {
  const result = staffApplicationFilters.safeParse(input);
  if (!result.success) throw new HttpError(400, "Invalid search or filter.");
  return result.data;
}
export type StaffFilters = ReturnType<typeof parseFilters>;
function conditions(filters: StaffFilters) {
  return and(
    filters.edition
      ? eq(registrations.editionSlug, filters.edition)
      : undefined,
    filters.status === "active"
      ? ne(registrations.status, "withdrawn")
      : filters.status
        ? eq(registrations.status, filters.status)
        : undefined,
    filters.q
      ? or(
          // Usernames often contain "_"; match it (and "%") literally.
          ilike(users.username, `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`),
          /^\d+$/.test(filters.q) && Number.isSafeInteger(Number(filters.q))
            ? eq(users.osuId, Number(filters.q))
            : undefined,
        )
      : undefined,
  );
}
const listFields = {
  id: registrations.id,
  userId: registrations.userId,
  username: users.username,
  editionSlug: registrations.editionSlug,
  status: registrations.status,
  createdAt: registrations.createdAt,
  updatedAt: registrations.updatedAt,
};
type ListApplications =
  import("./explicit-read-contracts").ExplicitReadData<"listApplications">;
async function databaseListApplications(
  actor: User,
  input: unknown,
  exporting = false,
): Promise<ListApplications> {
  const scopes = exporting
    ? await capabilityScope(actor, "manage_registrations")
    : await readCapabilityScope(actor, "manage_registrations");
  const filters = parseFilters(input);
  const where = and(
    conditions(filters),
    scopes ? inArray(registrations.editionSlug, scopes) : undefined,
  );
  const [rows, totals] = await Promise.all([
    db()
      .select(listFields)
      .from(registrations)
      .innerJoin(users, eq(registrations.userId, users.osuId))
      .where(where)
      .orderBy(desc(registrations.createdAt), registrations.id)
      .limit(exporting ? 10001 : 25)
      .offset(exporting ? 0 : (filters.page - 1) * 25),
    db()
      .select({ count: count() })
      .from(registrations)
      .innerJoin(users, eq(registrations.userId, users.osuId))
      .where(where),
  ]);
  if (exporting && rows.length > 10000)
    throw new HttpError(
      413,
      "Narrow the export filters to at most 10,000 applications.",
    );
  return { rows, total: totals[0].count, filters };
}
export async function listApplications(
  actor: User,
  input: unknown,
  exporting = false,
): Promise<ListApplications> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    if (exporting) throw new RemoteDataError("REMOTE_FORBIDDEN", 403);
    return frontendResource<ListApplications>("listApplications", { input });
  }
  return databaseListApplications(actor, input, exporting);
}

export async function exportApplications(actor: User, input: unknown) {
  if (remoteMode()) throw new RemoteDataError("REMOTE_FORBIDDEN", 403);
  // db() resolves to this shared repeatable-read connection in all nested
  // authorization, list and batched saved-statistics readers.
  return readOnlyData(() => exportApplicationSnapshot(actor, input));
}
async function exportApplicationSnapshot(actor: User, input: unknown) {
  const { rows } = await listApplications(actor, input, true);
  if (!rows.length) return [];
  const statistics = await cachedExportStatistics(
    rows.map((row) => row.userId),
  );
  const snapshots = await db()
    .select({
      id: registrations.id,
      answers: registrationAnswerValues,
      editionSlug: registrations.editionSlug,
      version: registrations.configurationVersion,
    })
    .from(registrations)
    .where(
      inArray(
        registrations.id,
        rows.map((row) => row.id),
      ),
    );
  // Read each submitted question revision once, without repeating large rules
  // documents for every applicant in the bounded export.
  const selectedRevisions = [
    ...new Map(
      snapshots.map((row) => [
        JSON.stringify([row.editionSlug, row.version]),
        { slug: row.editionSlug, version: row.version },
      ]),
    ).values(),
  ];
  const knownRevisions = selectedRevisions.filter(
    (revision): revision is { slug: string; version: number } =>
      revision.version !== null,
  );
  const revisions = await db()
    .select({
      slug: editionRevisions.editionSlug,
      version: editionRevisions.version,
      registration: sql<
        EditionConfiguration["registration"]
      >`${editionRevisions.configuration}->'registration'`,
    })
    .from(editionRevisions)
    .where(
      or(
        ...knownRevisions.map((revision) =>
          and(
            eq(editionRevisions.editionSlug, revision.slug),
            eq(editionRevisions.version, revision.version),
          ),
        ),
      ) ?? sql`false`,
    );
  const byRevision = new Map(
    revisions.map((row) => [
      `${row.slug}:${row.version}`,
      { registration: row.registration },
    ]),
  );
  const byId = new Map(snapshots.map((row) => [row.id, row]));
  return rows.map((row) => {
    const snapshot = byId.get(row.id);
    return {
      ...row,
      statistics: statistics.get(row.userId) ?? null,
      applicationAnswers: snapshot
        ? applicationAnswers(
            snapshot.answers,
            byRevision.get(`${snapshot.editionSlug}:${snapshot.version}`),
          )
            .map(
              (answer) =>
                `${answer.label} [${answer.id}]: ${answer.value}${answer.optionId ? ` [${answer.optionId}]` : ""}`,
            )
            .join("\n")
        : "",
    };
  });
}
type ApplicationDetails =
  import("./explicit-read-contracts").ExplicitReadData<"applicationDetails">;
async function databaseApplicationDetails(
  actor: User,
  id: string,
): Promise<ApplicationDetails> {
  await readCapabilityScope(actor, "manage_registrations");
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "Application not found.");
  const [row] = await db()
    .select({
      registration: registrationReadColumns,
      lastOperation: registrationOperation,
      username: users.username,
      acknowledgedConfiguration: editionRevisions.configuration,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.userId, users.osuId))
    .leftJoin(
      editionRevisions,
      and(
        eq(editionRevisions.editionSlug, registrations.editionSlug),
        eq(editionRevisions.version, registrations.configurationVersion),
      ),
    )
    .where(eq(registrations.id, id));
  if (!row) throw new HttpError(404, "Application not found.");
  await assertReadCapability(
    actor,
    "manage_registrations",
    row.registration.editionSlug,
  );
  const attempts = await db()
    .select({
      attempt: registrationAttempts.attempt,
      snapshot: registrationAttempts.snapshot,
      configuration: editionRevisions.configuration,
    })
    .from(registrationAttempts)
    .leftJoin(
      editionRevisions,
      and(
        eq(editionRevisions.editionSlug, registrationAttempts.editionSlug),
        eq(editionRevisions.version, registrationAttempts.configurationVersion),
      ),
    )
    .where(eq(registrationAttempts.registrationId, id))
    .orderBy(desc(registrationAttempts.attempt));
  return { ...row, attempts };
}
export async function applicationDetails(
  actor: User,
  id: string,
): Promise<ApplicationDetails> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<ApplicationDetails>("applicationDetails", { id });
  }
  return databaseApplicationDetails(actor, id);
}
