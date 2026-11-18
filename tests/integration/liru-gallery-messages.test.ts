import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { asc, sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db";
import {
  liruGalleryMessageEvents,
  liruGalleryMessages,
  users,
} from "../../src/db/schema";
import { GET, POST } from "../../src/app/api/wiki/liru-gallery/messages/route";
import {
  DELETE,
  PATCH,
} from "../../src/app/api/wiki/liru-gallery/messages/[messageId]/route";
import { requireUser } from "../../src/lib/auth/user";
import {
  changeLiruGalleryMessage,
  postLiruGalleryMessage,
} from "../../src/lib/liru-gallery-messages";
import { HttpError } from "../../src/lib/http-error";
import { withReadChannel } from "../../src/lib/read-channel";
import { assertTestDatabase } from "../database";

vi.mock("../../src/lib/auth/user", () => ({ requireUser: vi.fn() }));

const url = process.env.TEST_DATABASE_URL;
const origin = "https://oclr.example.test";
const author = { osuId: 321001, username: "Gallery Author" };
const other = { osuId: 321002, username: "Other Visitor" };
const endpoint = `${origin}/api/wiki/liru-gallery/messages`;
function request(
  method: "POST" | "PATCH" | "DELETE",
  input: unknown,
  messageId?: string,
  requestOrigin = origin,
) {
  return new Request(messageId ? `${endpoint}/${messageId}` : endpoint, {
    method,
    headers: { origin: requestOrigin, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

describe.skipIf(!url)("Liru gallery messages", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("APP_URL", origin);
  });
  beforeEach(async () => {
    await db().execute(
      sql`TRUNCATE liru_gallery_message_events, liru_gallery_messages, users CASCADE`,
    );
    await db().insert(users).values([author, other]);
    vi.mocked(requireUser).mockReset().mockResolvedValue(author);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("exposes signed public messages and checks origin, author and version for writes", async () => {
    const input = { requestId: randomUUID(), text: "  Lovely outfit!  " };
    expect(
      (await POST(request("POST", input, undefined, "https://elsewhere.test")))
        .status,
    ).toBe(403);
    vi.mocked(requireUser).mockRejectedValueOnce(
      new HttpError(401, "Sign in with osu! to continue."),
    );
    expect((await POST(request("POST", input))).status).toBe(401);
    expect(await (await GET()).json()).toEqual([]);

    const response = await POST(request("POST", input));
    expect(response.status).toBe(201);
    const posted = await response.json();
    const { id, version } = posted;
    expect(posted).toMatchObject({
      authorId: author.osuId,
      author: author.username,
      text: "Lovely outfit!",
    });
    expect(await (await POST(request("POST", input))).json()).toEqual(posted);
    expect(await (await GET()).json()).toEqual([posted]);

    const context = { params: Promise.resolve({ messageId: id }) };
    const edit = { version, text: "Updated comment" };
    vi.mocked(requireUser).mockResolvedValueOnce(other);
    expect((await PATCH(request("PATCH", edit, id), context)).status).toBe(404);
    const updated = await (
      await PATCH(request("PATCH", edit, id), context)
    ).json();
    expect(updated).toMatchObject({
      id,
      text: edit.text,
      createdAt: posted.createdAt,
    });
    expect(updated.version).not.toBe(version);
    expect(
      (await DELETE(request("DELETE", { version }, id), context)).status,
    ).toBe(409);
    expect(
      (
        await DELETE(
          request("DELETE", { version: updated.version }, id),
          context,
        )
      ).status,
    ).toBe(200);
    expect(await (await GET()).json()).toEqual([]);
    expect((await POST(request("POST", input))).status).toBe(409);
    const events = await db()
      .select({
        kind: liruGalleryMessageEvents.kind,
        messageId: liruGalleryMessageEvents.messageId,
      })
      .from(liruGalleryMessageEvents)
      .orderBy(asc(liruGalleryMessageEvents.createdAt));
    expect(events).toEqual(
      ["posted", "edited", "deleted"].map((kind) => ({ kind, messageId: id })),
    );
  });

  it("returns the complete gallery history with the newest messages first", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      authorId: author.osuId,
      body: `Gallery comment ${index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    }));
    await db().insert(liruGalleryMessages).values(rows);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(
      (await response.json()).map((message: { text: string }) => message.text),
    ).toEqual(rows.map((row) => row.body).reverse());
  });

  it("serializes duplicate posts and enforces the author limit after deletion", async () => {
    const input = { text: "Concurrent comment", requestId: randomUUID() };
    const [first, replay] = await Promise.all([
      postLiruGalleryMessage(author, input),
      postLiruGalleryMessage(author, input),
    ]);
    expect(replay.id).toBe(first.id);
    await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        postLiruGalleryMessage(author, {
          text: String(i),
          requestId: randomUUID(),
        }),
      ),
    );
    await changeLiruGalleryMessage(author, first.id, "delete", {
      version: first.version,
    });
    const later = { text: "Another comment", requestId: randomUUID() };
    await expect(postLiruGalleryMessage(author, later)).rejects.toMatchObject({
      status: 429,
    });
    await expect(
      withReadChannel(() => postLiruGalleryMessage(other, later)),
    ).rejects.toMatchObject({ status: 403 });
    await expect(postLiruGalleryMessage(other, later)).resolves.toMatchObject({
      authorId: other.osuId,
    });
  });
});
