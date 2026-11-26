import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { Action, PageHeading } from "@/components/ui";
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

  return (
    <div className="container page auth-page">
      <PageHeading title={tr("Development role preview")}>
        {tr(
          "Switch between synthetic accounts to test tournament pages and actions with their current permissions.",
        )}
      </PageHeading>
      <section className="panel">
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
            className="grid gap-4"
          >
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
                {accounts.map((account) => {
                  const labels = [
                    ...new Set(
                      account.staff.map(({ role }) => roleLabels[role]),
                    ),
                  ];
                  if (account.captain) labels.push(tr("Captain"));
                  else if (account.teamMember) labels.push(tr("Team member"));
                  else if (account.registration === "pending")
                    labels.push(tr("Pending"));
                  else if (!labels.length) labels.push(tr("Player"));
                  return (
                    <option key={account.osuId} value={account.osuId}>
                      {labels.join(" / ")} · {account.username}
                    </option>
                  );
                })}
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
            <button className="justify-self-start" type="submit">
              {tr("Switch account")}
            </button>
          </form>
        ) : (
          <p className="notice">
            {tr("Seed the local demo database to add synthetic accounts.")}
          </p>
        )}
      </section>
      {current && (
        <div className="panel flex flex-wrap gap-2">
          <Action href={editionPath} secondary>
            {tr("Tournament overview")}
          </Action>
          <Action href="/dashboard" secondary>
            {tr("Player dashboard")}
          </Action>
          {current.staff.length > 0 && (
            <Action href="/admin" secondary>
              {tr("Staff workspace")}
            </Action>
          )}
          {current.staff.some(({ role }) => role === "streamer") && (
            <Action href="/streaming" secondary>
              {tr("Streaming")}
            </Action>
          )}
          {current.staff.some(({ role }) => role === "developer") && (
            <Action href="/developer" secondary>
              {tr("Developer")}
            </Action>
          )}
          {current.teamMember && (
            <Action href={`${editionPath}/team`} secondary>
              {tr("My team")}
            </Action>
          )}
          {current.captain && (
            <Action href={`${editionPath}/draft/captain`} secondary>
              {tr("Captain draft room")}
            </Action>
          )}
        </div>
      )}
    </div>
  );
}
