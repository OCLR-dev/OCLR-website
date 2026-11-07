import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  editionState,
  registrations,
  registrationEvents,
  users,
} from "@/db/schema";
import { assertCapability } from "./auth/staff";
import type { User } from "./auth/sessions";
import { privacyReady } from "./auth/config";
import { competitionStructureProtected, storedEdition } from "./tournaments";
import { enrollmentState } from "./editions";
import { getOsuUserProfile, getOsuProfileByUsername } from "./osu-profiles";
import { parseOsuProfile } from "./osu-profile-model";
import { verifyEligibility } from "./eligibility";
import { HttpError } from "./http";
import { registrationMetadata } from "./live-season-columns";
import {
  MANUAL_BATCH_LIMIT,
  MANUAL_BATCH_TEXT_LIMIT,
  parseManualLines,
} from "./manual-registration-model";

const lookupInput = z
  .object({
    input: z.string().trim().min(1).max(300),
    inputType: z.enum(["id", "username"]).default("id"),
  })
  .strict();
const enrollmentInput = lookupInput
  .extend({
    expectedRevision: z.number().int().nonnegative(),
    status: z.enum(["pending", "accepted"]),
    confirmed: z.literal(true),
    publicationAcknowledged: z.boolean().default(false),
    overrideWindow: z.boolean().default(false),
    overrideEligibility: z.boolean().default(false),
    exceptionReason: z.string().trim().max(1000).default(""),
  })
  .strict();
async function verifiedIdentity(
  input: string,
  inputType: "id" | "username" = "id",
) {
  const identity = inputType === "id" ? parseOsuProfile(input) : null;
  const snapshot = identity
    ? await getOsuUserProfile(identity.osuId, identity.mode)
    : await getOsuProfileByUsername(input);
  if (snapshot.stale || snapshot.notice)
    throw new HttpError(
      503,
      "A current verified osu! profile is required. Retry when the provider is available.",
    );
  return snapshot.profile;
}
async function context(
  actor: User,
  slug: string,
  reader: Pick<ReturnType<typeof db>, "select"> = db(),
  lock = false,
) {
  await assertCapability(actor, "manage_registrations", slug, reader);
  const query = reader
    .select()
    .from(editionState)
    .where(eq(editionState.slug, slug));
  const [state] = await (lock ? query.for("update") : query);
  const edition = state && storedEdition(state)?.edition;
  if (!edition) throw new HttpError(404, "Tournament not found.");
  if (
    edition.status === "completed" ||
    (await competitionStructureProtected(slug, Boolean(state.lockedAt), reader))
  )
    throw new HttpError(
      409,
      "Manual enrollment is unavailable for a completed, locked or frozen tournament.",
    );
  if (!privacyReady())
    throw new HttpError(503, "Registration is awaiting privacy configuration.");
  return {
    edition,
    revision: state.configurationVersion,
    outsideWindow: enrollmentState(edition) !== "open",
  };
}
export async function previewManualRegistration(
  actor: User,
  slug: string,
  input: unknown,
) {
  await assertCapability(actor, "manage_registrations", slug);
  const parsed = lookupInput.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Enter a numeric osu! ID or canonical HTTPS osu! profile URL.",
    );
  await context(actor, slug);
  const profile = await verifiedIdentity(
    parsed.data.input,
    parsed.data.inputType,
  );
  const initial = await context(actor, slug);
  const verification = await verifyEligibility(
    profile.osuId,
    initial.edition,
    initial.revision,
  );
  // Eligibility can also refresh provider data; recheck after all provider I/O.
  const current = await context(actor, slug);
  if (current.revision !== initial.revision)
    throw new HttpError(
      409,
      "The tournament configuration changed. Verify the player again before adding.",
    );
  return {
    profile,
    existing: await existingRegistration(slug, profile.osuId),
    verification,
    edition: {
      slug,
      name: current.edition.name,
      revision: current.revision,
      outsideWindow: current.outsideWindow,
    },
  };
}
export async function addManualRegistration(
  actor: User,
  slug: string,
  input: unknown,
) {
  await assertCapability(actor, "manage_registrations", slug);
  const parsed = enrollmentInput.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Confirm a valid player and registration status.");
  const command = parsed.data;
  if (command.status === "accepted" && !command.publicationAcknowledged)
    throw new HttpError(
      400,
      "Confirm publication of the accepted player's basic identity.",
    );
  const initial = await context(actor, slug);
  if (initial.revision !== command.expectedRevision)
    throw new HttpError(
      409,
      "The tournament configuration changed. Verify the player again before adding.",
    );
  const profile = await verifiedIdentity(command.input, command.inputType);
  const verification = await verifyEligibility(
    profile.osuId,
    initial.edition,
    initial.revision,
  );
  if (
    verification &&
    verification.status !== "pass" &&
    !command.overrideEligibility
  )
    throw new HttpError(
      409,
      "Explicitly confirm the staff eligibility override before adding this player.",
    );
  return db().transaction(async (tx) => {
    const current = await context(actor, slug, tx, true);
    if (
      current.revision !== command.expectedRevision ||
      current.revision !== initial.revision
    )
      throw new HttpError(
        409,
        "The tournament configuration changed. Verify the player again before adding.",
      );
    if (
      current.outsideWindow &&
      (!command.overrideWindow || !command.exceptionReason)
    )
      throw new HttpError(
        409,
        "Confirm the registration-window exception and provide its explanation.",
      );
    // Serialize conflicting identity inserts on the stable user ID, then let the
    // edition/user constraint reject every duplicate status, including withdrawn.
    await tx
      .insert(users)
      .values({ osuId: profile.osuId, username: profile.username })
      .onConflictDoNothing();
    const [registration] = await tx
      .insert(registrations)
      .values({
        editionSlug: slug,
        userId: profile.osuId,
        status: command.status,
        source: "staff",
        configurationVersion: current.revision,
        rulesVersion: null,
        eligibilityAcknowledged: null,
        eligibilityVerification: verification
          ? {
              ...verification,
              status:
                verification.status === "pass" ? "pass" : "staff_override",
            }
          : null,
        answers: {},
      })
      .onConflictDoNothing({
        target: [registrations.editionSlug, registrations.userId],
      })
      .returning(registrationMetadata);
    if (!registration)
      throw new HttpError(
        409,
        "This player already has a registration for this tournament. Review the existing entry.",
      );
    await tx.insert(registrationEvents).values({
      registrationId: registration.id,
      actorId: actor.osuId,
      toStatus: command.status,
      reason: current.outsideWindow ? command.exceptionReason : null,
    });
    return { ...registration, answers: {} as Record<string, string> };
  });
}

async function existingRegistration(slug: string, osuId: number) {
  const [row] = await db()
    .select({ id: registrations.id, status: registrations.status })
    .from(registrations)
    .where(
      and(eq(registrations.editionSlug, slug), eq(registrations.userId, osuId)),
    );
  return row ?? null;
}
const batchPreviewInput = z
  .object({
    text: z.string().max(MANUAL_BATCH_TEXT_LIMIT),
    inputType: z.enum(["id", "username"]),
  })
  .strict();
type SinglePreview = Awaited<ReturnType<typeof previewManualRegistration>>;
export type ManualBatchRow = {
  line: number;
  raw: string;
  input: string;
  inputType: "id" | "username";
  state: "ready" | "duplicate" | "existing" | "failed";
  preview: SinglePreview | null;
  error: string | null;
};
export async function previewManualRegistrations(
  actor: User,
  slug: string,
  input: unknown,
) {
  await context(actor, slug);
  const parsed = batchPreviewInput.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Paste between 1 and 20 non-empty lines (maximum 8192 characters).",
    );
  const lines = parseManualLines(parsed.data.text, parsed.data.inputType);
  const rows: ManualBatchRow[] = [];
  const seen = new Set<number>();
  const initial = await context(actor, slug);
  // Sequential lookups share osuApi pacing and profile cache/backoff. No fan-out.
  for (const line of lines) {
    try {
      const preview = await previewManualRegistration(actor, slug, {
        input: line.input,
        inputType: line.inputType,
      });
      if (preview.edition.revision !== initial.revision)
        throw new HttpError(
          409,
          "The tournament configuration changed. Verify the player again before adding.",
        );
      const state = preview.existing
        ? "existing"
        : seen.has(preview.profile.osuId)
          ? "duplicate"
          : "ready";
      seen.add(preview.profile.osuId);
      rows.push({ ...line, preview, state, error: null });
    } catch (error) {
      // Never return registration details after authorization/state was revoked.
      const current = await context(actor, slug);
      if (current.revision !== initial.revision)
        throw new HttpError(
          409,
          "The tournament configuration changed. Verify the player again before adding.",
        );
      rows.push({
        ...line,
        preview: null,
        state: "failed",
        error:
          error instanceof HttpError
            ? error.message
            : "This request could not be completed. Please try again.",
      });
    }
  }
  const current = await context(actor, slug);
  if (current.revision !== initial.revision)
    throw new HttpError(
      409,
      "The tournament configuration changed. Verify the player again before adding.",
    );
  return {
    rows,
    edition: {
      slug,
      name: current.edition.name,
      revision: current.revision,
      outsideWindow: current.outsideWindow,
    },
  };
}
const batchEnrollmentInput = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    status: z.enum(["pending", "accepted"]),
    confirmed: z.literal(true),
    publicationAcknowledged: z.boolean().default(false),
    overrideWindow: z.boolean().default(false),
    exceptionReason: z.string().trim().max(1000).default(""),
    rows: z
      .array(
        z
          .object({
            line: z.number().int().positive().max(MANUAL_BATCH_TEXT_LIMIT),
            osuId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
            overrideEligibility: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(MANUAL_BATCH_LIMIT),
  })
  .strict();
export type ManualBatchResult = {
  line: number;
  osuId: number;
  state: "added" | "skipped" | "failed";
  registration: { id: string; status: string } | null;
  error: string | null;
};
export async function addManualRegistrations(
  actor: User,
  slug: string,
  input: unknown,
) {
  const current = await context(actor, slug);
  const parsed = batchEnrollmentInput.safeParse(input);
  if (
    !parsed.success ||
    new Set(parsed.data.rows.map((r) => r.line)).size !==
      parsed.data.rows.length
  )
    throw new HttpError(400, "Confirm a valid player and registration status.");
  const { rows, ...command } = parsed.data;
  if (current.revision !== command.expectedRevision)
    throw new HttpError(
      409,
      "The tournament configuration changed. Verify the player again before adding.",
    );
  if (command.status === "accepted" && !command.publicationAcknowledged)
    throw new HttpError(
      400,
      "Confirm publication of the accepted player's basic identity.",
    );
  if (
    current.outsideWindow &&
    (!command.overrideWindow || !command.exceptionReason)
  )
    throw new HttpError(
      409,
      "Confirm the registration-window exception and provide its explanation.",
    );
  const results: ManualBatchResult[] = [];
  for (const row of rows) {
    try {
      // Existing service rechecks identity, eligibility, permissions and edition
      // revision; each player's identity/enrollment/event commits atomically.
      const registration = await addManualRegistration(actor, slug, {
        ...command,
        input: String(row.osuId),
        overrideEligibility: row.overrideEligibility,
      });
      results.push({
        ...row,
        state: "added",
        registration: { id: registration.id, status: registration.status },
        error: null,
      });
    } catch (error) {
      let existing = null;
      // Only expose existing registration details while still authorized.
      try {
        await assertCapability(actor, "manage_registrations", slug);
        existing = await existingRegistration(slug, row.osuId);
      } catch {
        /* Preserve the original per-row failure. */
      }
      results.push({
        line: row.line,
        osuId: row.osuId,
        state: existing ? "skipped" : "failed",
        registration: existing,
        error: existing
          ? null
          : error instanceof HttpError
            ? error.message
            : "This request could not be completed. Please try again.",
      });
    }
  }
  return {
    results,
    counts: {
      added: results.filter((r) => r.state === "added").length,
      skipped: results.filter((r) => r.state === "skipped").length,
      failed: results.filter((r) => r.state === "failed").length,
    },
  };
}
