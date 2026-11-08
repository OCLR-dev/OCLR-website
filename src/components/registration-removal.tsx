"use client";

import type { RegistrationParticipationInput } from "@/lib/registration-write-contract";
import Link from "next/link";
import { useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { ConfirmMutation } from "./confirm-mutation";

export function RegistrationRemoval({
  id,
  slug,
  tournament,
  username,
  osuId,
  status,
  updatedAt,
  staffRemoved,
}: {
  id: string;
  slug: string;
  tournament: string;
  username: string;
  osuId: number;
  status: "pending" | "deferred" | "accepted" | "rejected" | "withdrawn";
  updatedAt: string;
  staffRemoved: boolean;
}) {
  const tr = useAppTranslations();
  const [blocked, setBlocked] = useState(false);
  if (status === "withdrawn" && !staffRemoved) return null;
  const restore = status === "withdrawn";
  return (
    <section
      className="registration-removal spaced"
      aria-label={tr("Registration management")}
    >
      <ConfirmMutation
        key={updatedAt}
        className={restore ? "secondary" : "secondary destructive-action"}
        label={restore ? tr("Restore for review") : tr("Remove registration")}
        title={
          restore
            ? tr("Restore this registration for review?")
            : tr("Remove this registration?")
        }
        description={
          restore
            ? tr(
                "Restore as Pending. This does not accept the player or record new player acknowledgments.",
              )
            : tr(
                "Withdraw this tournament registration administratively, preserving application and review history. The osu! account is not deleted. Restore for review is a separate action.",
              )
        }
        url={`/api/admin/tournaments/${slug}/registrations/${id}/${restore ? "restore" : "remove"}`}
        payload={
          {
            expectedUpdatedAt: updatedAt,
            confirmed: true,
          } satisfies RegistrationParticipationInput
        }
        onError={(message) =>
          setBlocked(
            message.startsWith("Resolve this player's") ||
              message.startsWith("This player belongs to a protected"),
          )
        }
      >
        <dl className="detail-list">
          <div>
            <dt>{tr("Player")}</dt>
            <dd>
              {username} · {tr("osu! ID ")}
              {osuId}
            </dd>
          </div>
          <div>
            <dt>{tr("Tournament")}</dt>
            <dd>{tournament}</dd>
          </div>
          <div>
            <dt>{tr("Status")}</dt>
            <dd>{tr(status)}</dd>
          </div>
        </dl>
        {blocked && (
          <div className="actions">
            <Link
              className="context-link"
              href={`/admin/tournaments/${slug}/captains`}
            >
              {tr("Captains")}
            </Link>
            <Link
              className="context-link"
              href={`/admin/tournaments/${slug}/teams`}
            >
              {tr("Players & teams")}
            </Link>
            <Link
              className="context-link"
              href={`/admin/tournaments/${slug}/draft`}
            >
              {tr("Live draft")}
            </Link>
          </div>
        )}
      </ConfirmMutation>
    </section>
  );
}
