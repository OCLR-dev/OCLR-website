import { historicalPage } from "@/components/historical-archive";
import { getAppTranslations } from "@/i18n/server";
import { remotePage } from "@/lib/remote-page";
import { notFound } from "next/navigation";

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Staff") };
}

async function Issue271Page({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const { edition } = await params;
  const page = await historicalPage(edition, "staff");
  if (!page) notFound();
  return page;
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
