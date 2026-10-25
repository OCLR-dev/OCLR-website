import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { formatDate } from "@/lib/editions";
import { publicNewsItem } from "@/lib/public-news";
import { publicNewsKind } from "@/lib/public-news-model";
import { remotePage } from "@/lib/remote-page";
import Link from "next/link";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const tr = await getAppTranslations();
  const { slug } = await params;
  const item = await publicNewsItem(slug, undefined, tr);
  return {
    title: item?.title ?? tr("Announcement"),
    description: item?.summary,
  };
}
async function Issue271Page({ params }: { params: Promise<{ slug: string }> }) {
  const tr = await getAppTranslations();

  const { slug } = await params;
  const item = await publicNewsItem(slug, undefined, tr);
  if (!item) notFound();
  return (
    <article className="container page prose">
      <Link href="/news" className="context-link">
        {tr("← All announcements")}
      </Link>
      <div className="spaced">
        <p className="eyebrow news-kind">{publicNewsKind(item, tr)}</p>
        <PageHeading
          eyebrow={`${item.future ? tr("Scheduled for ") : ""}${tr(formatDate(item.at, item.timeZone, tr.locale))}`}
          title={item.title}
        >
          {item.summary}
        </PageHeading>
      </div>
      {item.source && (
        <p>
          <Link className="button secondary" href={item.source.url}>
            {tr("View ")}
            {item.source.label}
          </Link>
        </p>
      )}
      {item.sections.map((s, i) => (
        <section key={i}>
          <h2>{s.heading}</h2>
          <p className="preserve-lines">{s.body}</p>
        </section>
      ))}
    </article>
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
