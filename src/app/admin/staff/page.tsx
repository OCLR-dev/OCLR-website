import { StaffReadOnlyContext } from "@/components/staff-read-only";
import {
  RevokeRole,
  StaffPublicVisibility,
  StaffRoleForm,
} from "@/components/staff-role-form";
import { EmptyState, PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { permits, staffAccess } from "@/lib/auth/staff";
import { requireUser } from "@/lib/auth/user";
import { getEditionChoices } from "@/lib/content";
import { remotePage } from "@/lib/remote-page";
import { listStaffRoles } from "@/lib/staff-roles";
import { notFound } from "next/navigation";
async function Issue271Page({
  searchParams,
}: {
  searchParams: Promise<{ edition?: string }>;
}) {
  const tr = await getAppTranslations();
  const roleLabels = {
    admin: tr("Admin"),
    mappooler: tr("Mappooler"),
    tester: tr("Tester"),
    replayer: tr("Replayer"),
    referee: tr("Referee"),
    streamer: tr("Streamer"),
    designer: tr("Designer"),
    developer: tr("Developer"),
  };

  return authorizedPage(async () => {
    const actor = await requireUser();
    const access = await staffAccess(actor);
    const { grants, scopes, writeScopes } = await listStaffRoles(actor);
    const requested = (await searchParams).edition ?? "";
    const editions = (await getEditionChoices()).filter(
      (edition) => !scopes || scopes.includes(edition.slug),
    );
    const selected = editions.find(
      (e) => e.slug === requested && (!scopes || scopes.includes(e.slug)),
    );
    if (requested && !selected) notFound();
    const visible = grants.filter(
      ({ grant }) =>
        !selected ||
        grant.editionSlug === null ||
        grant.editionSlug === selected.slug,
    );
    const groups = new Map<string, typeof grants>();
    for (const row of visible.filter(({ grant }) => !grant.revokedAt)) {
      const key = `${row.grant.userId}:${row.grant.editionSlug ?? "global"}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    return (
      <>
        <PageHeading
          eyebrow={tr("ACCESS CONTROL")}
          title={tr("Staff assignments")}
        />
        <StaffRoleForm
          key={selected?.slug ?? "all"}
          initialEdition={
            selected && (!writeScopes || writeScopes.includes(selected.slug))
              ? selected.slug
              : ""
          }
          editions={editions
            .filter((e) => !scopes || scopes.includes(e.slug))
            .map((e) => ({ slug: e.slug, name: e.name }))}
          scopes={writeScopes}
        />
        <section className="spaced staff-assignments">
          <h2>{tr("Role assignments")}</h2>
          {!grants.length && (
            <EmptyState title={tr("No persistent assignments")}>
              {tr(
                "Bootstrap administrators are configured on the server and do not appear here.",
              )}
            </EmptyState>
          )}
          {[...groups].map(([key, rows]) => {
            const { grant: first, username } = rows[0];
            return (
              <article className="panel staff-role-group" key={key}>
                <header className="staff-role-identity">
                  <h3>
                    {username} · {first.userId}
                  </h3>
                  <p className="staff-role-scope">
                    <span className="muted">{tr("Scope")}</span>{" "}
                    <strong>
                      {first.editionSlug
                        ? (editions.find((e) => e.slug === first.editionSlug)
                            ?.name ?? first.editionSlug)
                        : tr("Global — all editions")}
                    </strong>
                  </p>
                </header>
                <StaffReadOnlyContext
                  value={
                    !permits(
                      access,
                      "manage_staff",
                      first.editionSlug ?? undefined,
                    )
                  }
                >
                  <section
                    className="staff-role-editor"
                    aria-label={`${tr("Edit roles")} · ${username} · ${first.userId}`}
                  >
                    <h4>{tr("Edit roles")}</h4>
                    <StaffRoleForm
                      scopes={writeScopes}
                      editions={editions.map((e) => ({
                        slug: e.slug,
                        name: e.name,
                      }))}
                      existing={{
                        userId: first.userId,
                        editionSlug: first.editionSlug,
                        grants: rows.map(({ grant }) => ({
                          id: grant.id,
                          role: grant.role,
                        })),
                      }}
                    />
                  </section>
                  <section
                    className="staff-role-publication"
                    aria-label={tr("About visibility and revocation")}
                  >
                    <h4>{tr("About visibility and revocation")}</h4>
                    <p className="muted staff-role-help">
                      {tr(
                        "These actions apply to saved roles independently of the role selection above.",
                      )}
                    </p>
                    {rows.map(({ grant: g }) => (
                      <div className="staff-role-row" key={g.id}>
                        <div className="staff-role-row-info">
                          <strong>{roleLabels[g.role]}</strong>
                          <p className="muted">
                            {tr("About:")}{" "}
                            {g.aboutPublished
                              ? !g.editionSlug ||
                                editions.some(
                                  (e) =>
                                    e.slug === g.editionSlug && e.published,
                                )
                                ? tr("Public")
                                : tr("Hidden until tournament publication")
                              : tr("Private")}
                          </p>
                        </div>
                        <div className="staff-role-actions">
                          <StaffPublicVisibility
                            id={g.id}
                            username={username}
                            role={g.role}
                            scope={g.editionSlug}
                            published={g.aboutPublished}
                          />
                          <RevokeRole
                            id={g.id}
                            username={username}
                            role={g.role}
                            scope={g.editionSlug}
                          />
                        </div>
                      </div>
                    ))}
                  </section>
                </StaffReadOnlyContext>
              </article>
            );
          })}
          {visible
            .filter(({ grant }) => grant.revokedAt)
            .map(({ grant: g, username }) => (
              <article className="panel spaced" key={g.id}>
                <h3>
                  {username} · {g.userId}
                </h3>
                <p>
                  {g.role} · {g.editionSlug ?? tr("Global")} ·{" "}
                  {g.revokedAt ? tr("Revoked") : tr("Active")}
                </p>
                <p className="small muted">
                  {tr("About:")}{" "}
                  {g.aboutPublished && !g.revokedAt
                    ? !g.editionSlug ||
                      editions.some(
                        (e) => e.slug === g.editionSlug && e.published,
                      )
                      ? tr("Public")
                      : tr("Hidden until tournament publication")
                    : tr("Private")}
                </p>
                <p className="muted small">
                  {tr("Granted by osu! ID ")}
                  {g.grantedBy} {tr(" on")} {g.grantedAt.toISOString()}
                </p>
              </article>
            ))}
        </section>
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
