import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { PlayerMessageBoard } from "../../src/components/player-message-board";
import messages from "../../messages/en.json";
function render(viewerId?: number) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PlayerMessageBoard
        edition="test-cup"
        playerId={190004}
        name="Synthetic Player"
        signedIn={viewerId !== undefined}
        viewerId={viewerId}
      />
    </NextIntlClientProvider>,
  );
}
describe("player message board", () => {
  it("does not offer Edit or Delete without a message written by the viewer", () => {
    // Signed out: an empty board must not compare undefined with undefined.
    for (const viewerId of [undefined, 190001]) {
      const html = render(viewerId);
      expect(html).not.toContain('aria-label="Edit message"');
      expect(html).not.toContain('aria-label="Delete message"');
    }
  });
});
