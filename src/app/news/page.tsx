import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { formatDate } from "@/lib/editions";
import { publicNews } from "@/lib/public-news";
import { publicNewsKind } from "@/lib/public-news-model";
import { remotePage } from "@/lib/remote-page";
import Link from "next/link";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("News & announcements") };
}

async function Issue271Page() {
  const tr = await getAppTranslations();

  const announcements = await publicNews(undefined, tr);
  return (
    <div className="container page">
      <PageHeading title={tr("News & announcements")} />
      {announcements.length ? (
        <div className="news-list">
          {announcements.map((a) => (
            <article key={a.slug}>
              <div>
                <p className="eyebrow news-kind">{publicNewsKind(a, tr)}</p>
                <p className="muted small">
                  {a.future ? tr("Scheduled for ") : ""}
                  {tr(formatDate(a.at, a.timeZone, tr.locale))}
                </p>
              </div>
              <div>
                <h2>
                  <Link className="news-headline" href={`/news/${a.slug}`}>
                    {a.title}
                  </Link>
                </h2>
                <p className="muted">{a.summary}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">{tr("No announcements yet.")}</p>
      )}
    </div>
  );
}

export default function Page() {
  return remotePage(() => Issue271Page());
}
