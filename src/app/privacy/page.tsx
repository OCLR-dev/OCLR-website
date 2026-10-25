import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { privacyContact } from "@/lib/auth/config";
import { remoteMode } from "@/lib/data-source";
import { frontendSite } from "@/lib/frontend-data";
import { remotePage } from "@/lib/remote-page";
import styles from "./privacy.module.css";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Privacy") };
}

async function Issue271Page() {
  const tr = await getAppTranslations();
  const contact = remoteMode()
    ? (await frontendSite()).privacyContact
    : privacyContact();
  return (
    <div className={`container page prose ${styles.page}`}>
      <PageHeading title={tr("Privacy at OCLR")} />
      <h2>{tr("Your data")}</h2>
      <p>
        {tr(
          "We store your osu! ID, display name, a login session and tournament applications (answers, acknowledgments, status and dates). We never receive your osu! password or keep OAuth tokens.",
        )}
      </p>
      <h2>{tr("Public and private information")}</h2>
      <p>
        {tr(
          "Accepted players appear in the published tournament’s Players directory with their osu! identity and participation status. Pending, rejected and withdrawn applications stay unlisted. Answers, contact details and staff notes remain private to authorized staff. Captain appointments, teams and finalized rosters require a separate release.",
        )}
      </p>
      <p>
        {tr(
          "Public profiles may show cached osu! statistics with their update time. Released mappools and approved, published results are public. Staff review imports and game scores privately; administrative changes are audited.",
        )}
      </p>
      <p>
        {tr(
          "An explicitly designated self introduction is public after application acceptance; other questionnaire answers remain private. Signed player messages are public and identify the authenticated author's osu! account.",
        )}
      </p>
      <h2>{tr("Cookies and external services")}</h2>
      <p>
        {tr(
          "Essential sign-in sessions expire after seven days. Language and appearance preferences last up to one year. Avatars and beatmap covers load from osu! image services. We use no advertising or analytics cookies.",
        )}
      </p>
      {contact ? (
        <p>
          {tr("For access, correction or deletion requests:")}{" "}
          <a className="text-link" href={contact.url}>
            {tr("Contact OCLR Admin on osu!")}
          </a>
        </p>
      ) : (
        <p className="notice">
          {tr("Public contact details have not been announced.")}
        </p>
      )}
    </div>
  );
}

export default function Page() {
  return remotePage(() => Issue271Page());
}
