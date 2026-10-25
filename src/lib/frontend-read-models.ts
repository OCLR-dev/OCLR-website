import { frontendResource, assertRemoteSubject } from "./frontend-resource";
import { remoteMode } from "./data-source";
import { db } from "@/db";
import { desc, inArray, sql } from "drizzle-orm";
import { userProfileCache } from "@/db/schema";
import type { User } from "./auth/sessions";
import { readTournament } from "./tournaments";
import { captainSetup } from "./captains";
import { publicNewsContext } from "./public-news";
import { createTranslator } from "next-intl";
import { appTranslator } from "@/i18n/translate";
import en from "../../messages/en.json" with { type: "json" };
import hans from "../../messages/zh-Hans.json" with { type: "json" };
import hant from "../../messages/zh-Hant.json" with { type: "json" };
import { z } from "zod";
async function databasePublicEnrollment(slug: string) {
  return readTournament(slug, db(), true);
}
export async function publicEnrollment(
  slug: string,
): Promise<Awaited<ReturnType<typeof databasePublicEnrollment>>> {
  if (remoteMode()) {
    return frontendResource<
      Awaited<ReturnType<typeof databasePublicEnrollment>>
    >("publicEnrollment", { slug });
  }
  return databasePublicEnrollment(slug);
}

async function databasePrivateSavedTournament(slug: string) {
  const record = await readTournament(slug);
  if (!record)
    throw new (await import("./http")).HttpError(404, "Tournament not found.");
  return record;
}
export async function privateSavedTournament(
  slug: string,
): Promise<Awaited<ReturnType<typeof databasePrivateSavedTournament>>> {
  if (remoteMode()) {
    return frontendResource<
      Awaited<ReturnType<typeof databasePrivateSavedTournament>>
    >("privateSavedTournament", { slug });
  }
  return databasePrivateSavedTournament(slug);
}

async function databasePublicNewsModel(locale: string) {
  const selected = z.enum(["zh-Hans", "zh-Hant", "en"]).parse(locale);
  const messages =
    selected === "zh-Hans" ? hans : selected === "zh-Hant" ? hant : en;
  const t = createTranslator({ locale: selected, messages: messages.ui });
  return publicNewsContext(
    undefined,
    appTranslator(
      (key, values) => t(key as keyof typeof messages.ui, values),
      selected,
    ),
  );
}
export async function publicNewsModel(
  locale: string,
): Promise<Awaited<ReturnType<typeof databasePublicNewsModel>>> {
  if (remoteMode()) {
    return frontendResource<
      Awaited<ReturnType<typeof databasePublicNewsModel>>
    >("publicNewsModel", { locale });
  }
  return databasePublicNewsModel(locale);
}

async function databaseCaptainIdentities(actor: User, slug: string) {
  const setup = await captainSetup(actor, slug);
  const ids = [
    ...new Set([...setup.captains, ...setup.pool].map((p) => p.userId)),
  ];
  const cached = ids.length
    ? await db()
        .select({
          osuId: userProfileCache.osuId,
          profile: userProfileCache.profile,
        })
        .from(userProfileCache)
        .where(
          sql`${inArray(userProfileCache.osuId, ids)} AND ${userProfileCache.errorStatus} IS DISTINCT FROM 404`,
        )
        .orderBy(desc(userProfileCache.attemptedAt))
    : [];
  const identities: Record<
    number,
    {
      avatarUrl: string | null;
      countryCode: string | null;
      countryName: string | null;
    }
  > = {};
  for (const row of cached)
    if (row.profile && !identities[row.osuId])
      identities[row.osuId] = {
        avatarUrl: row.profile.avatarUrl,
        countryCode: row.profile.countryCode,
        countryName: row.profile.countryName,
      };
  return identities;
}
export async function captainIdentities(
  actor: User,
  slug: string,
): Promise<Awaited<ReturnType<typeof databaseCaptainIdentities>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<
      Awaited<ReturnType<typeof databaseCaptainIdentities>>
    >("captainIdentities", { slug });
  }
  return databaseCaptainIdentities(actor, slug);
}

async function databasePublicEnrollmentState(slug: string) {
  const edition = await (await import("./content")).getPublicEdition(slug);
  if (!edition)
    throw new (await import("./http")).HttpError(404, "Tournament not found.");
  return (await import("./registrations")).registrationAvailability(edition);
}
export async function publicEnrollmentState(
  slug: string,
): Promise<Awaited<ReturnType<typeof databasePublicEnrollmentState>>> {
  if (remoteMode()) {
    return frontendResource<
      Awaited<ReturnType<typeof databasePublicEnrollmentState>>
    >("publicEnrollmentState", { slug });
  }
  return databasePublicEnrollmentState(slug);
}

async function databaseOwnSavedProfile(
  actor: User,
  mode: import("./osu-profile-model").ProfileMode,
) {
  return (await import("./osu-profiles")).cachedOsuUserProfile(
    actor.osuId,
    mode,
  );
}
export async function ownSavedProfile(
  actor: User,
  mode: import("./osu-profile-model").ProfileMode,
): Promise<Awaited<ReturnType<typeof databaseOwnSavedProfile>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<
      Awaited<ReturnType<typeof databaseOwnSavedProfile>>
    >("ownSavedProfile", { mode });
  }
  return databaseOwnSavedProfile(actor, mode);
}

async function databaseOwnEligibility(actor: User, slug: string) {
  const record = await databasePublicEnrollment(slug);
  if (!record)
    throw new (await import("./http")).HttpError(404, "Tournament not found.");
  const { evaluateEligibility, hasEligibilityLimits, noEligibilityLimits } =
    await import("./eligibility-model");
  const limits = record.edition.automaticEligibility ?? noEligibilityLimits;
  if (!hasEligibilityLimits(limits)) return null;
  const snapshot = await (
    await import("./osu-profiles")
  ).cachedOsuUserProfile(actor.osuId, "osu");
  return evaluateEligibility(actor.osuId, record.revision, limits, snapshot);
}
export async function ownEligibility(
  actor: User,
  slug: string,
): Promise<Awaited<ReturnType<typeof databaseOwnEligibility>>> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<Awaited<ReturnType<typeof databaseOwnEligibility>>>(
      "ownEligibility",
      { slug },
    );
  }
  return databaseOwnEligibility(actor, slug);
}
/** The anonymous configuration projection never releases application questions or staff eligibility settings. */
export async function publicConfigurationModel(slug: string) {
  const record = await databasePublicEnrollment(slug);
  if (!record)
    throw new (await import("./http")).HttpError(404, "Tournament not found.");
  const {
    slug: editionSlug,
    name,
    season,
    branding,
    defaultAppearance,
    published,
    status,
    summary,
    timeZone,
    archive,
    rules,
    eligibility,
    schedule,
  } = record.edition;
  const registration = record.edition.registration;
  return {
    ...record,
    edition: {
      slug: editionSlug,
      name,
      season,
      branding,
      defaultAppearance,
      published,
      status,
      summary,
      timeZone,
      archive,
      rules,
      eligibility,
      schedule,
      registration: registration
        ? {
            enabled: registration.enabled,
            opensAt: registration.opensAt,
            closesAt: registration.closesAt,
            withdrawUntil: registration.withdrawUntil,
            questions: [] as [],
          }
        : null,
    },
  };
}
export async function ownRegistrationForm(actor: User, slug: string) {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<
      Awaited<ReturnType<typeof databaseOwnRegistrationForm>>
    >("ownRegistrationForm", { slug });
  }
  return databaseOwnRegistrationForm(actor, slug);
}
async function databaseOwnRegistrationForm(actor: User, slug: string) {
  void actor; // The authenticated subject is injected by the route, never selected by a query argument.
  const record = await databasePublicEnrollment(slug);
  if (!record)
    throw new (await import("./http")).HttpError(404, "Tournament not found.");
  return (await (
    await import("./registrations")
  ).registrationAvailability(record.edition)) === "open"
    ? record
    : publicConfigurationModel(slug);
}
