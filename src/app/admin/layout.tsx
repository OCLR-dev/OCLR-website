import { remoteMode } from "@/lib/data-source";
import { frontendConnection } from "@/lib/frontend-data";
import { remotePage } from "@/lib/remote-page";
import { RemoteDataError } from "@/lib/remote-errors";
import { getAppTranslations } from "@/i18n/server";
import { StaffNavigation } from "@/components/staff-navigation";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/user";
import { staffAccess, canRead, isDeveloper, permits } from "@/lib/auth/staff";
import { tournamentList } from "@/lib/tournaments";
import { globalNavigation, tournamentNavigation } from "@/lib/admin-navigation";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return {
    title: tr("Administration"),
    robots: { index: false, follow: false },
  };
}

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (remoteMode())
    return remotePage(async () => {
      const context = await frontendConnection();
      if (!context.identity?.access.scopes.includes("tournaments:private:read"))
        throw new RemoteDataError("REMOTE_FORBIDDEN", 403);
      return <div className="container page">{children}</div>;
    });
  const user = await currentUser();
  if (!user) redirect("/login");
  const grants = await staffAccess(user);
  if (!grants.length) notFound();
  const data = await tournamentList(user);
  const writablePaths = [
    ...globalNavigation
      .filter(
        (link) =>
          link.capability &&
          (link.globalOnly
            ? permits(grants, link.capability)
            : grants.some((grant) =>
                permits(
                  [grant],
                  link.capability!,
                  grant.editionSlug ?? undefined,
                ),
              )),
      )
      .map((link) => link.href),
    ...(permits(grants, "configure_tournament")
      ? ["/admin/tournaments/new"]
      : []),
    ...(grants.some((grant) =>
      permits([grant], "manage_registrations", grant.editionSlug ?? undefined),
    )
      ? ["/admin/registrations"]
      : []),
    ...data.rows.flatMap((row) =>
      tournamentNavigation.flatMap((group) =>
        group.items
          .filter((item) =>
            item.capabilities?.some((capability) =>
              permits(grants, capability, row.slug),
            ),
          )
          .map((item) => `/admin/tournaments/${row.slug}/${item.path}`),
      ),
    ),
  ];
  const globalLinks = globalNavigation.filter(
    (link) =>
      !link.capability ||
      (link.globalOnly
        ? canRead(grants, link.capability)
        : grants.some((grant) =>
            canRead([grant], link.capability!, grant.editionSlug ?? undefined),
          )),
  );
  return (
    <StaffNavigation
      globalLinks={globalLinks}
      editions={data.rows.map(({ slug, name, status, published, links }) => ({
        slug,
        name,
        status,
        published,
        links,
      }))}
      readOnly={isDeveloper(grants)}
      writablePaths={writablePaths}
      username={user.username}
    >
      {children}
    </StaffNavigation>
  );
}
