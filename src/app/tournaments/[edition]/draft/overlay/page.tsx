import { BroadcastDraft } from "@/components/broadcast-draft";
import { getAppTranslations } from "@/i18n/server";
import { publicBroadcastDraft } from "@/lib/broadcast";
import { getPublicEdition } from "@/lib/content";
import type { DraftBoard } from "@/lib/draft-types";
import { remotePage } from "@/lib/remote-page";
import { notFound } from "next/navigation";
import { after } from "next/server";

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return {
    title: tr("Draft broadcast"),
    robots: { index: false, follow: false },
  };
}

async function Issue271Page({
  params,
  searchParams,
}: {
  params: Promise<{ edition: string }>;
  searchParams: Promise<{ background?: string }>;
}) {
  const { edition: slug } = await params;
  const edition = await getPublicEdition(slug);
  if (!edition) notFound();
  let initial: DraftBoard | null = null;
  let available = true;
  try {
    initial = await publicBroadcastDraft(slug, after);
  } catch {
    available = false;
  }
  return (
    <BroadcastDraft
      slug={slug}
      name={edition.name}
      initial={initial}
      available={available}
      background={
        (await searchParams).background === "transparent"
          ? "transparent"
          : "opaque"
      }
    />
  );
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
