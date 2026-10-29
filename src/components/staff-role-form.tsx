"use client";
import { ReadOnlyFields } from "./staff-read-only";
import { useAppTranslations } from "@/i18n/shared";

import { useId, useState } from "react";
import { ConfirmMutation } from "./confirm-mutation";
type EditableRoles = {
  userId: number;
  editionSlug: string | null;
  grants: { id: string; role: string }[];
};
const roleOptions = [
  ["mappooler", "Mappooler"],
  ["tester", "Tester"],
  ["replayer", "Replayer"],
  ["referee", "Referee"],
  ["streamer", "Streamer"],
  ["designer", "Designer"],
  ["developer", "Developer"],
  ["admin", "Admin"],
] as const;
type StaffRoleFormProps = {
  editions: { slug: string; name: string }[];
  scopes: string[] | null;
  initialEdition?: string;
  existing?: EditableRoles;
};
export function StaffRoleForm(props: StaffRoleFormProps) {
  const tr = useAppTranslations();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  return (
    <ReadOnlyFields>
      <div className={`staff-role-form${props.existing ? "" : " panel"}`}>
        <StaffRoleFields
          key={props.existing?.grants
            .map((g) => g.id)
            .sort()
            .join(",")}
          {...props}
          saved={saved}
          onEdit={() => {
            setSaved(false);
            setError("");
          }}
          onSaved={() => {
            setSaved(true);
            setError("");
          }}
          onError={setError}
        />
        {error && (
          <p role="alert" className="notice error-text">
            {tr(error)}
          </p>
        )}
      </div>
    </ReadOnlyFields>
  );
}
function StaffRoleFields({
  editions,
  scopes,
  initialEdition = "",
  existing,
  saved,
  onEdit,
  onSaved,
  onError,
}: StaffRoleFormProps & {
  saved: boolean;
  onEdit: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const tr = useAppTranslations();
  const id = useId();
  const [userId, setUserId] = useState(existing ? String(existing.userId) : "");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    existing?.grants.map((g) => g.role) ?? ["mappooler"],
  );
  const [scope, setScope] = useState(
    existing
      ? (existing.editionSlug ?? "")
      : initialEdition || scopes?.[0] || "",
  );
  const unchanged =
    existing &&
    [...selectedRoles].sort().join(",") ===
      existing.grants
        .map((g) => g.role)
        .sort()
        .join(",");
  const scopeName = scope
    ? (editions.find((edition) => edition.slug === scope)?.name ?? scope)
    : tr("Global — all editions");
  const roleNames = (roles: string[]) =>
    roleOptions
      .filter(([role]) => roles.includes(role))
      .map(([, label]) => tr(label))
      .join(" / ") || tr("None");
  return (
    <div className="staff-role-fields">
      {!existing && <h2>{tr("Grant a role")}</h2>}
      {!existing && (
        <>
          <p className="muted staff-role-help">
            {tr(
              "The user must have signed in. Verify their osu! ID before granting access.",
            )}
          </p>
          <div className="staff-role-targets">
            <label className="field">
              <span>{tr("Verified osu! user ID")}</span>
              <input
                inputMode="numeric"
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value);
                  onEdit();
                }}
                maxLength={16}
              />
            </label>
            <label className="field">
              <span id={`${id}-scope`}>{tr("Scope")}</span>
              <select
                aria-labelledby={`${id}-scope`}
                value={scope}
                onChange={(e) => {
                  onEdit();
                  setScope(e.target.value);
                  if (e.target.value)
                    setSelectedRoles((roles) =>
                      roles.filter((role) => role !== "developer"),
                    );
                }}
              >
                {!scopes && (
                  <option value="">{tr("Global — all editions")}</option>
                )}
                {editions
                  .filter((e) => !scopes || scopes.includes(e.slug))
                  .map((e) => (
                    <option key={e.slug} value={e.slug}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </>
      )}
      {existing && (
        <p className="staff-saved-roles">
          <span className="muted">{tr("Saved roles")}</span>{" "}
          <strong>{roleNames(existing.grants.map((g) => g.role))}</strong>
        </p>
      )}
      <fieldset className="staff-role-options">
        <legend>{tr("Roles (select multiple)")}</legend>
        <div className="staff-role-grid">
          {roleOptions
            .filter(([role]) => role !== "developer" || (!scopes && !scope))
            .map(([role, label]) => (
              <label
                key={role}
                className={
                  role === "developer" || role === "admin"
                    ? "staff-role-option staff-role-option-detailed"
                    : "staff-role-option"
                }
              >
                <input
                  type="checkbox"
                  value={role}
                  aria-label={tr(label)}
                  aria-describedby={
                    role === "developer" || role === "admin"
                      ? `${id}-${role}`
                      : undefined
                  }
                  checked={selectedRoles.includes(role)}
                  onChange={(e) => {
                    onEdit();
                    setSelectedRoles((current) =>
                      e.target.checked
                        ? [...current, role]
                        : current.filter((item) => item !== role),
                    );
                  }}
                />
                <span>
                  <span className="staff-role-option-name">{tr(label)}</span>
                  {(role === "developer" || role === "admin") && (
                    <span
                      id={`${id}-${role}`}
                      className="staff-role-option-description muted"
                    >
                      {role === "developer"
                        ? tr(
                            "Global read-only access. Requires an explicit Developer grant.",
                          )
                        : tr("Full access within the selected scope.")}
                    </span>
                  )}
                </span>
              </label>
            ))}
        </div>
      </fieldset>
      {selectedRoles.includes("developer") && (
        <p className="notice">
          {tr(
            "Developer can read private applications and unpublished editions. Other roles retain their existing write permissions and export access within scope.",
          )}
        </p>
      )}
      <div className="staff-role-submit">
        <p
          role="status"
          className={
            saved
              ? "staff-role-status staff-role-success"
              : "staff-role-status muted"
          }
        >
          {saved
            ? tr("Roles saved.")
            : existing
              ? unchanged
                ? tr("No unsaved changes.")
                : tr("Unsaved changes. Review and confirm to apply.")
              : tr("Review and confirm to apply.")}
        </p>
        <ConfirmMutation
          className="staff-role-save"
          label={existing ? tr("Save roles") : tr("Review role grant")}
          title={
            existing ? tr("Update staff roles?") : tr("Grant staff access?")
          }
          description={tr(
            "Set roles for osu! ID {userId} in {scope} to: {roles}. Other scopes and retained roles’ public visibility stay unchanged.",
            {
              userId,
              scope: scopeName,
              roles: roleNames(selectedRoles),
            },
          )}
          disabled={
            Boolean(unchanged) ||
            saved ||
            !/^[1-9]\d*$/.test(userId) ||
            !Number.isSafeInteger(Number(userId)) ||
            Boolean(scopes && !scopes.includes(scope)) ||
            (!existing && !selectedRoles.length)
          }
          url="/api/admin/staff"
          onSuccess={onSaved}
          onError={onError}
          payload={{
            action: "set_roles",
            userId: Number(userId),
            roles: selectedRoles,
            editionSlug: scope || null,
            expectedGrantIds: existing?.grants.map((g) => g.id) ?? [],
            confirmed: true,
          }}
        />
      </div>
    </div>
  );
}
export function RevokeRole({
  id,
  username,
  role,
  scope,
}: {
  id: string;
  username: string;
  role: string;
  scope: string | null;
}) {
  const tr = useAppTranslations();

  return (
    <ConfirmMutation
      className="secondary role-revoke"
      label={tr("Revoke role")}
      title={tr("Revoke staff access?")}
      description={tr(
        "Remove {value0}'s {value1} role for {value2}. Other grants remain active. This applies to existing sessions on the next authorization check.",
        { value0: username, value1: role, value2: scope ?? "all editions" },
      )}
      url="/api/admin/staff"
      payload={{ action: "revoke", grantId: id, confirmed: true }}
    />
  );
}

export function StaffPublicVisibility({
  id,
  username,
  role,
  scope,
  published,
}: {
  id: string;
  username: string;
  role: string;
  scope: string | null;
  published: boolean;
}) {
  const tr = useAppTranslations();

  return (
    <ConfirmMutation
      label={published ? tr("Hide from About") : tr("Show on About")}
      title={tr("Show staff profile on About?")}
      description={tr(
        "Publish {value0}'s osu! username, avatar/profile link and {value1} role for {value2}. Edition-scoped roles appear only while that tournament is public. Other private grants stay hidden.",
        { value0: username, value1: role, value2: scope ?? "all editions" },
      )}
      url="/api/admin/staff"
      requireConfirmation={!published}
      payload={{
        action: "visibility",
        grantId: id,
        published: !published,
        expectedPublished: published,
        confirmed: true,
      }}
    />
  );
}
