import { describe, expect, it } from "vitest";
import { canViewStreaming } from "../../src/lib/streaming";
import { permits, type StaffGrant } from "../../src/lib/auth/staff";
import { tournamentLinks } from "../../src/lib/tournaments";
describe("streaming role boundaries", () => {
  it.each(["streamer", "commentator"] as const)(
    "gives %s only edition-scoped broadcast reads and self-service",
    (role) => {
      const grants: StaffGrant[] = [{ role, editionSlug: "test-cup" }];
      expect(canViewStreaming(grants, "test-cup")).toBe(true);
      expect(canViewStreaming(grants, "other-test-cup")).toBe(false);
      for (const capability of ["view_streaming", "select_streaming"] as const)
        expect(permits(grants, capability, "test-cup")).toBe(true);
      for (const capability of [
        "manage_streaming",
        "manage_staff",
        "manage_fixtures",
        "record_results",
        "approve_results",
        "manage_mappools",
        "manage_draft",
        "manage_registrations",
      ] as const)
        expect(permits(grants, capability, "test-cup")).toBe(false);
      expect(tournamentLinks(grants, "test-cup").map((l) => l.label)).toContain(
        "Streaming tasks",
      );
      expect(
        tournamentLinks(grants, "test-cup").map((l) => l.label),
      ).not.toContain("Mappools");
    },
  );
  it("keeps the global Developer read-only and gives Referee no streaming authority", () => {
    const developer = [
      { role: "developer", editionSlug: null },
    ] as StaffGrant[];
    expect(canViewStreaming(developer, "test-cup")).toBe(true);
    for (const capability of [
      "view_streaming",
      "select_streaming",
      "manage_streaming",
    ] as const)
      expect(permits(developer, capability, "test-cup")).toBe(false);
    expect(
      canViewStreaming([{ role: "referee", editionSlug: null }], "test-cup"),
    ).toBe(false);
  });
});
