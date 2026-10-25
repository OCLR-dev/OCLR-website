import { ConfirmMutation } from "@/components/confirm-mutation";
import { TeamAvatar } from "@/components/team-avatar";
import { TeamCoachManager } from "@/components/team-coach-manager";
import { TeamEditor } from "@/components/team-editor";
import { TeamManager } from "@/components/team-manager";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireStaff } from "@/lib/auth/staff";
import { captainSetup } from "@/lib/captains";
import { remotePage } from "@/lib/remote-page";
import { staffTeams } from "@/lib/teams";
import Link from "next/link";
async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();

  return authorizedPage(async () => {
    const actor = await requireStaff();
    const { edition } = await params;
    const setup = await captainSetup(actor, edition);
    const data = await staffTeams(actor, edition);
    return (
      <>
        <PageHeading
          eyebrow={tr("PARTICIPANTS")}
          title={tr("Team management")}
        />
        {data.locked && (
          <p className="notice small" role="status">
            {tr(
              "Roster capacity is locked for the draft. Team name and avatar can still be corrected.",
            )}{" "}
            <Link
              className="text-link"
              href={`/admin/tournaments/${edition}/draft`}
            >
              {tr("Open live draft")}
            </Link>
          </p>
        )}
        {!data.locked && !data.teams.length && !setup.captains.length && (
          <section
            className="panel form-stack"
            aria-labelledby="team-setup-heading"
          >
            <h2 id="team-setup-heading">{tr("No teams yet")}</h2>
            <p className="muted small">
              {tr(
                "Appoint captains to configure teams. Players join through the draft.",
              )}
            </p>
            <div className="actions">
              <Link
                className="button"
                href={`/admin/tournaments/${edition}/captains`}
              >
                {tr("Appoint captains")}
              </Link>
              {!setup.candidates.length && (
                <Link
                  className="button secondary"
                  href={`/admin/tournaments/${edition}/registrations`}
                >
                  {tr("Review registrations")}
                </Link>
              )}
            </div>
          </section>
        )}
        <div className="stack">
          {data.teams.map((t) => (
            <article className="panel" key={t.id}>
              <div className="public-team-heading">
                <TeamAvatar team={t} />
                <h2>{t.name}</h2>
              </div>
              <p className="muted small">
                {tr("Captain osu! ID ")}
                {t.captainId} · {t.members.length} {tr(" member(s)")}
                {t.capacity
                  ? tr(" / capacity {value0}", { value0: t.capacity })
                  : ""}{" "}
                · {t.finalizedAt ? tr("finalized") : tr("not finalized")}
              </p>
              <ul>
                {t.members.map((m) => (
                  <li key={m.osuId}>
                    {m.username} ({m.osuId})
                  </li>
                ))}
              </ul>
              <div className="actions">
                <TeamEditor
                  key={`${t.id}:${data.version}`}
                  slug={edition}
                  version={data.version}
                  team={t}
                  locked={data.locked}
                />
                <ConfirmMutation
                  label={
                    t.identityPublished
                      ? tr("Hide team identity")
                      : tr("Publish team identity")
                  }
                  title={tr("Change public team visibility?")}
                  description={tr(
                    "Only publish identities approved by the organizers. Rosters remain hidden until finalized and approved separately.",
                  )}
                  url={`/api/admin/tournaments/${edition}/teams`}
                  payload={{
                    command: {
                      action: "publish",
                      teamId: t.id,
                      identityPublished: !t.identityPublished,
                      rosterPublished: false,
                    },
                    expectedVersion: data.version,

                    confirmed: true,
                  }}
                />
                {t.finalizedAt && t.identityPublished && (
                  <ConfirmMutation
                    label={
                      t.rosterPublished
                        ? tr("Hide roster")
                        : tr("Publish finalized roster")
                    }
                    title={tr("Change public roster visibility?")}
                    description={tr(
                      "This releases the finalized players’ and coaches’ osu! IDs and display names. Verify organizer approval.",
                    )}
                    url={`/api/admin/tournaments/${edition}/teams`}
                    payload={{
                      command: {
                        action: "publish",
                        teamId: t.id,
                        identityPublished: true,
                        rosterPublished: !t.rosterPublished,
                      },
                      expectedVersion: data.version,

                      confirmed: true,
                    }}
                  />
                )}
              </div>
              <TeamCoachManager
                key={`coaches:${t.id}:${data.version}`}
                slug={edition}
                version={data.version}
                teamId={t.id}
                coaches={t.coaches}
              />
            </article>
          ))}
        </div>
        {!data.locked && setup.captains.length > 0 && (
          <TeamManager
            key={data.version}
            slug={edition}
            version={data.version}
            captains={setup.captains.map((c) => {
              const t = data.teams.find((t) => t.captainId === c.userId);
              return {
                ...c,
                name: t?.name ?? "",
                capacity: t?.capacity ?? null,
              };
            })}
          />
        )}
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
