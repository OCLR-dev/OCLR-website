import { expect, it } from "vitest";
import { editionSchema } from "../../src/lib/editions";
import { milestonePayload } from "../../src/lib/milestone-payload";

it("preserves day precision and unknown boundaries in the native save payload", () => {
  const rows = [
    {
      id: 7,
      label: "Synthetic final",
      kind: "knockout" as const,
      at: null,
      endAt: null,
      precision: "day" as const,
    },
  ];
  const original = structuredClone(rows);
  const payload = milestonePayload(rows);
  expect(editionSchema.shape.schedule.parse(payload)).toEqual([
    {
      label: "Synthetic final",
      kind: "knockout",
      at: null,
      endAt: null,
      precision: "day",
    },
  ]);
  expect(rows).toEqual(original);
  expect(payload[0]).not.toHaveProperty("id");
});

it("retains exact instants and the legacy payload when no precision is supplied", () => {
  const at = "2025-03-14T21:00:00+08:00";
  expect(milestonePayload([{ id: 0, label: "Synthetic opening", at }])).toEqual(
    [{ label: "Synthetic opening", at }],
  );
  expect(
    milestonePayload([
      {
        id: 1,
        label: "Synthetic group",
        kind: "group",
        at,
        precision: "instant",
      },
    ]),
  ).toEqual([
    {
      label: "Synthetic group",
      kind: "group",
      at,
      endAt: null,
      precision: "instant",
    },
  ]);
});
