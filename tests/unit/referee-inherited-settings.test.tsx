import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RefereePanel } from "../../src/components/referee-panel";
import { RefereeCommands } from "../../src/components/referee-commands";
import { RefereeIrc } from "../../src/components/referee-irc";
import { workspace } from "../components/referee-panel-data";
vi.mock("../../src/i18n/shared", () => ({
  useAppTranslations: () => (text: string) => text,
}));
vi.mock("../../src/components/referee-reconciliation", () => ({
  RefereeReconciliation: () => null,
}));

describe("inherited referee room settings", () => {
  it("renders inherited command values and a read-only summary, with no session override controls or round shortcut", () => {
    const data = workspace();
    data.canConfigure = true;
    data.defaultSettings.streamerUsername = "Assigned Streamer";
    data.session!.settings = {
      ...data.defaultSettings,
      roomName: "Obsolete custom room",
      streamerUsername: "Obsolete streamer",
      roomSize: 4,
      timerSeconds: 30,
      startSeconds: 3,
    };
    const html = renderToStaticMarkup(
      <RefereePanel data={data} slug="synthetic" />,
    );
    expect(html).toContain("!mp make OCLR S11: Synthetic");
    expect(html).toContain("!mp set 2 3 8");
    expect(html).toContain("!mp addref Assigned_Streamer");
    expect(html).toContain("!mp start 5");
    expect(html).toContain("90s");
    for (const removed of [
      "Obsolete custom room",
      "Obsolete streamer",
      "Edit room settings",
      "Save command settings",
      "Configure round referee policy",
      "/rounds?round=",
      "!mp start 3",
      "30s",
    ])
      expect(html).not.toContain(removed);
  });
  it("leaves missing saved values unavailable rather than inventing room settings or a streamer", () => {
    const data = workspace();
    data.defaultSettings.roomSize = null;
    data.defaultSettings.timerSeconds = null;
    data.defaultSettings.startSeconds = null;
    data.policy = null;
    const html = renderToStaticMarkup(
      <RefereeCommands
        settings={data.defaultSettings}
        policy={null}
        rules={data.rules}
        teams={data.teams}
        selectedMap={null}
      />,
    );
    expect(html).toContain("Not set");
    expect(html).toContain("Assign an active Streamer");
    expect(html).not.toContain("!mp set");
    expect(html).not.toContain("!mp start");
    expect(html).not.toContain("!mp addref");
    expect(html).not.toContain("<input");
  });
  it("builds quick timers from saved policy only, deduplicates them and has no fallback start countdown", () => {
    const html = renderToStaticMarkup(
      <RefereeIrc
        fixtureId="00000000-0000-4000-8000-000000000020"
        draft=""
        simulation
        disabled={false}
        startSeconds={null}
        timers={[45, 75, 75, null, undefined]}
        selectedMods={null}
        recordedSelectionLabel={null}
        onChange={() => {}}
        onPrepare={() => {}}
        onConfirm={async () => true}
        endpoint="/synthetic/irc"
        onWorkspace={() => {}}
        onQueued={() => {}}
        onConfirmed={() => {}}
      />,
    );
    expect(html).toContain("45s");
    expect(html.match(/75s/g)).toHaveLength(1);
    expect(html).not.toContain("30s");
    expect(html).not.toContain("!mp start");
    expect(html).toContain("!mp aborttimer");
  });
});
