import { describe, it, expect } from "vitest";
import {
  remotePageSupported,
  remoteApiSupported,
} from "../../src/lib/data-source";
import {
  availabilitySummary,
  availabilitySchema,
  scheduleStatus,
  type ScheduleBasis,
} from "../../src/lib/schedule-model";
describe("schedule time projections", () => {
  it("excludes personal scheduling routes from delegated remote access", () => {
    expect(remotePageSupported("/tournaments/s11/schedule/requests")).toBe(
      false,
    );
    expect(
      remotePageSupported("/admin/tournaments/s11/matches/schedule-requests"),
    ).toBe(false);
    expect(remoteApiSupported("/api/tournaments/s11/schedule/requests")).toBe(
      false,
    );
  });
  it("counts people rather than overlapping interval records", () => {
    const intervals = [
      { start: "2030-01-01T01:00:00Z", end: "2030-01-01T03:00:00Z" },
      { start: "2030-01-01T02:00:00Z", end: "2030-01-01T04:00:00Z" },
    ];
    expect(
      availabilitySummary([{ userId: 1, intervals }]).map((s) => s.count),
    ).toEqual([1, 1, 1]);
  });
  it("handles explicit DST offsets as distinct instants", () => {
    expect(
      availabilitySchema.safeParse([
        {
          start: "2030-11-03T01:30:00-04:00",
          end: "2030-11-03T01:30:00-05:00",
        },
      ]).success,
    ).toBe(true);
  });
  it("expires passed plans without changing terminal history", () => {
    const basis = {
      scheduledAt: "2030-01-01T00:00:00Z",
      timeZone: "UTC",
      homeTeamId: "a",
      awayTeamId: "b",
      homeCaptainId: 1,
      awayCaptainId: 2,
    } satisfies ScheduleBasis;
    expect(
      scheduleStatus(
        "waiting",
        true,
        basis,
        basis,
        "2030-01-02T00:00:00Z",
        Date.parse("2030-01-03T00:00:00Z"),
      ),
    ).toBe("expired");
    expect(
      scheduleStatus(
        "approved",
        false,
        basis,
        null,
        "2030-01-02T00:00:00Z",
        Date.now(),
      ),
    ).toBe("approved");
  });
});
