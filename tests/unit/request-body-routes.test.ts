import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "../../src/app/api/tournaments/[edition]/registrations/route";
import { POST as configureDraft } from "../../src/app/api/admin/tournaments/[edition]/draft/route";
import { requireUser } from "../../src/lib/auth/user";
import { requireStaff } from "../../src/lib/auth/staff";
import {
  submitRegistration,
  validateApplication,
} from "../../src/lib/registrations";
import { draftCommand } from "../../src/lib/draft";
import { HttpError, readJson } from "../../src/lib/http";
import { turnSequenceStructureProblem } from "../../src/lib/draft-order";
import {
  draftCommandBodyLimit,
  registrationBodyLimit,
} from "../../src/lib/request-body-limits";
import {
  escapedJson,
  maximumApplication,
  maximumDraftInput,
  syntheticTeamIds,
} from "../fixtures/request-body";

vi.mock("../../src/lib/auth/user", () => ({ requireUser: vi.fn() }));
vi.mock("../../src/lib/auth/staff", () => ({ requireStaff: vi.fn() }));
vi.mock("../../src/lib/registrations", async (original) => ({
  ...(await original<typeof import("../../src/lib/registrations")>()),
  submitRegistration: vi.fn(),
}));
vi.mock("../../src/lib/draft", () => ({
  draftCommand: vi.fn(),
  staffDraft: vi.fn(),
}));

const actor = { osuId: 443001, username: "Synthetic body-budget tester" };
const context = { params: Promise.resolve({ edition: "test-cup" }) };
const minimalApplication = maximumApplication("x");
const minimalDraft = {
  expectedVersion: 0,
  confirmed: true,
  command: { action: "pause" },
};
function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://oclr.example.test/api/test", {
    method: "POST",
    headers: {
      origin: "https://oclr.example.test",
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}
function paddedJson(input: unknown, bytes: number) {
  const body = JSON.stringify(input);
  return body + " ".repeat(bytes - Buffer.byteLength(body));
}
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://oclr.example.test");
  vi.mocked(requireUser).mockResolvedValue(actor);
  vi.mocked(requireStaff).mockResolvedValue(actor);
  vi.mocked(submitRegistration).mockResolvedValue({
    id: "synthetic",
    status: "pending",
  } as Awaited<ReturnType<typeof submitRegistration>>);
  vi.mocked(draftCommand).mockResolvedValue(
    {} as Awaited<ReturnType<typeof draftCommand>>,
  );
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("registration HTTP budget", () => {
  it.each(["x", "測", "\u0000", "\ud800", '"'])(
    "passes all 16 maximum-length %j answers to business validation",
    async (character) => {
      const { configuration, input } = maximumApplication(
        character.repeat(2000),
      );
      vi.mocked(submitRegistration).mockImplementationOnce(
        async (_user, _slug, body) => {
          expect(validateApplication(configuration, body, 0).answers).toEqual(
            input.answers,
          );
          return { id: "synthetic", status: "pending" } as Awaited<
            ReturnType<typeof submitRegistration>
          >;
        },
      );
      const body = JSON.stringify(input);
      expect(Buffer.byteLength(body)).toBeGreaterThan(32768);
      const response = await register(request(body), context);
      expect(response.status).toBe(201);
      expect(submitRegistration).toHaveBeenCalledWith(actor, "test-cup", input);
    },
  );
  it("accepts fully escaped maximum answers, IDs, rules version and reapplication envelope", async () => {
    const { configuration, input } = maximumApplication("測".repeat(2000));
    const body = escapedJson(input);
    expect(Buffer.byteLength(body)).toBeGreaterThan(192000);
    expect(Buffer.byteLength(body)).toBeLessThan(registrationBodyLimit);
    expect(
      validateApplication(configuration, JSON.parse(body), 0).answers,
    ).toEqual(input.answers);
    expect((await register(request(body), context)).status).toBe(201);
    expect(submitRegistration).toHaveBeenCalledWith(actor, "test-cup", input);
  });
  it("retains field errors for overlong answers within the HTTP budget", async () => {
    const { configuration, input } = maximumApplication("測".repeat(2001));
    vi.mocked(submitRegistration).mockImplementationOnce(
      async (_user, _slug, body) => {
        validateApplication(configuration, body, 0);
        throw new Error("Invalid application was accepted");
      },
    );
    const response = await register(request(JSON.stringify(input)), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      field: configuration.registration!.questions[0].id,
    });
  });
});

describe("draft HTTP budget", () => {
  it.each([JSON.stringify, escapedJson])(
    "passes the maximum 4,096 UUID sequence to the command service (%#)",
    async (serialize) => {
      const input = maximumDraftInput();
      expect(
        turnSequenceStructureProblem(
          input.command.turnSequence,
          syntheticTeamIds.map((id) => ({ id })),
        ),
      ).toBeNull();
      const body = serialize(input);
      expect(Buffer.byteLength(body)).toBeGreaterThan(32768);
      expect(Buffer.byteLength(body)).toBeLessThan(draftCommandBodyLimit);
      expect((await configureDraft(request(body), context)).status).toBe(200);
      expect(draftCommand).toHaveBeenCalledWith(actor, "test-cup", input);
    },
  );
});

for (const endpoint of [
  {
    name: "registration",
    post: register,
    limit: registrationBodyLimit,
    input: minimalApplication.input,
    service: submitRegistration,
    auth: requireUser,
    success: 201,
  },
  {
    name: "draft",
    post: configureDraft,
    limit: draftCommandBodyLimit,
    input: minimalDraft,
    service: draftCommand,
    auth: requireStaff,
    success: 200,
  },
]) {
  describe(`${endpoint.name} HTTP boundary`, () => {
    it("accepts exactly the byte budget", async () => {
      const body = paddedJson(endpoint.input, endpoint.limit);
      expect(Buffer.byteLength(body)).toBe(endpoint.limit);
      const response = await endpoint.post(request(body), context);
      expect(response.status).toBe(endpoint.success);
      expect(response.headers.get("cache-control")).toBe("no-store");
    });
    it.each<Record<string, string>>([{}, { "content-length": "1" }])(
      "cancels an oversized chunked stream regardless of Content-Length (%j)",
      async (headers) => {
        const cancel = vi.fn();
        const body = paddedJson(endpoint.input, endpoint.limit);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
            controller.enqueue(new TextEncoder().encode(" "));
          },
          cancel,
        });
        const init: RequestInit & { duplex: "half" } = {
          method: "POST",
          headers: {
            origin: "https://oclr.example.test",
            "content-type": "application/json",
            ...headers,
          },
          body: stream,
          duplex: "half",
        };
        const response = await endpoint.post(
          new Request("https://oclr.example.test/api/test", init),
          context,
        );
        expect(response.status).toBe(413);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(cancel).toHaveBeenCalledOnce();
        expect(endpoint.service).not.toHaveBeenCalled();
      },
    );
    it("keeps origin and authentication checks ahead of parsing", async () => {
      expect(
        (
          await endpoint.post(
            request("{bad", { origin: "https://attacker.test" }),
            context,
          )
        ).status,
      ).toBe(403);
      expect(endpoint.auth).not.toHaveBeenCalled();
      vi.mocked(endpoint.auth).mockRejectedValueOnce(
        new HttpError(401, "Sign in"),
      );
      expect((await endpoint.post(request("{bad"), context)).status).toBe(401);
      expect(endpoint.service).not.toHaveBeenCalled();
    });
    it("retains malformed JSON and media-type errors", async () => {
      expect((await endpoint.post(request("{bad"), context)).status).toBe(400);
      expect(
        (
          await endpoint.post(
            request("{}", { "content-type": "text/plain" }),
            context,
          )
        ).status,
      ).toBe(415);
      expect(endpoint.service).not.toHaveBeenCalled();
    });
  });
}

it("keeps the general reader limited to 32 KiB", async () => {
  await expect(
    readJson(request(JSON.stringify("x".repeat(32767)))),
  ).rejects.toMatchObject({ status: 413 });
});
