import { describe, it, expect } from "vitest";
import { isBpNotice, bpSyncSource } from "../../src/lib/referee-sync";
import { confirmsIrcCommand } from "../../src/lib/referee-irc-model";
import { workspace, id } from "../components/referee-panel-data";
import { projectReferee } from "../../src/lib/referee-model";
describe("BP notification and Mods evidence", () => {
  it("uses saved BP identities, sanitizes authored text, and rejects command injection", () => {
    const w = workspace();
    const event = {
      id: id(700),
      ordinal: 2,
      actorId: 1,
      createdAt: new Date().toISOString(),
      payload: {
        type: "selection_recorded" as const,
        stepIndex: 0,
        kind: "ban" as const,
        teamId: w.teams[0].id,
        entryId: w.maps[0].id,
        beatmapId: w.maps[0].beatmapId,
        category: "NM",
      },
    };
    w.events.push(event);
    w.projection = projectReferee({
      ...w.session!.basis,
      orders: w.session!,
      events: w.events,
    });
    w.teams[0].name = "Team\n!mp start 1|Injected";
    const notice = bpSyncSource(w, event.id)!.text;
    expect(notice).not.toContain("\n");
    expect(isBpNotice(notice)).toBe(true);
    for (const text of [
      "!mp start 1",
      notice + "\r\nPASS secret",
      notice.replace("https://osu.ppy.sh/b/10001", "https://bad.test/b/10001"),
    ])
      expect(isBpNotice(text)).toBe(false);
  });
  it.each([
    ["!mp mods NF HD", "Enabled Hidden, NoFail, disabled FreeMod", true],
    ["!mp mods NF Freemod", "Enabled NoFail, enabled FreeMod", true],
    ["!mp mods None", "Disabled all mods, disabled FreeMod", true],
    ["!mp mods NF", "Enabled Hidden, disabled FreeMod", false],
    ["!mp mods NF", "Enabled NoFail, enabled FreeMod", false],
    ["!mp mods NF", "Enabled Unknown, disabled FreeMod", false],
  ])("checks exact Mods and Freemod for %s", (command, text, expected) => {
    const evidence = { sender: "BanchoBot", target: "#mp_123", text };
    expect(confirmsIrcCommand(command, "#mp_123", evidence)).toBe(expected);
    expect(confirmsIrcCommand(command, "#mp_124", evidence)).toBe(false);
    expect(
      confirmsIrcCommand(command, "#mp_123", { ...evidence, sender: "Player" }),
    ).toBe(false);
  });
});
