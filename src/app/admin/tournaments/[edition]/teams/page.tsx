import styles from "@/components/team-management.module.css";
import { StageGroups } from "@/components/stage-groups";
import { StaffReadOnlyContext } from "@/components/staff-read-only";
import { staffFixtures } from "@/lib/fixtures";
import { ConfirmMutation } from "@/components/confirm-mutation";
import { TeamAvatar } from "@/components/team-avatar";
import { TeamCoachManager } from "@/components/team-coach-manager";
import { TeamEditor } from "@/components/team-editor";
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
    const competition = await staffFixtures(actor, edition);
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
        <section
          id="groups"
          className={`form-stack ${styles.groups}`}
          aria-label={tr("Group assignments")}
        >
          <h2>{tr("Group assignments")}</h2>
          {competition.stages
            .filter((s) => s.kind === "group")
            .map((stage) => (
              <StaffReadOnlyContext
                key={`${stage.id}:${stage.version}`}
                value={!competition.canManage}
              >
                <StageGroups slug={edition} stage={stage} data={competition} />
              </StaffReadOnlyContext>
            ))}
          {!competition.stages.some((s) => s.kind === "group") && (
            <p className="muted">{tr("No Group Stage configured yet.")}</p>
          )}
        </section>
        <div className={styles.tableScroll}>
          <table className={styles.teams}>
            <caption>{tr("Team management")}</caption>
            <thead>
              <tr>
                <th scope="col">{tr("Team")}</th>
                <th scope="col">{tr("Captain")}</th>
                <th scope="col">{tr("Members")}</th>
                <th scope="col">{tr("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="public-team-heading">
                      <TeamAvatar team={t} />
                      <strong>{t.name}</strong>
                    </div>
                  </td>
                  <td>
                    <a
                      className="text-link"
                      href={`https://osu.ppy.sh/users/${t.captainId}`}
                    >
                      {t.members.find((m) => m.osuId === t.captainId)
                        ?.username ?? t.captainId}
                    </a>
                    <p className="small muted">{t.captainId}</p>
                  </td>
                  <td>
                    <span>
                      {t.members.length}
                      {t.capacity ? ` / ${t.capacity}` : ""}
                    </span>
                    <p className="small muted">
                      {t.finalizedAt ? tr("finalized") : tr("not finalized")}
                    </p>
                    <details>
                      <summary>{tr("Members")}</summary>
                      <ul>
                        {t.members.map((m) => (
                          <li key={m.osuId}>
                            {m.username} ({m.osuId})
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td>
                    <div className="actions">
                      <TeamEditor
                        key={`${t.id}:${data.version}`}
                        slug={edition}
                        version={data.version}
                        team={t}
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
                    {data.coachesEnabled !== false && (
                      <details>
                        <summary>{tr("Coaches")}</summary>
                        <TeamCoachManager
                          key={`coaches:${t.id}`}
                          slug={edition}
                          version={data.version}
                          teamId={t.id}
                          coaches={t.coaches}
                        />
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  });
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
