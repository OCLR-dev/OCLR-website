// Existing workflow regressions explicitly exercise English; locale-specific
// tests override this non-authentication preference independently.
export const englishStorage = {
  cookies: [
    {
      name: "oclr-locale",
      value: "en",
      domain: "127.0.0.1",
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    },
  ],
  origins: [],
};

/** Only automatic, non-authentication preferences are allowed for guests. */
export function isAutomaticPreferenceCookie(cookie: {
  name: string;
  value: string;
}) {
  return (
    (cookie.name === "oclr-locale" &&
      ["zh-Hans", "zh-Hant", "en"].includes(cookie.value)) ||
    (cookie.name === "oclr-system-theme" &&
      ["light", "dark"].includes(cookie.value))
  );
}
