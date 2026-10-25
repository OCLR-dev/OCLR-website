import { english } from "../../src/i18n/translate";
vi.mock("../../src/i18n/server", () => ({
  getAppTranslations: async () => english,
}));
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Privacy from "../../src/app/privacy/page";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import {
  authReady,
  oauthConfig,
  privacyContact,
  privacyReady,
} from "../../src/lib/auth/config";

describe("explicit osu! privacy contact", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.stubEnv("APP_URL", "https://oclr.example.test");
    vi.stubEnv("DATABASE_URL", "postgres://synthetic-test-only");
    vi.stubEnv("OSU_CLIENT_ID", "123");
    vi.stubEnv("OSU_CLIENT_SECRET", "PRIVATE_SYNTHETIC_CREDENTIAL");
    vi.stubEnv("ADMIN_OSU_IDS", "70001,80001");
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", "60001");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const html = async () =>
    renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        {await Privacy()}
      </NextIntlClientProvider>,
    );
  it("needs only a valid designated privacy contact and the existing OAuth settings", async () => {
    expect(privacyReady()).toBe(true);
    expect(authReady()).toBe(true);
    expect(oauthConfig().redirectUri).toBe(
      "https://oclr.example.test/auth/osu/callback",
    );
    const page = await html();
    expect(
      page.match(/href="https:\/\/osu.ppy.sh\/users\/60001"/g),
    ).toHaveLength(1);
    expect(page).toContain("For access, correction or deletion requests:");
    expect(page).toContain("Contact OCLR Admin on osu!");
    expect(page).not.toContain("<details");
    expect(page).not.toContain("Data retention policy");
    for (const privateValue of [
      "mailto:",
      "70001",
      "80001",
      "PRIVATE_SYNTHETIC_CREDENTIAL",
    ])
      expect(page).not.toContain(privateValue);
  });
  it.each([
    undefined,
    "",
    " ",
    "0",
    "-1",
    "+1",
    "001",
    "1.2",
    "1e3",
    "60001,70001",
    "https://osu.ppy.sh/users/60001",
    "9007199254740992",
    "<script>",
  ])("fails closed for invalid or missing explicit ID %s", async (value) => {
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", value);
    expect(privacyContact()).toBeNull();
    expect(privacyReady()).toBe(false);
    expect(authReady()).toBe(false);
    expect(() => oauthConfig()).toThrow(/not configured/);
    const page = await html();
    expect(page).toContain("Public contact details have not been announced.");
    expect(page).not.toContain("https://osu.ppy.sh/users/");
    expect(page).not.toContain("mailto:");
  });
  it.each(["APP_URL", "DATABASE_URL", "OSU_CLIENT_ID", "OSU_CLIENT_SECRET"])(
    "still requires %s for OAuth",
    (key) => {
      vi.stubEnv(key, "");
      expect(privacyReady()).toBe(true);
      expect(authReady()).toBe(false);
      expect(() => oauthConfig()).toThrow(/not configured/);
    },
  );
  it("accepts one trimmed safe integer without deriving identity or granting staff access", () => {
    vi.stubEnv("PRIVACY_CONTACT_OSU_ID", ` ${Number.MAX_SAFE_INTEGER} `);
    expect(privacyContact()?.url).toBe(
      `https://osu.ppy.sh/users/${Number.MAX_SAFE_INTEGER}`,
    );
    expect(process.env.ADMIN_OSU_IDS).toBe("70001,80001");
  });
});
