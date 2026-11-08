import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/staff-request";
import { exportApplications } from "@/lib/staff";
import { csv } from "@/lib/csv";
import { apiError } from "@/lib/http";
export async function GET(request: NextRequest) {
  try {
    const rows = await exportApplications(
      await requireStaff(),
      Object.fromEntries(request.nextUrl.searchParams),
    );
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
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="oclr-registrations.csv"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
