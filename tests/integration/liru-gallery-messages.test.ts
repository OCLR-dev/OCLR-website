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
import { asc, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db";
import {
  editionRevisions,
  editionState,
  liruDailyGacha,
  liruGalleryMessageEvents,
  liruGalleryMessages,
  registrations,
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
import { publicLiruCollectionAuthors } from "../../src/lib/liru-collection";
import { liruGallery } from "../../src/lib/wiki-articles";
import { english } from "../../src/i18n/translate";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";

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

  it("threads a signed reply and preserves it when its parent is deleted", async () => {
    const parent = await (
      await POST(
        request("POST", { requestId: randomUUID(), text: "First message" }),
      )
    ).json();
    expect(parent).not.toHaveProperty("parentId");

    vi.mocked(requireUser).mockResolvedValue(other);
    const input = {
      requestId: randomUUID(),
      text: "A reply",
      parentId: parent.id,
    };
    const response = await POST(request("POST", input));
    expect(response.status).toBe(201);
    const reply = await response.json();
    expect(reply).toMatchObject({ parentId: parent.id, authorId: other.osuId });
    expect(await (await POST(request("POST", input))).json()).toEqual(reply);
    expect(
      (await POST(request("POST", { ...input, parentId: undefined }))).status,
    ).toBe(409);
    expect(
      (
        await POST(
          request("POST", {
            ...input,
            requestId: randomUUID(),
            parentId: reply.id,
          }),
        )
      ).status,
    ).toBe(404);
    expect(await (await GET()).json()).toEqual([reply, parent]);

    vi.mocked(requireUser).mockResolvedValue(author);
    expect(
      (
        await DELETE(request("DELETE", { version: reply.version }, reply.id), {
          params: Promise.resolve({ messageId: reply.id }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await DELETE(
          request("DELETE", { version: parent.version }, parent.id),
          {
            params: Promise.resolve({ messageId: parent.id }),
          },
        )
      ).status,
    ).toBe(200);

    const [preserved] = await (await GET()).json();
    expect(preserved).toMatchObject({
      id: reply.id,
      authorId: other.osuId,
      text: "A reply",
    });
    expect(preserved).not.toHaveProperty("parentId");
    vi.mocked(requireUser).mockResolvedValue(other);
    expect(await (await POST(request("POST", input))).json()).toEqual(
      preserved,
    );
    expect(
      (await POST(request("POST", { ...input, requestId: randomUUID() })))
        .status,
    ).toBe(404);
  });

  it("links collections only for authors with public profiles and matching cards", async () => {
    const slug = "liru-collections-test";
    const empty = { osuId: 321003, username: "Empty Collection" };
    await db().insert(users).values(empty);
    await seedEditions([{ ...edition, slug }]);
    try {
      await db()
        .insert(registrations)
        .values(
          [author, empty].map(({ osuId }) => ({
            userId: osuId,
            editionSlug: slug,
            status: "accepted" as const,
            answers: {},
          })),
        );
      await db()
        .insert(liruGalleryMessages)
        .values(
          [author, other, empty].map(({ osuId }) => ({
            authorId: osuId,
            body: "Hello",
          })),
        );
      const figures = liruGallery(english).gallery;
      const { src, rarity } = figures.find((figure) => figure.rarity === "UR")!;
      await db()
        .insert(liruDailyGacha)
        .values(
          [author, other].map(({ osuId }) => ({
            osuId,
            day: "2026-01-01",
            drawnAt: new Date("2026-01-01T03:00:00Z"),
            cards: Array.from({ length: 10 }, () => ({ src, rarity })),
          })),
        );
      expect(await publicLiruCollectionAuthors(figures)).toEqual([
        author.osuId,
      ]);
      await seedEditions([{ ...edition, slug, published: false }]);
      expect(await publicLiruCollectionAuthors(figures)).toEqual([]);
    } finally {
      await db()
        .delete(registrations)
        .where(eq(registrations.editionSlug, slug));
      await db()
        .delete(editionRevisions)
        .where(eq(editionRevisions.editionSlug, slug));
      await db().delete(editionState).where(eq(editionState.slug, slug));
    }
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
