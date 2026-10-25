import { remoteMode } from "@/lib/data-source";
import { ownRegistrationForm } from "@/lib/frontend-read-models";
import { ApplicationForm } from "@/components/application-form";
import { Action, EmptyState, PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { currentUser } from "@/lib/auth/user";
import { verifyEligibility } from "@/lib/eligibility";
import {
  ownRegistrations,
  registrationAvailability,
} from "@/lib/registrations";
import { remotePage } from "@/lib/remote-page";
import { notFound } from "next/navigation";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Individual registration") };
}

async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const tr = await getAppTranslations();

  const { edition: slug } = await params;
  const user = await currentUser();
  const record =
    remoteMode() && user
      ? await ownRegistrationForm(user, slug)
      : await (
          await import("@/lib/frontend-read-models")
        ).publicEnrollment(slug);
  const edition = record?.edition;
  if (!edition) notFound();
  const availability = await registrationAvailability(edition);
  const existing = user
    ? (await ownRegistrations(user.osuId)).find((r) => r.editionSlug === slug)
    : null;
  return (
    <>
      <PageHeading title={tr("Individual registration")}>
        {tr(
          "Apply as yourself. Teams are formed later through the captain draft.",
        )}
      </PageHeading>
      {existing && existing.status !== "withdrawn" ? (
        <div className="panel">
          <h2>{tr("You have an application")}</h2>
          <p className="muted">
            {tr("Current status: ")}
            {tr(existing.status)}.
          </p>
          <Action href="/dashboard">{tr("View my application")}</Action>
        </div>
      ) : availability !== "open" ? (
        <EmptyState
          title={
            availability === "unavailable"
              ? tr("Registration temporarily unavailable")
              : tr("Registration is not open")
          }
        >
          {tr("Check the tournament overview for registration dates.")}
        </EmptyState>
      ) : !user ? (
        <div className="panel">
          <h2>{tr("Sign in before applying")}</h2>
          <p className="muted">
            {tr("Use your own osu! identity to register.")}
          </p>
          <Action href="/login">{tr("Login with osu!")}</Action>
        </div>
      ) : (
        <>
          {existing?.status === "withdrawn" && (
            <div className="notice spaced">
              <h2>{tr("Apply again")}</h2>
              <p>
                {tr(
                  "Complete the current application and applicable acknowledgments again. Previous applications and review history are retained; the new application needs a fresh review.",
                )}
              </p>
            </div>
          )}
          {edition.eligibility && (
            <section className="notice spaced">
              <h2>{tr("Eligibility")}</h2>
              <p className="preserve-lines registration-eligibility">
                {edition.eligibility}
              </p>
            </section>
          )}
          <ApplicationForm
            edition={edition}
            username={user.username}
            configurationVersion={record!.revision}
            verification={await verifyEligibility(
              user.osuId,
              edition,
              record!.revision,
            )}
            previousAttempt={
              existing?.status === "withdrawn"
                ? {
                    attempt: existing.attempt,
                    expectedUpdatedAt: existing.updatedAt.toISOString(),
                  }
                : undefined
            }
          />
        </>
      )}
    </>
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
