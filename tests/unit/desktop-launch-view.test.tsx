import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, expect, vi } from "vitest";
vi.mock("../../src/i18n/shared", () => ({
  useAppTranslations: () => (text: string) => text,
}));
import { RefereeIrc } from "../../src/components/referee-irc";
const props = {
  fixtureId: "00000000-0000-4000-8000-000000000010",
  draft: "",
  simulation: false,
  disabled: false,
  startSeconds: 5,
  timers: [60, 90, 120],
  selectedMods: null,
  recordedSelectionLabel: null,
  onChange() {},
  onPrepare() {},
  async onConfirm() {
    return true;
  },
  endpoint: "/synthetic/irc",
  onWorkspace() {},
  onQueued() {},
  onConfirmed() {},
};
it("launches only the current fixture and offers an explicit install fallback", () => {
  const html = renderToStaticMarkup(<RefereeIrc {...props} />);
  expect(html).toContain(
    `href="oclr-irc://connect?fixture=${props.fixtureId}"`,
  );
  expect(html).toContain("Get OCLR IRC");
  expect(html).not.toContain("access_token");
  expect(
    renderToStaticMarkup(<RefereeIrc {...props} simulation />),
  ).not.toContain("oclr-irc://");
  expect(
    renderToStaticMarkup(
      <RefereeIrc {...props} fixtureId="invalid&amp;token=secret" />,
    ),
  ).not.toContain("oclr-irc://");
});
