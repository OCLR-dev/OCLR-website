import { remoteMode } from "@/lib/data-source";
import RemotePage from "@/app/remote/page";
import { getAppTranslations } from "@/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authReady } from "@/lib/auth/config";
import { currentUser } from "@/lib/auth/user";
import { PageHeading } from "@/components/ui";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Login with osu!") };
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; loggedOut?: string }>;
}) {
  if (remoteMode()) return <RemotePage />;
  const tr = await getAppTranslations();

  if (await currentUser()) redirect("/dashboard");
  const params = await searchParams;
  return (
    <div className="container page auth-page">
      <PageHeading
        eyebrow={tr("YOUR OCLR IDENTITY")}
        title={tr("One account. Your stage.")}
      >
        {tr("Sign in securely with your existing osu! account.")}
      </PageHeading>
      <section className="panel">
        {params.error && (
          <p role="alert" className="notice">
            {params.error === "declined"
              ? tr(
                  "You declined osu! authorization. You can try again whenever you are ready.",
                )
              : tr(
                  "Sign-in could not be completed or the request expired. Please start again.",
                )}
          </p>
        )}
        {params.loggedOut && (
          <p role="status" className="notice">
            {tr("You have signed out.")}
          </p>
        )}
        <h2>{tr("Login with osu!")}</h2>
        <p className="muted">
          {tr(
            "We use your stable osu! ID and display name to link your applications. Signing in does not register you for a tournament.",
          )}
        </p>
        {authReady() ? (
          <a className="button" href="/auth/osu">
            {tr("Continue with osu!")}
          </a>
        ) : (
          <p className="notice">
            {tr(
              "osu! sign-in is awaiting secure configuration. Please return later.",
            )}
          </p>
        )}
        <p className="muted small spaced">
          {tr("Read our")}{" "}
          <Link className="text-link" href="/privacy">
            {tr("privacy notice")}
          </Link>{" "}
          {tr("before continuing.")}
        </p>
      </section>
    </div>
  );
}
