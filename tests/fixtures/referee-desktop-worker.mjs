// Test-only process: real pinned desktop Main classes, loopback HTTP and IRC.
// No production host switch, tokens, passwords or callback URLs are exposed.
import net from "node:net";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const checkout = process.env.OCLR_IRC_CHECKOUT;
let clockOffset = 0;
const monotonicNow = performance.now.bind(performance);
Object.defineProperty(performance, "now", {
  value: () => monotonicNow() + clockOffset,
});
const origin = "http://127.0.0.1:31475";
if (!checkout || !process.send)
  throw Error("Use the isolated acceptance runner");
const load = (file) => import(pathToFileURL(resolve(checkout, file)).href);
const { OclrSession } = await load("src/main/oclr.ts");
const { IrcSession } = await load("src/main/irc.ts");
const { OclrRelay } = await load("src/main/oclr-relay.ts");
const { SqliteCreationStore } = await load("src/main/creation-store.ts");
const stateDirectory = mkdtempSync(
  resolve(tmpdir(), "oclr-desktop-acceptance-"),
);
const creationStore = new SqliteCreationStore(
  resolve(stateDirectory, "creation.sqlite"),
);
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: checkout,
  encoding: "utf8",
}).trim();
let url = null,
  fault = null,
  connectionId = null,
  sequence = 0;
const httpStatuses = [],
  lines = [],
  peers = new Set();
const server = net.createServer((socket) => {
  peers.add(socket);
  socket.on("close", () => peers.delete(socket));
  let pending = "",
    nick = "",
    room = 999525,
    beatmap = 525000,
    activeMods = "NF";
  const bot = (text) =>
    socket.write(`:BanchoBot PRIVMSG #mp_${room} :${text}\r\n`);
  socket.on("data", (chunk) => {
    pending += chunk.toString();
    let end;
    while ((end = pending.indexOf("\r\n")) >= 0) {
      const line = pending.slice(0, end);
      pending = pending.slice(end + 2);
      if (line.startsWith("PASS ")) continue;
      if (line.startsWith("NICK ")) nick = line.slice(5);
      if (line.startsWith("USER "))
        socket.write(`:server 001 ${nick} :welcome\r\n`);
      if (line.startsWith("PING :"))
        socket.write(`:server PONG server :${line.slice(6)}\r\n`);
      if (line.startsWith("JOIN ")) {
        room = Number(line.match(/#mp_(\d+)/)?.[1]);
        socket.write(`:${nick}!x JOIN :#mp_${room}\r\n`);
      }
      if (!line.startsWith("PRIVMSG ")) continue;
      const text = line.slice(line.indexOf(" :") + 2);
      if (text === "!mp settings") {
        bot(
          `Room name: Synthetic acceptance, History: https://osu.ppy.sh/mp/${room}`,
        );
        bot(`Beatmap: https://osu.ppy.sh/b/${beatmap} Synthetic map`);
        bot("Team mode: TeamVs, Win condition: Score");
        bot(`Active mods: ${activeMods}`);
        bot("Players: 0");
        continue;
      }
      if (text === "!mp listrefs") {
        bot(`Match referees: ${nick}`);
        continue;
      }
      lines.push(line);
      if (fault === "silence") continue;
      if (text.startsWith("!mp make "))
        socket.write(
          `:BanchoBot PRIVMSG ${nick} :Created the tournament match https://osu.ppy.sh/mp/${room} ${text.slice(9)}\r\n`,
        );
      else if (text.startsWith("!mp map ")) {
        beatmap = Number(text.split(" ")[2]);
        bot(
          `Beatmap changed to: https://osu.ppy.sh/b/${beatmap} Synthetic map`,
        );
      } else if (text.startsWith("!mp mods ")) {
        activeMods = text.slice(9);
        const mods = activeMods
          .split(" ")
          .filter((m) => !["Freemod", "None"].includes(m));
        bot(
          `${mods.length ? "Enabled " + mods.join(", ") : "Disabled all mods"}, ${activeMods.includes("Freemod") ? "enabled" : "disabled"} FreeMod.`,
        );
      } else if (text === "!mp aborttimer") bot("Countdown aborted.");
      else if (text.startsWith("!mp timer "))
        bot(`Countdown ends in ${text.split(" ")[2]} seconds`);
      else if (text.startsWith("!mp invite "))
        bot(`Invited ${text.slice(11)} to the room.`);
      else if (text.startsWith("!mp set "))
        bot("Changed match settings to TeamVs, Score, 16 slots");
    }
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const irc = new IrcSession(
  () =>
    net.createConnection({ host: "127.0.0.1", port: server.address().port }),
  { floodMs: 1, queryMs: 1000 },
);
const session = new OclrSession({
  origin,
  version: "0.7.0",
  platform: "darwin",
  openExternal: async (value) => {
    url = value;
  },
  writeClipboard: async () => {},
  fetcher: async (input, init) => {
    if (new URL(String(input)).origin !== origin)
      throw Error("External HTTP forbidden");
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (fault === "offline") throw Error("Synthetic website outage");
    const response = await fetch(input, init);
    httpStatuses.push(response.status);
    if (body?.action === "bind" || body?.action === "sync") {
      const data = (await response.clone().json()).data;
      if (data?.connectionId) {
        connectionId = data.connectionId;
        sequence = data.sequence;
      }
      if (
        (fault === "claim-response" && data?.command) ||
        (fault === "receipt-response" &&
          body?.receipts?.some((r) => r.status === "confirmed"))
      ) {
        fault = null;
        await response.body?.cancel();
        throw Error("Synthetic committed HTTP response lost");
      }
    }
    return response;
  },
});
irc.setCreationStore(creationStore);
const relay = new OclrRelay(session, irc);
const snapshot = () => ({
  sha,
  authorizationUrl: url,
  status: session.state.status,
  fixtureIds: session.state.fixtures.map((f) => f.fixtureId),
  error: session.state.error,
  panelState: session.state.panelState,
  pairing: session.state.pairing.status,
  relay: session.state.relay,
  revision: session.state.panel?.workspace.session?.revision,
  selected: session.state.selectedFixtureId,
  connectionId,
  sequence,
  lines,
  httpStatuses,
  irc: {
    connection: irc.state.connection,
    room: irc.state.room?.id,
    referee: irc.state.room?.referee,
  },
});
process.on("message", async ({ id, action, ...args }) => {
  try {
    let value;
    if (action === "login") {
      irc.login({ username: args.username, password: "SYNTHETIC_ONLY" });
      await session.login();
    } else if (action === "snapshot") value = snapshot();
    else if (action === "select") await session.selectFixture(args.fixtureId);
    else if (action === "read") await session.readPanel();
    else if (action === "advance") clockOffset += Number(args.milliseconds);
    else if (action === "review") {
      for (const record of irc.state.operations.records)
        if (record.state !== "observed")
          irc.reviewOperation({ id: record.id, reviewed: true });
    } else if (action === "fixtures") await session.loadFixtures();
    else if (action === "join") {
      irc.join(String(args.roomId));
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          irc.off("state", check);
          reject(Error("Synthetic JOIN timed out"));
        }, 5000);
        function check() {
          if (irc.state.room?.joined) {
            clearTimeout(timer);
            irc.off("state", check);
            resolve();
          }
        }
        irc.on("state", check);
        check();
      });
      irc.relayRefresh({
        roomId: args.roomId,
        roomEpoch: irc.state.room.epoch,
      });
    } else if (action === "start") await relay.start();
    else if (action === "stop") await relay.stop();
    else if (action === "fault") fault = args.mode;
    else if (action === "relay") {
      const r = await session.relayRequest(args.fixtureId, args.body);
      value = r.value;
    } else if (action === "reply")
      for (const peer of peers)
        peer.write(`:BanchoBot PRIVMSG #mp_${args.roomId} :${args.text}\r\n`);
    else if (action === "close") {
      await relay.stop();
      session.dispose();
      irc.logout();
      for (const peer of peers) peer.destroy();
      server.close();
      creationStore.close();
      rmSync(stateDirectory, { recursive: true, force: true });
    } else throw Error("Unknown test action");
    process.send({ id, ok: true, value });
    if (action === "close") process.disconnect();
  } catch (error) {
    process.send({ id, ok: false, code: error.code ?? "LOCAL_TEST_ERROR" });
  }
});
