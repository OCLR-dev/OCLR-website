import { describe, expect, it } from "vitest";
import {
  projectPublicNews,
  publicNewsDate,
  publicNewsDateTime,
  publishesTournamentNews,
  type NewsEdition,
} from "../../src/lib/public-news-model";
import { edition } from "../fixtures/edition";
import { announcements } from "../fixtures/announcements";
import { historicalArchive } from "../fixtures/historical-archive";
import { tournamentTimeline } from "../../src/lib/tournament-timeline";
const now = new Date("2026-10-20T12:00:00Z");
const record: NewsEdition = {
  edition: {
    ...edition,
    schedule: [
      { label: "Captain draft", at: "2026-11-01T12:00:00Z" },
      { label: "Final", at: null },
    ],
  },
  registrationPaused: false,
};
describe("read-only deterministic public News", () => {
  it.each([
    ["2027-02-02T16:00:00Z", "day", "3 Feb 2027"],
    ["2027-04-12T07:45:00Z", "day", "12 Apr 2027"],
    ["2027-04-12T07:45:00Z", "instant", "15:45 (UTC+8)"],
    ["2027-04-12T07:45:00Z", undefined, "15:45 (UTC+8)"],
  ] as const)(
    "preserves milestone precision at %s (%s)",
    (at, precision, expected) => {
      const e = {
        ...edition,
        timeZone: "Asia/Taipei",
        registration: null,
        schedule: [{ label: "Synthetic milestone", at, precision }],
      };
      const [item] = projectPublicNews(
        [{ edition: e, registrationPaused: false }],
        [],
        [],
        true,
        now,
      );
      const [row] = tournamentTimeline(e, (text) => text, "en-GB").schedule;
      expect(item.summary).toContain(row.date);
      expect(item.summary).toContain(expected);
      expect(publicNewsDate(item, "en-GB")).toBe(row.date);
      expect(publicNewsDateTime(item)).toBe(
        precision === "day"
          ? at.startsWith("2027-02")
            ? "2027-02-03"
            : "2027-04-12"
          : at,
      );
      if (precision === "day")
        expect(item.summary).not.toMatch(/\d{2}:\d{2}|UTC/);
      expect(item.at).toBe(at);
      expect(item.future).toBe(true);
    },
  );
  it("excludes S1–S10 across every generated news kind, even after recent publication", () => {
    const editions = Array.from({ length: 12 }, (_, index) => ({
      ...record,
      edition: {
        ...record.edition,
        slug: `edition-${index + 1}`,
        season: `${index % 2 ? "S" : "Season "}${index + 1}`,
      },
    }));
    const events = editions.flatMap(({ edition: e }) =>
      (["mappool", "fixture", "result"] as const).map((kind) => ({
        editionSlug: e.slug,
        kind,
        id: `${kind}-1`,
        title: "Synthetic published event",
        summary: "Synthetic public content",
        at: "2026-10-20T11:00:00Z",
        url: `/tournaments/${e.slug}/results`,
      })),
    );
    const items = projectPublicNews(editions, events, announcements, true, now);
    expect(items.filter((item) => item.source)).toHaveLength(14);
    for (const item of items.filter((item) => item.source))
      expect(item.source!.url).toMatch(/^\/tournaments\/edition-1[12]\//);
    expect(new Set(items.map((item) => item.kind))).toEqual(
      new Set([
        "announcement",
        "registration",
        "schedule",
        "mappool",
        "fixture",
        "result",
      ]),
    );
    expect(items.some((item) => item.slug === "synthetic-announcement")).toBe(
      true,
    );
  });
  it("uses saved season metadata and canonical slugs while retaining S11+ archives", () => {
    expect(publishesTournamentNews({ ...edition, slug: "s10" })).toBe(false);
    expect(publishesTournamentNews({ ...edition, slug: "s11" })).toBe(true);
    expect(
      publishesTournamentNews({ ...edition, slug: "s11", season: "10" }),
    ).toBe(false);
    expect(publishesTournamentNews(edition)).toBe(true);
    expect(
      publishesTournamentNews({ ...edition, archive: historicalArchive }),
    ).toBe(false);
    const archived = {
      ...record,
      edition: {
        ...record.edition,
        slug: "history-test",
        season: "11",
        status: "completed" as const,
        registration: null,
        archive: historicalArchive,
      },
    };
    expect(projectPublicNews([archived], [], [], true, now)).toHaveLength(1);
    expect(
      projectPublicNews(
        [{ ...archived, edition: { ...archived.edition, season: "10" } }],
        [],
        [],
        true,
        now,
      ),
    ).toEqual([]);
  });
  it("deduplicates stable event URLs across reads and schedule reordering, keeping manual news", () => {
    const items = projectPublicNews([record], [], announcements, true, now);
    expect(new Set(items.map((i) => i.slug)).size).toBe(items.length);
    expect(items).toEqual(
      projectPublicNews([record], [], announcements, true, now),
    );
    const duplicate = {
      ...record,
      edition: {
        ...record.edition,
        schedule: [
          ...record.edition.schedule,
          ...record.edition.schedule,
        ].reverse(),
      },
    };
    expect(
      projectPublicNews([duplicate], [], announcements, true, now),
    ).toEqual(items);
    expect(items.some((i) => i.slug === "synthetic-announcement")).toBe(true);
    expect(JSON.stringify(items)).not.toContain("Hidden editorial");
  });
  it("does not expose unpublished edition dates or turn arbitrary labels/planned dates into completion", () => {
    expect(
      projectPublicNews(
        [{ ...record, edition: { ...record.edition, published: false } }],
        [],
        [],
        true,
        now,
      ),
    ).toEqual([]);
    const item = projectPublicNews([record], [], [], true, now).find(
      (i) => i.kind === "schedule",
    )!;
    expect(item.future).toBe(true);
    expect(item.title).toBe(
      "Scheduled: Captain draft — Synthetic test edition",
    );
    const past = projectPublicNews(
      [record],
      [],
      [],
      true,
      new Date("2026-12-01T00:00:00Z"),
    ).find((i) => i.kind === "schedule")!;
    expect(past.slug).toBe(item.slug);
    expect(past.title).toBe(item.title);
    expect(past.future).toBe(false);
    expect(past.summary).toContain("plan, not confirmation");
    expect(item.summary).toContain("UTC+8");
  });
  it("claims open registration only within its enabled window with privacy, active state and no lock", () => {
    const title = (r = record, privacy = true, time = now) =>
      projectPublicNews([r], [], [], privacy, time).find(
        (i) =>
          i.kind === "registration" &&
          i.summary.startsWith("Configured registration window:"),
      )!;
    const open = title();
    expect(open.title).toContain("Registration is open");
    for (const r of [
      { ...record, registrationPaused: true },
      {
        ...record,
        edition: { ...record.edition, status: "completed" as const },
      },
      {
        ...record,
        edition: {
          ...record.edition,
          registration: { ...edition.registration!, enabled: false },
        },
      },
    ])
      expect(title(r).title).not.toContain("is open");
    expect(title(record, false).title).not.toContain("is open");
    const future = title(record, true, new Date("2024-01-01T00:00:00Z"));
    expect(future.title).not.toContain("is open");
    expect(future.future).toBe(true);
    expect(future.slug).toBe(open.slug);
    expect(
      title(record, true, new Date(edition.registration!.closesAt)).title,
    ).not.toContain("is open");
  });
  it("withholds future publication timestamps and sorts upcoming plans chronologically after dated updates", () => {
    const event = {
      editionSlug: edition.slug,
      kind: "result" as const,
      id: "fixture-1",
      title: "Result published",
      summary: "Approved score",
      at: "2026-10-19T00:00:00Z",
      url: "/tournaments/test-cup/results",
    };
    const items = projectPublicNews(
      [record],
      [event, event, { ...event, id: "future", at: "2099-01-02T00:00:00Z" }],
      announcements,
      true,
      now,
    );
    expect(items.filter((i) => i.kind === "result")).toHaveLength(1);
    expect(items[0].kind).toBe("result");
    const future = items.filter((i) => i.future);
    expect(future.map((i) => Date.parse(i.at))).toEqual(
      future.map((i) => Date.parse(i.at)).sort((a, b) => a - b),
    );
  });
});

describe("localized News categories", () => {
  it("uses explicit display labels for every kind instead of raw enums", async () => {
    const { publicNewsKind } = await import("../../src/lib/public-news-model");
    const { createTranslator } = await import("next-intl");
    const { appTranslator } = await import("../../src/i18n/translate");
    for (const [locale, expected] of [
      [
        "en",
        [
          "Announcement",
          "Schedule",
          "Registration",
          "Mappool",
          "Fixture",
          "Result",
          "Scheduled",
        ],
      ],
      ["zh-Hans", ["公告", "赛程", "报名", "图池", "对局", "赛果", "预告"]],
      ["zh-Hant", ["公告", "賽程", "報名", "圖池", "對局", "賽果", "預告"]],
    ] as const) {
      const catalog = await import(`../../messages/${locale}.json`);
      const t = createTranslator({ locale, messages: catalog.default.ui });
      const tr = appTranslator(t, locale);
      const kinds = [
        "announcement",
        "schedule",
        "registration",
        "mappool",
        "fixture",
        "result",
      ] as const;
      expect(
        kinds.map((kind) => publicNewsKind({ kind, future: false }, tr)),
      ).toEqual(expected.slice(0, 6));
      expect(publicNewsKind({ kind: "registration", future: true }, tr)).toBe(
        expected[6],
      );
      const source =
        "{name} for {round} is published. View the released beatmaps and slot configuration.";
      if (locale !== "en") {
        const english = (await import("../../messages/en.json")).default.ui;
        for (const [key, source] of Object.entries(english))
          if (/\bmappools?\b/i.test(source))
            expect(catalog.default.ui[key], source).toContain(
              locale === "zh-Hans" ? "图池" : "圖池",
            );
      }
      const summary = tr(source, { name: "test", round: "1" });
      expect(summary).toContain("test");
      expect(summary).toContain("1");
      if (locale !== "en") {
        expect(summary).toContain(
          locale === "zh-Hans"
            ? "轮次「1」的图池「test」已发布"
            : "輪次「1」的圖池「test」已發布",
        );
        expect(tr("Mappooler")).toBe(locale === "zh-Hans" ? "选图" : "選圖");
        expect(tr("Player pool")).toBe(
          locale === "zh-Hans" ? "选手池" : "選手池",
        );
      }
    }
  });
});
