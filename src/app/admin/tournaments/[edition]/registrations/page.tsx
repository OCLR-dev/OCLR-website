import { RegistrationList } from "@/components/registration-list";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { assertReadCapability, requireStaff } from "@/lib/auth/staff";
import { remotePage } from "@/lib/remote-page";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Tournament registrations") };
}

async function Issue271Page({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return authorizedPage(async () => {
    const actor = await requireStaff();
    const { edition } = await params;
    await assertReadCapability(actor, "manage_registrations", edition);
    return (
      <RegistrationList
        actor={actor}
        editionSlug={edition}
        filtersInput={await searchParams}
      />
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
