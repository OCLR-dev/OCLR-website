import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HttpError } from "../../src/lib/http-error";
const fake = vi.hoisted(() => ({ loggedIn: false }));
vi.mock("@/lib/auth/user", () => ({
  requireBrowserSession: async () => {
    if (!fake.loggedIn) throw new HttpError(401, "Sign in");
    return { osuId: 123 };
  },
}));
vi.mock("@/lib/streaming-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/streaming-api")>();
  return {
    ...actual,
    listStreamingTokens: async () => ({
      tokens: [],
      backend: "https://oclr.example.test",
      origins: actual.streamingOrigins(),
    }),
  };
});
vi.mock("@/i18n/server", () => ({
  getAppTranslations: async () => (message: string) => message,
}));
vi.mock("@/i18n/shared", () => ({
  useAppTranslations: () => (message: string) => message,
}));
vi.mock("@/components/ui", () => ({
  PageHeading: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import Page from "../../src/app/streaming/[edition]/connect/page";
import AccessPage from "../../src/app/streaming/[edition]/page";

beforeEach(() => {
  fake.loggedIn = false;
  vi.stubEnv("OCLR_STREAMING_ORIGINS", undefined);
});
afterEach(() => vi.unstubAllEnvs());
const props = (origin: string) => ({
  params: Promise.resolve({ edition: "s11" }),
  searchParams: Promise.resolve({ origin, state: "x".repeat(43) }),
});
describe("custom-port connection pages (synthetic session)", () => {
  it("preserves the custom address across login, consent and the manual fallback", async () => {
    const origin = "http://127.0.0.1:3011";
    const login = renderToStaticMarkup(await Page(props(origin)));
    expect(login).toContain("Continue with osu!");
    expect(login).toContain(encodeURIComponent(encodeURIComponent(origin)));
    fake.loggedIn = true;
    const consent = renderToStaticMarkup(await Page(props(origin)));
    expect(consent).toContain("Authorize and connect Overlay");
    expect(consent).toContain(
      `/streaming/s11?origin=${encodeURIComponent(origin)}`,
    );
    const manual = renderToStaticMarkup(await AccessPage(props(origin)));
    expect(manual).toContain('type="url"');
    expect(manual).toContain(`value="${origin}"`);
    vi.stubEnv("OCLR_STREAMING_ORIGINS", "http://localhost:3011");
    const restricted = renderToStaticMarkup(await AccessPage(props(origin)));
    expect(restricted).toContain(`<option value="${origin}" selected="">`);
    expect(renderToStaticMarkup(await Page(props(origin)))).toContain(
      "Authorize and connect Overlay",
    );
  });
  it("explains an administrator-denied local address without offering authorization", async () => {
    vi.stubEnv("OCLR_STREAMING_ORIGINS", "http://localhost:3001");
    const denied = renderToStaticMarkup(
      await Page(props("http://localhost:3011")),
    );
    expect(denied).toContain("Ask the website administrator");
    expect(denied).not.toContain("Authorize and connect Overlay");
    expect(denied).not.toContain("Continue with osu!");
  });
  it("keeps malformed or external connection requests unavailable", async () => {
    await expect(
      Page(props("http://localhost.evil.example:3011")),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      Page({
        ...props("http://localhost:3011"),
        searchParams: Promise.resolve({
          origin: "http://localhost:3011",
          state: "short",
        }),
      }),
    ).rejects.toThrow("NOT_FOUND");
  });
});
