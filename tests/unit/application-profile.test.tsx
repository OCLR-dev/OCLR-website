import { requireStaff } from "../../src/lib/auth/staff-request";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Application from "../../src/app/admin/tournaments/[edition]/registrations/[id]/page";
import {
  isDeveloper,
  hasCapability,
} from "../../src/lib/auth/staff";
import { applicationDetails } from "../../src/lib/staff";
import { readTournament } from "../../src/lib/tournaments";
import {
  getOsuUserProfile,
  cachedOsuUserProfile,
} from "../../src/lib/osu-profiles";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import {
  evaluateEligibility,
  noEligibilityLimits,
} from "../../src/lib/eligibility-model";
import { HttpError } from "../../src/lib/http";
import { english } from "../../src/i18n/translate";
import { edition } from "../fixtures/edition";
import { profileResponse } from "../fixtures/osu-profile";
import messages from "../../messages/en.json";
vi.mock("../../src/i18n/server", () => ({
  getAppTranslations: async () => english,
}));
vi.mock("../../src/lib/auth/staff-request", () => ({ requireStaff: vi.fn() }));
vi.mock("../../src/lib/auth/staff", () => ({
  staffAccess: vi.fn(async () => [{ role: "admin", editionSlug: null }]),
  isDeveloper: vi.fn(() => false),
  hasCapability: vi.fn(async () => true),
}));
vi.mock("../../src/lib/staff", () => ({ applicationDetails: vi.fn() }));
vi.mock("../../src/lib/tournaments", () => ({ readTournament: vi.fn() }));
vi.mock("../../src/lib/osu-profiles", () => ({
  getOsuUserProfile: vi.fn(),
  cachedOsuUserProfile: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: () => {
    throw new Error("LOGIN");
  },
}));
vi.mock("../../src/components/bws-review", () => ({ BwsReview: () => null }));
vi.mock("../../src/components/review-form", () => ({ ReviewForm: () => null }));
vi.mock("../../src/components/registration-removal", () => ({
  RegistrationRemoval: () => null,
}));
const id = "22154dfa-2a73-44ec-a519-dd04e409a888",
  userId = profileResponse.id;
const fetchedAt = "2026-10-23T00:00:00Z";
const profile = () =>
  normalizeOsuProfile(profileResponse, userId, "osu", fetchedAt);
function details(): Awaited<ReturnType<typeof applicationDetails>> {
  return {
    registration: {
      id,
      userId,
      editionSlug: edition.slug,
      status: "pending",
      source: "player",
      rulesVersion: null,
      eligibilityAcknowledged: null,
      eligibilityVerification: null,
      configurationVersion: 0,
      answers: {},
      attempt: 1,
      statusReason: null,
      draftUnavailableReason: null,
      createdAt: new Date(fetchedAt),
      updatedAt: new Date(fetchedAt),
    },
    lastOperation: null,
    username: "Synthetic Applicant",
    acknowledgedConfiguration: null,
    attempts: [],
  };
}
async function html(slug = edition.slug) {
  const page = await Application({
    params: Promise.resolve({ edition: slug, id }),
  });
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {page}
    </NextIntlClientProvider>,
  );
}
describe("authorized applicant profile summary", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.mocked(requireStaff).mockResolvedValue({
      osuId: 60001,
      username: "Synthetic Admin",
    });
    vi.mocked(applicationDetails).mockResolvedValue(details());
    vi.mocked(readTournament).mockResolvedValue({
      edition: { ...edition, automaticEligibility: null },
      revision: 0,
      createdAt: new Date(fetchedAt),
      updatedAt: new Date(fetchedAt),
      registrationPaused: false,
    });
    vi.mocked(getOsuUserProfile).mockResolvedValue({
      profile: profile(),
      stale: false,
      notice: null,
    });
  });
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });
  it.each(["pending", "accepted", "rejected", "withdrawn"] as const)(
    "shows osu!standard rank and PP for %s applications without eligibility limits",
    async (status) => {
      const data = details();
      data.registration.status = status;
      data.registration.source = "staff";
      vi.mocked(applicationDetails).mockResolvedValue(data);
      const page = await html();
      expect(getOsuUserProfile).toHaveBeenCalledExactlyOnceWith(userId, "osu");
      expect(page).toContain("osu!standard");
      expect(page).toContain("#12,345");
      expect(page).toContain("1,234.56");
      expect(page).not.toContain('class="eligibility-summary');
      expect(page.indexOf('class="application-profile-summary"')).toBeLessThan(
        page.indexOf('class="panel"'),
      );
    },
  );
  it.each([
    [null, 1234.56],
    [12345, null],
    [0, null],
  ] as const)(
    "keeps missing values independent (%s / %s)",
    async (rank, pp) => {
      const p = profile();
      p.statistics.globalRank = rank;
      p.statistics.pp = pp;
      vi.mocked(getOsuUserProfile).mockResolvedValue({
        profile: p,
        stale: false,
        notice: null,
      });
      const page = await html();
      expect(page).toContain("Unavailable");
      expect(page).not.toContain("#0");
      if (pp !== null) expect(page).toContain("1,234.56");
      if (rank && rank > 0) expect(page).toContain("#12,345");
    },
  );
  it.each([404, 429, 503])(
    "preserves review content when the profile service fails (%s)",
    async (status) => {
      vi.mocked(getOsuUserProfile).mockRejectedValue(
        new HttpError(status, "PRIVATE_PROVIDER_BODY"),
      );
      const page = await html();
      expect(page.match(/Unavailable/g)).toHaveLength(2);
      expect(page).toContain("Submitted");
      expect(page).toContain("Registration source");
      expect(page).not.toContain("PRIVATE_PROVIDER_BODY");
    },
  );
  it("labels the dated stale snapshot separately from the saved eligibility record", async () => {
    const p = profile(),
      historical = profile();
    historical.statistics.globalRank = 54321;
    historical.statistics.pp = 9000;
    const saved = evaluateEligibility(
      userId,
      0,
      noEligibilityLimits,
      { profile: historical, stale: false, notice: null },
      Date.parse(fetchedAt),
    );
    const data = details();
    data.registration.eligibilityVerification = saved;
    vi.mocked(applicationDetails).mockResolvedValue(data);
    vi.mocked(getOsuUserProfile).mockResolvedValue({
      profile: p,
      stale: true,
      notice: "Synthetic outage",
    });
    const page = await html();
    expect(page).toContain("SAVED SNAPSHOT");
    expect(page).toContain("23 Oct 2026");
    expect(page).toContain("#12,345");
    expect(page).toContain("54321");
    expect(data.registration.eligibilityVerification).toEqual(saved);
  });
  it("renders saved Developer evidence without refreshing provider profiles", async () => {
    vi.mocked(isDeveloper).mockReturnValueOnce(true);
    vi.mocked(hasCapability).mockResolvedValueOnce(false);
    vi.mocked(cachedOsuUserProfile).mockResolvedValueOnce({
      profile: profile(),
      stale: true,
      notice: null,
    });
    const page = await html();
    expect(page).toContain("#12,345");
    expect(cachedOsuUserProfile).toHaveBeenCalledWith(userId, "osu");
    expect(getOsuUserProfile).not.toHaveBeenCalled();
  });
  it.each([401, 403])(
    "does not request stats when staff authorization fails (%s)",
    async (status) => {
      vi.mocked(requireStaff).mockRejectedValue(
        new HttpError(status, "Forbidden"),
      );
      await expect(html()).rejects.toThrow(
        status === 401 ? "LOGIN" : "NOT_FOUND",
      );
      expect(getOsuUserProfile).not.toHaveBeenCalled();
    },
  );
  it("does not fetch stats for a forbidden edition or mismatched URL", async () => {
    vi.mocked(applicationDetails).mockRejectedValueOnce(
      new HttpError(403, "Forbidden edition"),
    );
    await expect(html()).rejects.toThrow("NOT_FOUND");
    await expect(html("different-edition")).rejects.toThrow("NOT_FOUND");
    expect(getOsuUserProfile).not.toHaveBeenCalled();
  });
});
