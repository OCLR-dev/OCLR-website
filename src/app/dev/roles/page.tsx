import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/ui";
import Link from "@/components/pending-link";
import styles from "@/components/role-preview.module.css";
import { getAppTranslations } from "@/i18n/server";
import { localRolePreviewAccountsWithRoles } from "@/lib/auth/local-role-preview";
import {
  localRolePreviewCookie,
  localRolePreviewKey,
} from "@/lib/auth/local-role-preview-config";
import { readSession } from "@/lib/auth/sessions";
import {
  demoEdition,
  localRolePreviewAction,
} from "@/lib/local-role-preview-model";

export const metadata = { robots: { index: false, follow: false } };

export default async function DevelopmentRoles({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const key = localRolePreviewKey((await headers()).get("host"));
  if (!key) notFound();
  const token = (await cookies()).get(localRolePreviewCookie)?.value;
  const [tr, accounts, active, { error }] = await Promise.all([
    getAppTranslations(),
    localRolePreviewAccountsWithRoles(),
    readSession(token, key),
    searchParams,
  ]);
  const current = accounts.find((account) => account.osuId === active?.osuId);
  const editionPath = `/tournaments/${demoEdition}`;
  const roleLabels = {
    admin: tr("Admin"),
    mappooler: tr("Mappooler"),
    referee: tr("Referee"),
    developer: tr("Developer"),
    streamer: tr("Streamer"),
    tester: tr("Tester"),
    replayer: tr("Replayer"),
    designer: tr("Designer"),
    commentator: tr("Commentator"),
    mapper: tr("mapper"),
  };

  const groups = {
    staff: [],
    captains: [],
    members: [],
    players: [],
  } as Record<"staff" | "captains" | "members" | "players", typeof accounts>;
  for (const account of accounts) {
    if (account.staff.length) groups.staff.push(account);
    else if (account.captain) groups.captains.push(account);
    else if (account.teamMember) groups.members.push(account);
    else groups.players.push(account);
  }
  const accountGroups = [
    { label: tr("Staff"), members: groups.staff },
    { label: tr("Captain"), members: groups.captains },
    { label: tr("Team member"), members: groups.members },
    { label: tr("Player"), members: groups.players },
  ];

  const playerWorkspace =
    current?.captain || current?.registration === "accepted";
  const shortcuts = [
    { href: editionPath, label: tr("Tournament overview") },
    { href: "/dashboard", label: tr("Player dashboard") },
    {
      href: "/admin",
      label: tr("Staff workspace"),
      visible: Boolean(current?.staff.length),
    },
    {
      href: "/streaming",
      label: tr("Streaming"),
      visible: current?.staff.some(({ role }) => role === "streamer") ?? false,
    },
    {
      href: "/developer",
      label: tr("Developer"),
      visible: current?.staff.some(({ role }) => role === "developer") ?? false,
    },
    {
      href: `${editionPath}/team`,
      label: tr("My team"),
      visible: current?.captain ?? false,
    },
    {
      href: `${editionPath}/draft/captain`,
      label: tr("Captain draft room"),
      visible: current?.captain ?? false,
    },
    {
      href: `${editionPath}/player/practice`,
      label: tr("My practice"),
      visible: playerWorkspace,
    },
    {
      href: `${editionPath}/player/availability`,
      label: tr("My availability"),
      visible: playerWorkspace,
    },
  ];

  return (
    <div className={`container page auth-page ${styles.page}`}>
      <PageHeading title={tr("Development role preview")}>
        {tr(
          "Switch between synthetic accounts to test tournament pages and actions with their current permissions.",
        )}
      </PageHeading>
      <section className={`panel ${styles.picker}`}>
        {error === "access" && (
          <p className="notice" role="alert">
            {tr("Enter the local access code to start a role preview.")}
          </p>
        )}
        {error === "account" && (
          <p className="notice" role="alert">
            {tr(
              "That synthetic account is unavailable. Choose another account.",
            )}
          </p>
        )}
        {accounts.length ? (
          <form
            action={localRolePreviewAction}
            method="post"
            className={styles.form}
          >
            <div className={styles.fields}>
              <label>
                {tr("Synthetic account")}
                <select
                  name="account"
                  required
                  defaultValue={current?.osuId ?? ""}
                >
                  <option value="" disabled>
                    {tr("Choose an account")}
                  </option>
                  {accountGroups
                    .filter(({ members }) => members.length > 0)
                    .map(({ label, members }) => (
                      <optgroup key={label} label={label}>
                        {members.map((account) => {
                          const labels = [
                            ...new Set(
                              account.staff.map(({ role }) => roleLabels[role]),
                            ),
                          ];
                          if (account.captain) labels.push(tr("Captain"));
                          else if (account.teamMember)
                            labels.push(tr("Team member"));
                          else if (account.registration === "pending")
                            labels.push(tr("Pending"));
                          else if (!labels.length) labels.push(tr("Player"));
                          return (
                            <option key={account.osuId} value={account.osuId}>
                              {labels.join(" / ")} · {account.username}
                            </option>
                          );
                        })}
                      </optgroup>
                    ))}
                </select>
              </label>
              {!active && (
                <label>
                  {tr("Local access code")}
                  <input
                    name="code"
                    type="password"
                    autoComplete="off"
                    required
                    maxLength={43}
                  />
                </label>
              )}
            </div>
            <button type="submit">{tr("Switch account")}</button>
          </form>
        ) : (
          <p className="notice">
            {tr("Seed the local demo database to add synthetic accounts.")}
          </p>
        )}
      </section>
      {current && (
        <nav
          className={styles.links}
          aria-label={tr("Development role preview")}
        >
          {shortcuts
            .filter(({ visible }) => visible !== false)
            .map(({ href, label }) => (
              <Link className={styles.shortcut} key={href} href={href}>
                {label}
                <span aria-hidden="true">›</span>
              </Link>
            ))}
        </nav>
      )}
    </div>
  );
}
