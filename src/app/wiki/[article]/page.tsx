import { WikiDocument } from "@/components/wiki-document";
import { getAppTranslations } from "@/i18n/server";
import { remotePage } from "@/lib/remote-page";
import { wikiArticles } from "@/lib/wiki-articles";
import { notFound } from "next/navigation";
type Props = { params: Promise<{ article: string }> };
async function findArticle(slug: string) {
  const tr = await getAppTranslations();
  return wikiArticles(tr).find(
    (item) => item.slug === slug && slug !== "introduction",
  );
}
export async function generateMetadata({ params }: Props) {
  const article = await findArticle((await params).article);
  const tr = await getAppTranslations();
  return {
    title: article ? `${article.title} · ${tr("OCLR Wiki")}` : tr("OCLR Wiki"),
  };
}
async function Issue271Page({ params }: Props) {
  const article = await findArticle((await params).article);
  if (!article) notFound();
  return <WikiDocument article={article} />;
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
