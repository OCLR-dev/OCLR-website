import { remoteMode } from "@/lib/data-source";
import { frontendPrivateTournament } from "@/lib/frontend-data";
import { remotePage } from "@/lib/remote-page";
import { authorizedPage } from "@/lib/auth/page";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import { tournamentList } from "@/lib/tournaments";
export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ edition: string }>;
}) {
  if (remoteMode())
    return remotePage(async () => {
      await frontendPrivateTournament((await params).edition);
      return children;
    });
  return authorizedPage(async () => {
    const { edition } = await params;
    const data = await tournamentList(await requireStaff());
    if (!data.rows.some((row) => row.slug === edition)) notFound();
    return children;
  });
}
