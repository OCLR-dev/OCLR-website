import { getAppTranslations } from "@/i18n/server";
import { PageHeading } from "@/components/ui";
import { EditionCard } from "@/components/edition-card";
import { publicTournamentListModel } from "@/lib/public-read-models";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Tournaments") };
}

export default async function Tournaments() {
  const tr = await getAppTranslations();

  const editions = (await publicTournamentListModel()).sort((a, b) =>
    (b.season ?? b.slug).localeCompare(a.season ?? a.slug, "en", {
      numeric: true,
    }),
  );
  const current = editions.filter((e) => e.status !== "completed");
  const historical = editions.filter((e) => e.status === "completed");
  return (
    <div className="container page">
      <PageHeading title={tr("Tournaments")} />
      {editions.length ? (
        <div className="stack">
          {[
            { title: tr("Current tournaments"), rows: current },
            { title: tr("Historical seasons"), rows: historical },
          ].map(
            ({ title, rows }) =>
              rows.length > 0 && (
                <section className="stack" key={title}>
                  <h2>{title}</h2>
                  {rows.map((edition) => (
                    <EditionCard edition={edition} key={edition.slug} />
                  ))}
                </section>
              ),
          )}
        </div>
      ) : (
        <p className="muted">{tr("No tournaments announced yet.")}</p>
      )}
    </div>
  );
}
