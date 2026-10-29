import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageNotes } from "../../src/components/page-notes";

vi.mock("../../src/i18n/shared", () => ({
  useAppTranslations: () => (text: string) => text,
}));

it("omits empty notes and labels multiple page-local sections uniquely", () => {
  expect(
    renderToStaticMarkup(<PageNotes>{[false, null, undefined, ""]}</PageNotes>),
  ).toBe("");
  const html = renderToStaticMarkup(
    <>
      <PageNotes>
        <p>Public limitation</p>
      </PageNotes>
      <PageNotes>
        <details>
          <summary>Coverage</summary>Recorded matches
        </details>
      </PageNotes>
    </>,
  );
  const labels = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map(
    (m) => m[1],
  );
  expect(new Set(labels).size).toBe(2);
  for (const id of labels) expect(html).toContain(`<h2 id="${id}">Notes</h2>`);
  expect(html).toContain("Public limitation");
  expect(html).toContain("<summary>Coverage</summary>");
});
