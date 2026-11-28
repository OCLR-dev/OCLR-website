import styles from "@/components/team-management.module.css";
import { StageGroups } from "@/components/stage-groups";
import { StaffReadOnlyContext } from "@/components/staff-read-only";
import { staffFixtures } from "@/lib/fixture-reads";
import { ConfirmMutation } from "@/components/confirm-mutation";
import { TeamAvatar } from "@/components/team-avatar";
import { TeamCoachManager } from "@/components/team-coach-manager";
import { TeamEditor } from "@/components/team-editor";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireStaff } from "@/lib/auth/staff-request";
import { captainSetup } from "@/lib/captain-reads";
import { remotePage } from "@/lib/remote-page";
import { staffTeams } from "@/lib/team-reads";
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
    const teamAvatars = new Map(
      data.teams.map((team) => [team.id, team.avatarKey]),
    );
    const groupTeams = competition.teams.map((team) => ({
      ...team,
      avatarKey: teamAvatars.get(team.id),
    }));
    const hasUnpublishedTeams = data.teams.some(
      (team) => !team.identityPublished,
    );
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
                <StageGroups
                  slug={edition}
                  stage={stage}
                  data={{ teams: groupTeams }}
                  scheduling={{
                    rounds: competition.rounds
                      .filter(({ round }) => round.stageId === stage.id)
                      .map(({ round: { id, name } }) => ({ id, name })),
                    timeZone: competition.timeZone,
                  }}
                />
              </StaffReadOnlyContext>
            ))}
          {!competition.stages.some((s) => s.kind === "group") && (
            <p className="muted">{tr("No Group Stage configured yet.")}</p>
          )}
        </section>
        <div className={styles.tableHeading}>
          <div className={styles.headingTitle}>
            <h2 id="team-management-table-heading">{tr("Team management")}</h2>
            <span className="badge">{data.teams.length}</span>
          </div>
          {hasUnpublishedTeams && (
            <ConfirmMutation
              loadingFeedback="button"
              label={tr("Publish all team identities")}
              title={tr("Publish all team identities?")}
              description={tr(
                "Each team’s captain must already be public. Rosters require separate approval.",
              )}
              url={`/api/admin/tournaments/${edition}/teams`}
              payload={{
                command: { action: "publish_all_identities" },
                expectedVersion: data.version,
                confirmed: true,
              }}
            />
          )}
        </div>
        <div className={styles.tableScroll}>
          <table
            className={styles.teams}
            role="table"
            aria-labelledby="team-management-table-heading"
          >
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">
                  {tr("Team")}
                </th>
                <th role="columnheader" scope="col">
                  {tr("Captain")}
                </th>
                <th role="columnheader" scope="col">
                  {tr("Members")}
                </th>
                <th role="columnheader" scope="col">
                  {tr("Actions")}
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {data.teams.map((t) => (
                <tr key={t.id} role="row">
                  <td role="cell">
                    <div className="public-team-heading">
                      <TeamAvatar team={t} />
                      <div className={styles.teamIdentity}>
                        <strong>{t.name}</strong>
                        <span
                          className={styles.visibility}
                          data-public={t.identityPublished}
                        >
                          {t.identityPublished
                            ? tr("Published")
                            : tr("Unpublished")}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td role="cell">
                    <span className={styles.mobileLabel} aria-hidden="true">
                      {tr("Captain")}
                    </span>
                    <a
                      className="text-link"
                      href={`https://osu.ppy.sh/users/${t.captainId}`}
                    >
                      {t.members.find((m) => m.osuId === t.captainId)
                        ?.username ?? t.captainId}
                    </a>
                    <small className={styles.caption}>
                      {tr("osu! ID ")}
                      {t.captainId}
                    </small>
                  </td>
                  <td role="cell">
                    <details className={styles.roster}>
                      <summary>
                        {tr("Members")}{" "}
                        <strong>
                          {t.members.length}
                          {t.capacity ? ` / ${t.capacity}` : ""}
                        </strong>
                      </summary>
                      <ul>
                        {t.members.map((m) => (
                          <li key={m.osuId}>
                            {m.username} ({m.osuId})
                          </li>
                        ))}
                      </ul>
                    </details>
                    <small className={styles.caption}>
                      {t.rosterPublished
                        ? tr("Published roster")
                        : t.finalizedAt
                          ? tr("finalized")
                          : tr("not finalized")}
                    </small>
                  </td>
                  <td role="cell">
                    <div className="actions">
                      <TeamEditor
                        key={`${t.id}:${data.version}`}
                        slug={edition}
                        version={data.version}
                        team={t}
                      />
                      <ConfirmMutation
                        loadingFeedback="button"
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
                          loadingFeedback="button"
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
