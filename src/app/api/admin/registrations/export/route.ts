import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/staff-request";
import {
  exportApplicationIdentities,
  exportApplications,
} from "@/lib/staff-registration-reads";
import { csv } from "@/lib/csv";
import { apiError, HttpError } from "@/lib/http";
function download(body: string, type: string, filename: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function GET(request: NextRequest) {
  try {
    const actor = await requireStaff();
    const { format = "csv", ...filters } = Object.fromEntries(
      request.nextUrl.searchParams,
    );
    if (format === "uid" || format === "username") {
      const rows = await exportApplicationIdentities(actor, filters);
      const body =
        format === "uid"
          ? rows.map(({ userId }) => userId).join("\n")
          : rows.map(({ username }) => username).join(",");
      return download(body, "text/plain", `oclr-registrations-${format}.txt`);
    }
    if (format !== "csv") throw new HttpError(400, "Invalid export format.");

    const rows = await exportApplications(actor, filters);
    const body = csv([
      [
        "osu! ID",
        "Username",
        "Edition",
        "Status",
        "Submitted at (UTC)",
        "Application answers",
        "Global rank (osu!standard)",
        "PP (osu!standard)",
        "Statistics fetched at (UTC)",
        "Statistics status",
      ],
      ...rows.map((r) => [
        r.userId,
        r.username,
        r.editionSlug,
        r.status,
        r.createdAt.toISOString(),
        r.applicationAnswers,
        r.statistics?.globalRank ?? "",
        r.statistics?.pp ?? "",
        r.statistics?.fetchedAt ?? "",
        r.statistics?.status ?? "unavailable",
      ]),
    ]);
    return download(body, "text/csv", "oclr-registrations.csv");
  } catch (error) {
    return apiError(error);
  }
}
