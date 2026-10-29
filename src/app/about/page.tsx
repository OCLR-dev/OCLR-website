import { Avatar } from "@/components/avatar";
import { CountryFlag } from "@/components/country-flag";
import { publicContributors } from "@/lib/contributors";
import { publicStaff } from "@/lib/public-staff";
import { getAppTranslations } from "@/i18n/server";
import { privacyContact } from "@/lib/auth/config";
import { remoteMode } from "@/lib/data-source";
import { frontendSite } from "@/lib/frontend-data";
import { organizerDirectory } from "@/lib/organizer-directory";
import { remotePage } from "@/lib/remote-page";
import Link from "next/link";
import "./organizers.css";

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Organizers") };
}

export const dynamic = "force-dynamic";
async function Issue271Page() {
  const tr = await getAppTranslations();
  const staff = await publicStaff();
  const contributors = await publicContributors();
  const contact = remoteMode()
    ? (await frontendSite()).privacyContact
    : privacyContact();
  const groups = [
    {
      id: "pooler",
      title: "Pooler",
      names: organizerDirectory.pooler,
      roles: ["mappooler"],
    },
    {
      id: "replayer",
      title: "Replayer",
      names: [],
      roles: ["replayer"],
    },
    {
      id: "tester",
      title: "Tester",
      names: organizerDirectory.tester,
      roles: ["tester"],
    },
    {
      id: "streamer",
      title: "Streamer",
      names: organizerDirectory.streamer,
      roles: ["streamer"],
    },
    {
      id: "referee",
      title: "Referee",
      names: organizerDirectory.referee,
      roles: ["referee"],
    },
    {
      id: "designer",
      title: tr("Designer"),
      names: [],
      roles: ["designer"],
    },
  ];
  function people(names: readonly string[], roles: string[]) {
    const published = staff.flatMap((person) => {
      const grants = person.roles.filter((grant) => roles.includes(grant.role));
      return grants.length ? [{ ...person, roles: grants }] : [];
    });
    return published.length ? (
      <ul className="organizer-people public-staff-list">
        {published.map((person) => (
          <li key={person.osuId}>
            <Avatar osuId={person.osuId} username={person.username} />
            <div>
              <h4>
                <a href={`https://osu.ppy.sh/users/${person.osuId}`}>
                  {person.username}
                </a>{" "}
                <CountryFlag code={person.countryCode} />
              </h4>
              {person.roles.map((grant) => (
                <p key={`${grant.role}-${grant.edition?.slug ?? "global"}`}>
                  <span className="staff-role-name">{tr(grant.role)}</span> ·{" "}
                  {grant.edition?.name ?? tr("All editions")}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ul>
    ) : process.env.NODE_ENV === "development" ? (
      <ul className="organizer-people">
        {names.map((name) => (
          <li key={name}>
            <span className="organizer-portrait" aria-hidden="true" />
            <div>
              <h4>{name}</h4>
              <p>osu! Chinese League Rookie</p>
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <p className="muted">{tr("Not announced")}</p>
    );
  }
  return (
    <div className="container page organizer-page">
      <header className="organizer-heading">
        <p className="eyebrow">osu! Chinese League Rookie</p>
        <h1 id="organizers-title">{tr("Organizers")}</h1>
      </header>
      <div className="organizer-layout">
        <aside className="organizer-sidebar">
          <nav aria-label={tr("Contents")}>
            <h2>{tr("Contents")}</h2>
            <ol>
              <li>
                <a href="#hosts">{tr("Tournament organizers")}</a>
              </li>
              <li>
                <a href="#staff">{tr("directory_staff")}</a>
                <ol>
                  {groups.map((group) => (
                    <li key={group.id}>
                      <a href={`#${group.id}`}>{group.title}</a>
                    </li>
                  ))}
                </ol>
              </li>
              <li>
                <a href="#developer">{tr("Developer")}</a>
              </li>
              <li>
                <a href="#contributors">{tr("Contributors")}</a>
              </li>
            </ol>
          </nav>
        </aside>
        <div className="organizer-directory">
          {!staff.length && process.env.NODE_ENV !== "development" && (
            <p className="muted">
              {tr(
                "OCLR is run by its community organizing team. Public staff profiles have not been announced.",
              )}
            </p>
          )}
          <section id="hosts" aria-labelledby="hosts-title">
            <h2 id="hosts-title">{tr("Tournament organizers")}</h2>
            {people(organizerDirectory.hosts, ["admin"])}
          </section>
          <section id="staff" aria-labelledby="staff-title">
            <h2 id="staff-title">{tr("directory_staff")}</h2>
            {groups.map((group) => (
              <section
                className="organizer-group"
                id={group.id}
                key={group.id}
                aria-labelledby={`${group.id}-title`}
              >
                <h3 id={`${group.id}-title`}>{group.title}</h3>
                {people(group.names, group.roles)}
              </section>
            ))}
          </section>
          <section id="developer" aria-labelledby="developer-title">
            <h2 id="developer-title">{tr("Developer")}</h2>
            {people(organizerDirectory.developer, ["developer"])}
          </section>
          <section id="contributors" aria-labelledby="contributors-title">
            <h2 id="contributors-title">{tr("Contributors")}</h2>
            {contributors.length ? (
              <ul className="organizer-people">
                {contributors.map((person) => (
                  <li key={person.osuId}>
                    <Avatar osuId={person.osuId} username={person.name} />
                    <div>
                      <h4>
                        <a href={`https://osu.ppy.sh/users/${person.osuId}`}>
                          {person.name}
                        </a>
                      </h4>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{tr("Not announced")}</p>
            )}
          </section>
          <footer className="organizer-contact">
            <div>
              <h2>{tr("Contact")}</h2>
              {contact && (
                <p>
                  <a href={contact.url}>{tr("Contact OCLR Admin on osu!")}</a>
                </p>
              )}
              <Link href="/privacy">{tr("privacy notice")}</Link>
            </div>
            <a href="#organizers-title">{tr("Back to top")} ↑</a>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return remotePage(() => Issue271Page());
}
