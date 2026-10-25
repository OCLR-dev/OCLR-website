import { authorizedPage } from "@/lib/auth/page";
import { requireStaff } from "@/lib/auth/staff";
import { remotePage } from "@/lib/remote-page";
import { applicationDetails } from "@/lib/staff";
import { redirect } from "next/navigation";
async function Issue271Page({ params }: { params: Promise<{ id: string }> }) {
  return authorizedPage(async () => {
    const { id } = await params;
    const { registration } = await applicationDetails(await requireStaff(), id);
    redirect(
      `/admin/tournaments/${registration.editionSlug}/registrations/${id}`,
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
