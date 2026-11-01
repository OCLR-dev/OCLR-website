import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { fork, spawn, type ChildProcess } from "node:child_process";
import {
  openSync,
  closeSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  fixtureReferees,
  refereeIrcCommands,
  refereeIrcConnections,
  refereeMpBindings,
  staffRoles,
  desktopSessions,
  fixtures,
  resultRevisions,
  mappools,
} from "../../src/db/schema";
import {
  seedAcceptance,
  acceptanceCookie,
  admin,
  referee,
  successor,
  apiGame,
} from "../fixtures/referee-acceptance";
import { assertTestDatabase } from "../database";
import type { RefereeWorkspace } from "../../src/lib/referee";
import type { RefereeReconciliation } from "../../src/lib/referee-reconciliation";
import type { MatchReview } from "../../src/lib/results";
import type { RefereeMpView } from "../../src/lib/referee-mp";
import { englishStorage } from "../fixtures/preferences";

const origin = "http://127.0.0.1:31475";
const headers = { Origin: origin };
const root = "/api/admin/tournaments/test-cup/matches/";
let directory: string, providerFile: string, server: ChildProcess;
const children = new Set<Desktop>();
type Snapshot = {
  sha: string;
  authorizationUrl: string;
  status: string;
  fixtureIds: string[];
  panelState: string;
  pairing: string;
  relay: { status: string };
  revision: number;
  connectionId: string;
  sequence: number;
  lines: string[];
  httpStatuses: number[];
  irc: { connection: string; room: number; referee: string };
};
class Desktop {
  child: ChildProcess;
  private serial = 0;
  private waiting = new Map<
    number,
    { resolve: (r: unknown) => void; reject: (e: Error) => void }
  >();
  constructor() {
    this.child = fork("tests/fixtures/referee-desktop-worker.mjs", [], {
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    this.child.on(
      "message",
      (message: {
        id: number;
        ok: boolean;
        value?: unknown;
        code?: string;
      }) => {
        const pending = this.waiting.get(message.id);
        if (!pending) return;
        this.waiting.delete(message.id);
        if (message.ok) pending.resolve(message.value);
        else pending.reject(new Error(message.code));
      },
    );
    this.child.on("exit", () => {
      for (const p of this.waiting.values())
        p.reject(Error("Desktop process exited"));
      this.waiting.clear();
    });
    children.add(this);
  }
  async call<T = unknown>(
    action: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const id = ++this.serial;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(Error(`Desktop ${action} timed out`));
      }, 15000);
      this.waiting.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(new Error(`${action}: ${error.message}`));
        },
      });
      this.child.send!({ id, action, ...args });
    });
  }
  snapshot() {
    return this.call<Snapshot>("snapshot");
  }
  async close() {
    if (this.child.connected) await this.call("close").catch(() => {});
    this.child.kill();
    children.delete(this);
  }
}
async function startServer() {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(31475, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const log = openSync(join(directory, "server.log"), "a");
  server = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      "./tests/fixtures/osu-provider.ts",
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "31475",
    ],
    {
      stdio: ["ignore", log, log],
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL!,
        TEST_DATABASE_URL: process.env.TEST_DATABASE_URL!,
        APP_URL: origin,
        ADMIN_OSU_IDS: String(admin.osuId),
        OSU_CLIENT_ID: "123",
        OSU_CLIENT_SECRET: "synthetic-browser-provider-secret",
        PRIVACY_CONTACT_OSU_ID: String(admin.osuId),
        OCLR_REFEREE_PROVIDER_FILE: providerFile,
      },
    },
  );
  closeSync(log);
  await expect
    .poll(
      async () => {
        try {
          if (server.exitCode !== null) throw Error("Acceptance server exited");
          return (await fetch(origin + "/api/health")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise<void>((resolve) =>
    server.once("exit", () => resolve()),
  );
  server.kill("SIGTERM");
  await exited;
}
async function json<T>(
  response: Awaited<ReturnType<APIRequestContext["get"]>>,
  status = 200,
): Promise<T> {
  expect(
    response.status(),
    (await response.body()).toString().slice(0, 600),
  ).toBe(status);
  return (await response.json()) as T;
}
async function workspace(request: APIRequestContext, fixtureId: string) {
  return json<RefereeWorkspace>(
    await request.get(root + fixtureId + "/referee"),
  );
}
async function command(
  request: APIRequestContext,
  fixtureId: string,
  action: Record<string, unknown>,
  expected = 200,
) {
  const w = await workspace(request, fixtureId);
  const body = {
    ...action,
    requestKey: randomUUID(),
    expectedRevision: w.session?.revision ?? 0,
    dependencyFingerprint: w.dependencyFingerprint,
  };
  return json<{ workspace: RefereeWorkspace }>(
    await request.patch(root + fixtureId + "/referee", { headers, data: body }),
    expected,
  );
}
async function irc(request: APIRequestContext, fixtureId: string) {
  return await json<{
    commands: { id: string; text: string; status: string }[];
    connection: { connected: boolean };
  }>(await request.get(root + fixtureId + "/referee/irc"));
}
async function authorize(
  desktop: Desktop,
  page: Page,
  context: BrowserContext,
  fixtureId: string,
  actor = referee,
) {
  await context.addCookies([await acceptanceCookie(actor)]);
  expect(
    (await context.request.get(root + fixtureId + "/referee")).status(),
    "seeded browser session before desktop authorization",
  ).toBe(200);
  await desktop.call("login", {
    username: actor.username.replaceAll(" ", "_"),
  });
  await expect
    .poll(async () => Boolean((await desktop.snapshot()).authorizationUrl))
    .toBe(true);
  const navigation = await page.goto(
    (await desktop.snapshot()).authorizationUrl,
  );
  expect(
    navigation?.status(),
    (await page.locator("body").innerText()).slice(0, 500),
  ).toBe(200);
  await expect(
    page.getByRole("button", { name: "Authorize desktop app", exact: true }),
    await page.locator("body").innerText(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Authorize desktop app", exact: true })
    .click();
  await expect
    .poll(async () => (await desktop.snapshot()).status)
    .toBe("connected");
  await expect
    .poll(async () => (await desktop.snapshot()).fixtureIds)
    .toContain(fixtureId);
  await desktop.call("select", { fixtureId });
  await expect
    .poll(async () => (await desktop.snapshot()).panelState)
    .toBe("fresh");
}
async function bindRoom(desktop: Desktop, roomId = 999525) {
  await desktop.call("join", { roomId });
  await expect
    .poll(async () => (await desktop.snapshot()).irc.referee)
    .toBe("listed");
  await desktop.call("start");
  await expect
    .poll(async () => (await desktop.snapshot()).relay.status)
    .toBe("connected");
  await expect
    .poll(async () => (await desktop.snapshot()).sequence)
    .toBeGreaterThan(0);
}
async function queue(
  request: APIRequestContext,
  fixtureId: string,
  text: string,
  extra: Record<string, unknown> = {},
) {
  const body = { action: "queue", requestKey: randomUUID(), text, ...extra };
  await json(
    await request.post(root + fixtureId + "/referee/irc", {
      headers,
      data: body,
    }),
  );
  return body;
}
function saveProvider(
  games: ReturnType<typeof apiGame>[],
  split = false,
  closed = true,
) {
  const page = (id: number, list: typeof games) => ({
    match: {
      id,
      name: "Synthetic acceptance",
      start_time: list[0]?.start_time ?? "2020-01-01T00:00:00Z",
      end_time: closed
        ? (list.at(-1)?.end_time ?? "2020-01-01T23:59:00Z")
        : null,
    },
    current_game_id: null,
    first_event_id: list[0]?.id ?? 0,
    latest_event_id: list.at(-1)?.id ?? 0,
    events: list.map((g) => ({
      id: g.id,
      timestamp: g.end_time,
      detail: { type: "other" },
      user_id: null,
      game: g,
    })),
    users: [],
  });
  writeFileSync(
    providerFile,
    JSON.stringify({
      999525: page(999525, split ? games.slice(0, 1) : games),
      999526: page(999526, split ? games.slice(1) : []),
    }),
  );
}
async function importMatch(
  request: APIRequestContext,
  fixtureId: string,
  match: number,
) {
  const review = await json<MatchReview>(
    await request.get(root + fixtureId + "/results"),
  );
  return json<MatchReview>(
    await request.post(root + fixtureId + "/imports", {
      headers,
      data: {
        match: String(match),
        requestKey: randomUUID(),
        expectedVersion: review.context.result?.version ?? 0,
        expectedFixtureVersion: review.context.fixture.version,
        confirmed: true,
      },
    }),
  );
}
test.describe("requested referee acceptance", () => {
  test.skip(
    !process.env.TEST_DATABASE_URL || !process.env.OCLR_IRC_CHECKOUT,
    "Explicit isolated test DB and pinned OCLR IRC checkout required",
  );
  test.beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    directory = mkdtempSync(join(tmpdir(), "oclr-referee-acceptance-"));
    providerFile = join(directory, "provider.json");
    saveProvider([]);
    await startServer();
  });
  test.afterEach(async () => {
    for (const child of [...children]) await child.close();
  });
  test.afterAll(async () => {
    await stopServer();
    await closeDb();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  for (const tb of [false, true])
    test(`3v3 BO9 ${tb ? "4:4 and TB" : "early finish"} through Admin publication`, async ({
      page,
      context,
      browser,
    }, info) => {
      const seed = await seedAcceptance(),
        id = seed.fixtureId,
        desktop = new Desktop();
      await authorize(desktop, page, context, id);
      // Exercise website-driven creation using the shipping desktop relay/socket.
      await desktop.call("start");
      await expect
        .poll(
          async () => (await irc(context.request, id)).connection?.connected,
        )
        .toBe(true);
      await queue(context.request, id, "!mp make Synthetic acceptance");
      await expect
        .poll(async () => (await desktop.snapshot()).irc.referee, {
          timeout: 15000,
        })
        .toBe("listed");
      await expect
        .poll(
          async () =>
            (await irc(context.request, id)).commands.every(
              (c) => !["queued", "sending", "sent"].includes(c.status),
            ),
          { timeout: 15000 },
        )
        .toBe(true);
      const commands = (await desktop.snapshot()).lines;
      expect(commands.filter((x) => x.includes(":!mp make "))).toHaveLength(1);
      let w = await workspace(context.request, id);
      expect(w.teams.map((t) => t.members.length)).toEqual([6, 6]);
      await page.goto(`/admin/tournaments/test-cup/matches/${id}/referee`);
      await expect(
        page.getByLabel("First Ban team", { exact: true }),
      ).toBeVisible();
      // All twelve literal invitations are generated from saved identities.
      for (const t of w.teams)
        for (const p of t.members)
          expect(await page.locator("body").textContent()).toContain(
            `!mp invite ${p.username.replaceAll(" ", "_")}`,
          );
      // Unsupported semantic replies stay unknown; a test clock advances only
      // the local acknowledgement deadline, followed by explicit human review.
      for (const text of [
        "!mp set 2 0 16",
        ...w.teams.flatMap((t) =>
          t.members.map((p) => `!mp invite ${p.username.replaceAll(" ", "_")}`),
        ),
      ]) {
        await queue(context.request, id, text);
        await expect
          .poll(
            async () =>
              (await irc(context.request, id)).commands.at(-1)?.status,
          )
          .toBe("sent");
        await desktop.call("advance", { milliseconds: 16000 });
        await expect
          .poll(
            async () =>
              (await irc(context.request, id)).commands.at(-1)?.status,
          )
          .toBe("unknown");
        await desktop.call("review");
        await desktop.call("read");
        expect(
          (await desktop.snapshot()).lines.filter(
            (l) => l === `PRIVMSG #mp_999525 :${text}`,
          ),
        ).toHaveLength(1);
      }
      expect(
        (await workspace(context.request, id)).projection.activeSelections,
      ).toHaveLength(0);
      await page
        .getByLabel("First Ban team", { exact: true })
        .selectOption(w.teams[0].id);
      await page
        .getByLabel("First Pick team", { exact: true })
        .selectOption(w.teams[0].id);
      await page
        .getByRole("button", { name: "Apply order", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await workspace(context.request, id)).session?.firstPickTeamId,
        )
        .toBe(w.teams[0].id);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath("synthetic-referee-controls.png"),
        animations: "disabled",
      });
      const games: ReturnType<typeof apiGame>[] = [],
        excluded = new Set<number>();
      const home = w.teams[0].id,
        away = w.teams[1].id;
      const winners = tb
        ? [home, away, home, away, home, away, home, away, home]
        : [home, away, home, home, home, home];
      let gameId = 525001;
      async function select() {
        w = await workspace(context.request, id);
        const used = new Set(
          w.projection.activeSelections.map((s) => s.entryId),
        );
        const map =
          w.projection.nextStep?.kind === "tb"
            ? w.maps.find((m) => m.category === "TB")!
            : w.maps.find(
                (m) => !used.has(m.id) && !["FM", "TB"].includes(m.category),
              )!;
        const row = page
          .locator('[class*="poolRow"]')
          .filter({ hasText: map.metadata.title });
        await row.locator("button:enabled").first().click();
        await expect
          .poll(
            async () =>
              (await workspace(context.request, id)).projection.activeSelections
                .length,
          )
          .toBe(used.size + 1);
        // Saved BP is authoritative before relay effects; the original request is never recorded twice.
        const current = await workspace(context.request, id),
          selection = current.projection.activeSelections.at(-1)!;
        await expect
          .poll(
            async () =>
              (await irc(context.request, id)).commands.every(
                (c) => !["queued", "sending", "sent"].includes(c.status),
              ),
            { timeout: 20000 },
          )
          .toBe(true);
        expect(
          (await workspace(context.request, id)).projection.activeSelections,
        ).toHaveLength(used.size + 1);
        if (selection.kind !== "ban")
          expect(
            (await irc(context.request, id)).commands
              .slice(-3)
              .map((c) => c.status),
          ).toEqual(["notified", "confirmed", "confirmed"]);
        return selection;
      }
      await select();
      await select();
      // Undo restores availability while retaining the original selection event.
      const secondBan = (
        await workspace(context.request, id)
      ).projection.activeSelections.at(-1)!;
      await command(context.request, id, { action: "void_last" });
      expect(
        (await workspace(context.request, id)).projection.activeSelections,
      ).toHaveLength(1);
      expect(
        (await workspace(context.request, id)).projection.selections.find(
          (s) => s.id === secondBan.id,
        )?.voided,
      ).toBe(true);
      await page.reload();
      await select();
      const beforeBinding = await workspace(context.request, id);
      const mpPath = root + id + "/referee/mp";
      await json(
        await context.request.post(mpPath, {
          headers,
          data: {
            action: "bind",
            match: "999526",
            expectedRevision: 0,
            expectedSessionRevision: beforeBinding.session!.revision,
            dependencyFingerprint: beforeBinding.dependencyFingerprint,
          },
        }),
      );
      for (const [index, winner] of winners.entries()) {
        const s = await select();
        if (index === 0) {
          // Same Pick: aborted attempt, tied replay, final valid second replay.
          await command(context.request, id, {
            action: "resolve_attempt",
            pickId: s.id,
            status: "aborted",
            winnerTeamId: null,
          });
          await command(context.request, id, {
            action: "replay_attempt",
            pickId: s.id,
          });
          games.push(apiGame(w, s.entryId, gameId++, null, true));
          excluded.add(games.at(-1)!.id);
          await command(context.request, id, {
            action: "resolve_attempt",
            pickId: s.id,
            status: "tied",
            winnerTeamId: null,
          });
          await command(context.request, id, {
            action: "replay_attempt",
            pickId: s.id,
          });
        }
        games.push(apiGame(w, s.entryId, gameId++, winner));
        saveProvider(games, true, false);
        if (index === 0 || s.kind === "tb") {
          await command(context.request, id, {
            action: "resolve_attempt",
            pickId: s.id,
            status: "completed",
            winnerTeamId: winner,
          });
        } else {
          // Advance the persisted poll deadline rather than waiting 30 seconds per synthetic game.
          await db()
            .update(refereeMpBindings)
            .set({ nextPollAt: new Date(0) })
            .where(eq(refereeMpBindings.fixtureId, id));
          const state = await json<RefereeMpView>(
            await context.request.post(mpPath, {
              headers,
              data: { action: "status" },
            }),
          );
          const synced = await json<RefereeMpView>(
            await context.request.post(mpPath, {
              headers,
              data: {
                action: "sync",
                expectedRevision: state.binding!.revision,
              },
            }),
          );
          expect(
            synced.workspace.projection.activeSelections.at(-1)?.attempts.at(-1)
              ?.winnerTeamId,
          ).toBe(winner);
        }
        if (index === 0) {
          await command(context.request, id, {
            action: "resolve_attempt",
            pickId: s.id,
            status: "completed",
            winnerTeamId: away,
          });
          expect(
            (await workspace(context.request, id)).projection.score[away],
          ).toBe(1);
          await command(context.request, id, {
            action: "resolve_attempt",
            pickId: s.id,
            status: "completed",
            winnerTeamId: winner,
          });
          const before = await workspace(context.request, id);
          await command(
            context.request,
            id,
            { action: "replay_attempt", pickId: s.id },
            409,
          );
          expect((await workspace(context.request, id)).session?.revision).toBe(
            before.session?.revision,
          );
          expect(
            before.projection.activeSelections.at(-1)?.attempts,
          ).toHaveLength(3);
        }
        // Reloads must restore score/attempts without resending any command.
        const count = (await desktop.snapshot()).lines.length;
        await page.reload();
        await expect(
          page.getByRole("region", { name: "Referee records", exact: true }),
        ).toContainText("PICK");
        expect((await desktop.snapshot()).lines).toHaveLength(count);
      }
      w = await workspace(context.request, id);
      expect(w.projection.complete).toBe(true);
      expect(w.projection.score).toEqual({ [home]: 5, [away]: tb ? 4 : 1 });
      await command(
        context.request,
        id,
        {
          action: "record_selection",
          entryId: w.maps.find(
            (m) =>
              !w.projection.activeSelections.some((s) => s.entryId === m.id),
          )!.id,
        },
        409,
      );
      const guest = await browser.newContext({
        baseURL: origin,
        storageState: englishStorage,
      });
      const publicPath = `/api/tournaments/test-cup/matches/${id}`;
      expect(
        (await json<{ result: unknown }>(await guest.request.get(publicPath)))
          .result,
      ).toBeNull();
      saveProvider(games, true);
      await importMatch(context.request, id, 999525);
      await importMatch(context.request, id, 999526);
      const reconPath = root + id + "/referee/reconciliation";
      let recon = await json<RefereeReconciliation>(
        await context.request.get(reconPath),
      );
      expect(recon.sources.filter((s) => s.current)).toHaveLength(2);
      expect(recon.rows.every((r) => r.status === "unmatched")).toBe(true);
      const first = recon.rows.find((r) => r.attemptStatus === "completed")!;
      const firstGame = games.find(
        (g) => g.beatmap_id === first.beatmapId && !excluded.has(g.id),
      )!;
      const firstSource = recon.sources.find(
        (s) => s.current && s.games.some((g) => g.id === firstGame.id),
      )!;
      const proof = {
        requestKey: randomUUID(),
        expectedRevision: recon.revision,
        expectedSessionRevision: recon.sessionRevision,
        dependencyFingerprint: recon.dependencyFingerprint,
        attemptId: first.attemptId,
        importId: firstSource.importId,
        sourceFingerprint: firstSource.fingerprint,
        gameId: firstGame.id,
      };
      await json(
        await context.request.post(reconPath, { headers, data: proof }),
      );
      recon = await json<RefereeReconciliation>(
        await context.request.get(reconPath),
      );
      expect(
        recon.rows.find((r) => r.attemptId === first.attemptId)?.status,
      ).toBe("matched");
      const different = recon.rows.find(
        (r) => r.attemptId !== first.attemptId,
      )!;
      expect(
        (
          await context.request.post(reconPath, {
            headers,
            data: {
              ...proof,
              requestKey: randomUUID(),
              expectedRevision: recon.revision,
              attemptId: different.attemptId,
            },
          })
        ).status(),
      ).toBe(409);
      // A source refresh and a saved correction invalidate prior confirmation.
      firstGame.scores[0].accuracy = 0.97;
      saveProvider(games, true);
      await importMatch(context.request, id, 999526);
      recon = await json<RefereeReconciliation>(
        await context.request.get(reconPath),
      );
      expect(
        recon.rows.find((r) => r.attemptId === first.attemptId)?.status,
      ).toBe("stale");
      const lastPick = w.projection.activeSelections.at(-1)!;
      await command(context.request, id, {
        action: "resolve_attempt",
        pickId: lastPick.id,
        status: "completed",
        winnerTeamId: home,
      });
      recon = await json<RefereeReconciliation>(
        await context.request.get(reconPath),
      );
      // Explicit game identity; tie and completed replay share a beatmap, never auto-paired.
      for (const row of recon.rows.filter((r) =>
        ["completed", "tied"].includes(r.attemptStatus),
      )) {
        const game = games.find(
          (g) =>
            g.beatmap_id === row.beatmapId &&
            (row.attemptStatus === "tied"
              ? excluded.has(g.id)
              : !excluded.has(g.id)),
        )!;
        recon = await json<RefereeReconciliation>(
          await context.request.get(reconPath),
        );
        const source = recon.sources.find(
          (s) => s.current && s.games.some((g) => g.id === game.id),
        )!;
        await json(
          await context.request.post(reconPath, {
            headers,
            data: {
              requestKey: randomUUID(),
              expectedRevision: recon.revision,
              expectedSessionRevision: recon.sessionRevision,
              dependencyFingerprint: recon.dependencyFingerprint,
              attemptId: row.attemptId,
              importId: source.importId,
              sourceFingerprint: source.fingerprint,
              gameId: game.id,
            },
          }),
        );
      }
      recon = await json<RefereeReconciliation>(
        await context.request.get(reconPath),
      );
      expect(
        recon.rows
          .filter((r) => r.attemptStatus === "completed")
          .every((r) => r.status === "matched"),
      ).toBe(true);
      const review = await json<MatchReview>(
        await context.request.get(root + id + "/results"),
      );
      const submitted = await json<MatchReview>(
        await context.request.post(root + id + "/results", {
          headers,
          data: {
            action: "submit",
            confirmed: true,
            requestKey: randomUUID(),
            expectedVersion: review.context.result!.version,
            expectedFixtureVersion: review.context.fixture.version,
            importId: review.importId!,
            rulesConfirmed: true,
            sourceChangesConfirmed: true,
            publicNote: "Synthetic acceptance",
            decisions: games
              .filter((g) => !excluded.has(g.id))
              .map((g) => ({
                gameId: g.id,
                included: !excluded.has(g.id),
                reason: excluded.has(g.id)
                  ? "Synthetic tied replay excluded"
                  : "",
                complianceConfirmed: true,
                substitutions: [],
              })),
          },
        }),
      );
      expect(
        (await json<{ result: unknown }>(await guest.request.get(publicPath)))
          .result,
      ).toBeNull();
      const approve = {
        action: "approve_publish",
        confirmed: true,
        progressionAcknowledged: true,
        revision: 1,
        requestKey: randomUUID(),
        expectedVersion: submitted.context.result!.version,
        expectedFixtureVersion: submitted.context.fixture.version,
      };
      expect(
        (
          await context.request.post(root + id + "/results", {
            headers,
            data: approve,
          })
        ).status(),
      ).toBe(403);
      await context.addCookies([await acceptanceCookie(admin)]);
      await page.goto(`/admin/tournaments/test-cup/matches/${id}`);
      await page
        .getByLabel(
          "I reviewed the effect on dependent fixtures and public standings or brackets",
          { exact: true },
        )
        .check();
      await page
        .getByRole("button", { name: "Approve & publish result", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(
        page.getByText("Approved result · Published result"),
      ).toBeVisible();
      const published = await json<{
        result: { homeWins: number; awayWins: number };
      }>(await guest.request.get(publicPath));
      expect(published.result).toMatchObject({
        homeWins: 5,
        awayWins: tb ? 4 : 1,
      });
      expect(JSON.stringify(published)).not.toMatch(
        /dependencyFingerprint|requestKey|SYNTHETIC_PRIVATE_CONTACT|recordError/,
      );
      const [next] = await db()
        .select()
        .from(fixtures)
        .where(eq(fixtures.id, seed.followupId));
      // Progression is resolved from the authoritative published result, not private ledger.
      const nextPublic = await json<{ home: { team: { id: string } | null } }>(
        await guest.request.get(`/api/tournaments/test-cup/matches/${next.id}`),
      );
      expect(nextPublic.home.team?.id).toBe(home);
      await info.attach("synthetic-acceptance.json", {
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify({
            scenario: tb ? "BO9 TB" : "BO9 early",
            desktopSha: (await desktop.snapshot()).sha,
            games: games.length,
            score: w.projection.score,
            replayAttempts: 3,
            sources: 2,
            publication: "Admin only",
            transport:
              "real HTTP and TCP; synthetic identities/provider/Bancho",
          }),
        ),
      });
      await guest.close();
    });

  test("lost responses, heartbeat expiry and restart never resend commands", async ({
    page,
    context,
  }, info) => {
    const seed = await seedAcceptance(),
      id = seed.fixtureId,
      desktop = new Desktop();
    await authorize(desktop, page, context, id);
    await bindRoom(desktop);
    const w = await workspace(context.request, id);
    await command(context.request, id, {
      action: "set_order",
      firstBanTeamId: w.teams[0].id,
      firstPickTeamId: w.teams[1].id,
    });
    await page.goto(`/admin/tournaments/test-cup/matches/${id}/referee`);
    const endpoint = root + id + "/referee/irc",
      key = randomUUID();
    const body = { action: "queue", requestKey: key, text: "!mp timer 30" };
    await page.route("**" + endpoint, async (route) => {
      if (route.request().method() === "POST") {
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await page.evaluate(
      async ({ endpoint, body }) => {
        try {
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } catch {
          /* committed response lost */
        }
      },
      { endpoint, body },
    );
    await page.unroute("**" + endpoint);
    await json(await context.request.post(endpoint, { headers, data: body }));
    expect(
      (
        await context.request.post(endpoint, {
          headers,
          data: { ...body, text: "!mp timer 60" },
        })
      ).status(),
    ).toBe(409);
    await expect
      .poll(
        async () => (await irc(context.request, id)).commands.at(-1)?.status,
        { timeout: 12000 },
      )
      .toBe("confirmed");
    expect(
      (await desktop.snapshot()).lines.filter((l) =>
        l.endsWith(":!mp timer 30"),
      ),
    ).toHaveLength(1);
    expect(
      await db()
        .select()
        .from(refereeIrcCommands)
        .where(eq(refereeIrcCommands.requestKey, key)),
    ).toHaveLength(1);
    await desktop.call("fault", { mode: "receipt-response" });
    await queue(context.request, id, "!mp aborttimer");
    await expect
      .poll(async () => (await desktop.snapshot()).relay.status, {
        timeout: 12000,
      })
      .toBe("error");
    expect((await irc(context.request, id)).commands.at(-1)?.status).toBe(
      "confirmed",
    );
    expect(
      (await desktop.snapshot()).lines.filter((l) =>
        l.endsWith(":!mp aborttimer"),
      ),
    ).toHaveLength(1);
    await desktop.call("start");
    await expect
      .poll(async () => (await irc(context.request, id)).connection.connected)
      .toBe(true);
    await desktop.call("fault", { mode: "claim-response" });
    await queue(context.request, id, "!mp timer 31");
    await expect
      .poll(async () => (await desktop.snapshot()).relay.status, {
        timeout: 12000,
      })
      .toBe("error");
    const lost = (await irc(context.request, id)).commands.at(-1)!;
    expect(lost.status).toBe("sending");
    expect(
      (await desktop.snapshot()).lines.some((l) => l.endsWith(":!mp timer 31")),
    ).toBe(false);
    await db()
      .update(refereeIrcCommands)
      .set({ dispatchedAt: new Date(Date.now() - 46000) })
      .where(eq(refereeIrcCommands.id, lost.id));
    await db()
      .update(refereeIrcConnections)
      .set({ lastSeenAt: new Date(Date.now() - 31000) })
      .where(eq(refereeIrcConnections.fixtureId, id));
    const expired = await irc(context.request, id);
    expect(expired.connection.connected).toBe(false);
    expect(expired.commands.at(-1)?.status).toBe("unknown");
    const old = await desktop.snapshot();
    const evidence = {
      sender: "BanchoBot",
      target: "#mp_999525",
      text: "Countdown ends in 31 seconds",
    };
    await desktop.call("relay", {
      fixtureId: id,
      body: {
        action: "sync",
        connectionId: old.connectionId,
        sequence: old.sequence + 1,
        projection: {
          status: "connected",
          messages: [
            {
              id: randomUUID(),
              sender: "BanchoBot",
              text: evidence.text,
              at: new Date().toISOString(),
            },
          ],
        },
        receipts: [{ commandId: lost.id, status: "confirmed", evidence }],
      },
    });
    expect((await irc(context.request, id)).commands.at(-1)?.status).toBe(
      "unknown",
    );
    await queue(context.request, id, "!mp timer 32");
    const queued = (await irc(context.request, id)).commands.at(-1)!;
    await db()
      .update(refereeIrcCommands)
      .set({ createdAt: new Date(Date.now() - 31000) })
      .where(eq(refereeIrcCommands.id, queued.id));
    expect(
      (await irc(context.request, id)).commands.find((c) => c.id === queued.id)
        ?.status,
    ).toBe("failed");
    const before = await workspace(context.request, id);
    await stopServer();
    await expect(
      context.request.get(endpoint, { timeout: 1000 }),
    ).rejects.toThrow();
    await startServer();
    expect((await workspace(context.request, id)).events).toEqual(
      before.events,
    );
    await page.reload();
    expect(
      (await irc(context.request, id)).commands.find((c) => c.id === lost.id)
        ?.status,
    ).toBe("unknown");
    expect(
      (await irc(context.request, id)).commands.find((c) => c.id === queued.id)
        ?.status,
    ).toBe("failed");
    expect(
      (await desktop.snapshot()).lines.some((l) => /:!mp timer 3[12]$/.test(l)),
    ).toBe(false);
    await info.attach("fault-states.json", {
      contentType: "application/json",
      body: Buffer.from(
        JSON.stringify({
          desktopSha: old.sha,
          browserLost: "one request and one wire send",
          receiptLost: "confirmed preserved",
          claimLost: "unknown, zero wire sends",
          queuedExpired: "failed",
          restart: "same ledger",
        }),
      ),
    });
  });

  test("concurrent browsers and stale legacy confirmation cannot duplicate BP", async ({
    page,
    context,
    browser,
  }) => {
    const seed = await seedAcceptance(),
      id = seed.fixtureId,
      desktop = new Desktop();
    await authorize(desktop, page, context, id);
    await bindRoom(desktop);
    await desktop.call("fault", { mode: "silence" });
    let w = await workspace(context.request, id);
    await command(context.request, id, {
      action: "set_order",
      firstBanTeamId: w.teams[0].id,
      firstPickTeamId: w.teams[1].id,
    });
    const other = await browser.newContext({
      baseURL: origin,
      storageState: englishStorage,
    });
    await other.addCookies([await acceptanceCookie(referee)]);
    const endpoint = root + id + "/referee/irc";
    const responses = await Promise.all(
      [context.request, other.request].map((request) =>
        request.post(endpoint, {
          headers,
          data: {
            action: "queue",
            requestKey: randomUUID(),
            text: "!mp timer 30",
          },
        }),
      ),
    );
    expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
    await expect
      .poll(
        async () => (await irc(context.request, id)).commands.at(-1)?.status,
      )
      .toBe("sent");
    const sent = (await irc(context.request, id)).commands.at(-1)!;
    await db()
      .update(refereeIrcCommands)
      .set({ dispatchedAt: new Date(Date.now() - 46000) })
      .where(eq(refereeIrcCommands.id, sent.id));
    await expect
      .poll(
        async () =>
          (await irc(context.request, id)).commands.find(
            (c) => c.id === sent.id,
          )?.status,
      )
      .toBe("unknown");
    await desktop.call("review");
    await desktop.call("stop");
    await desktop.call("start");
    await expect
      .poll(async () => (await irc(context.request, id)).connection.connected)
      .toBe(true);
    w = await workspace(context.request, id);
    const map = w.maps.find((m) => m.category === "NM")!;
    await queue(context.request, id, `!mp map ${map.beatmapId} 0`, {
      selection: {
        entryId: map.id,
        expectedRevision: w.session!.revision,
        dependencyFingerprint: w.dependencyFingerprint,
      },
    });
    await expect
      .poll(
        async () => (await irc(context.request, id)).commands.at(-1)?.status,
      )
      .toBe("sent");
    await command(other.request, id, {
      action: "set_order",
      firstBanTeamId: w.teams[0].id,
      firstPickTeamId: w.teams[0].id,
    });
    const revision = (await workspace(context.request, id)).session!.revision;
    await desktop.call("reply", {
      roomId: 999525,
      text: `Beatmap changed to: https://osu.ppy.sh/b/${map.beatmapId} Synthetic map`,
    });
    await expect
      .poll(
        async () => (await irc(context.request, id)).commands.at(-1)?.status,
      )
      .toBe("record_failed");
    expect((await workspace(context.request, id)).session!.revision).toBe(
      revision,
    );
    expect(
      (await workspace(context.request, id)).projection.activeSelections,
    ).toHaveLength(0);
    w = await workspace(context.request, id);
    const save = {
      action: "record_selection",
      entryId: map.id,
      expectedRevision: w.session!.revision,
      dependencyFingerprint: w.dependencyFingerprint,
    };
    const race = await Promise.all(
      [context.request, other.request].map((request) =>
        request.patch(root + id + "/referee", {
          headers,
          data: { ...save, requestKey: randomUUID() },
        }),
      ),
    );
    expect(race.map((r) => r.status()).sort()).toEqual([200, 409]);
    expect(
      (await workspace(context.request, id)).projection.activeSelections,
    ).toHaveLength(1);
    // A dependency change before dispatch rejects the queued legacy intent.
    await desktop.call("stop");
    const binding = await desktop.call<{ data: { connectionId: string } }>(
      "relay",
      {
        fixtureId: id,
        body: {
          action: "bind",
          roomId: 999525,
          ircUsername: referee.username.replaceAll(" ", "_"),
        },
      },
    );
    const connectionId = binding.data.connectionId;
    const sync = {
      action: "sync",
      connectionId,
      sequence: 1,
      projection: { status: "connected", messages: [] },
      receipts: [],
    };
    await desktop.call("relay", { fixtureId: id, body: sync });
    w = await workspace(context.request, id);
    const another = w.maps.find((m) => m.id !== map.id && m.category === "NM")!;
    await queue(context.request, id, `!mp map ${another.beatmapId} 0`, {
      selection: {
        entryId: another.id,
        expectedRevision: w.session!.revision,
        dependencyFingerprint: w.dependencyFingerprint,
      },
    });
    await db()
      .update(mappools)
      .set({ version: 123 })
      .where(eq(mappools.id, seed.poolId!));
    const dispatched = await desktop.call<{ data: { command: unknown } }>(
      "relay",
      { fixtureId: id, body: { ...sync, sequence: 2 } },
    );
    expect(dispatched.data.command).toBeNull();
    expect((await irc(context.request, id)).commands.at(-1)?.status).toBe(
      "failed",
    );
    expect((await workspace(context.request, id)).session!.revision).toBe(
      w.session!.revision,
    );
    expect(
      await db()
        .select()
        .from(resultRevisions)
        .where(eq(resultRevisions.fixtureId, id)),
    ).toHaveLength(0);
    await other.close();
  });

  for (const revoked of ["assignment", "role", "session"] as const)
    test(`${revoked} revocation and successor handoff fence the old connection`, async ({
      page,
      context,
      browser,
    }) => {
      const seed = await seedAcceptance(),
        id = seed.fixtureId,
        old = new Desktop();
      await authorize(old, page, context, id);
      await bindRoom(old);
      await old.call("fault", { mode: "silence" });
      let w = await workspace(context.request, id);
      await command(context.request, id, {
        action: "set_order",
        firstBanTeamId: w.teams[0].id,
        firstPickTeamId: w.teams[1].id,
      });
      await command(context.request, id, {
        action: "record_selection",
        entryId: w.maps[0].id,
      });
      await queue(context.request, id, "!mp timer 30");
      await expect
        .poll(
          async () => (await irc(context.request, id)).commands.at(-1)?.status,
        )
        .toBe("sent");
      const state = await old.snapshot();
      if (revoked === "assignment")
        await db()
          .delete(fixtureReferees)
          .where(
            and(
              eq(fixtureReferees.fixtureId, id),
              eq(fixtureReferees.userId, referee.osuId),
            ),
          );
      if (revoked === "role")
        await db()
          .update(staffRoles)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(staffRoles.userId, referee.osuId),
              eq(staffRoles.role, "referee"),
            ),
          );
      if (revoked === "session")
        await db()
          .update(desktopSessions)
          .set({ revokedAt: new Date() })
          .where(eq(desktopSessions.userId, referee.osuId));
      await expect(
        old.call("relay", {
          fixtureId: id,
          body: {
            action: "sync",
            connectionId: state.connectionId,
            sequence: state.sequence + 1,
            projection: { status: "connected", messages: [] },
            receipts: [],
          },
        }),
      ).rejects.toThrow();
      if (revoked !== "session")
        expect(
          (await context.request.get(root + id + "/referee")).status(),
        ).toBe(403);
      await old.call("read");
      await expect
        .poll(async () => (await old.snapshot()).panelState)
        .toBe("empty");
      await db().insert(fixtureReferees).values({
        fixtureId: id,
        userId: successor.osuId,
        assignedBy: admin.osuId,
      });
      const incoming = await browser.newContext({
          baseURL: origin,
          storageState: englishStorage,
        }),
        incomingPage = await incoming.newPage(),
        next = new Desktop();
      await authorize(next, incomingPage, incoming, id, successor);
      await bindRoom(next);
      w = await workspace(incoming.request, id);
      expect(w.projection.activeSelections).toHaveLength(1);
      const before = w.events;
      await expect(
        old.call("relay", {
          fixtureId: id,
          body: {
            action: "sync",
            connectionId: state.connectionId,
            sequence: state.sequence + 100,
            projection: { status: "connected", messages: [] },
            receipts: [],
          },
        }),
      ).rejects.toThrow();
      const wrong =
        root.replace("test-cup", "private-test-cup") + id + "/referee";
      expect((await incoming.request.get(wrong)).status()).toBe(403);
      expect((await workspace(incoming.request, id)).events).toEqual(before);
      await db().insert(fixtureReferees).values({
        fixtureId: seed.followupId,
        userId: successor.osuId,
        assignedBy: admin.osuId,
      });
      await db()
        .update(fixtures)
        .set({
          homeTeamId: seed.home.teamId,
          awayTeamId: seed.away.teamId,
          homeSourceId: null,
          homeSourceOutcome: null,
        })
        .where(eq(fixtures.id, seed.followupId));
      await next.call("fixtures");
      await next.call("select", { fixtureId: seed.followupId });
      await expect
        .poll(async () => (await next.snapshot()).relay.status)
        .toBe("off");
      await expect
        .poll(
          async () => (await irc(incoming.request, id)).connection.connected,
        )
        .toBe(false);
      await incoming.close();
    });
});
