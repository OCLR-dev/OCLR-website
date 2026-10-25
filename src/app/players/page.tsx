import { getPublicEdition } from "@/lib/content";
import { remotePage } from "@/lib/remote-page";
import { redirect } from "next/navigation";
async function Issue271Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const edition = typeof query.edition === "string" ? query.edition : "";
  if (edition && (await getPublicEdition(edition))) {
    const search = new URLSearchParams();
    for (const key of ["q", "page"])
      if (typeof query[key] === "string") search.set(key, query[key]);
    redirect(
      `/tournaments/${edition}/players${search.size ? `?${search}` : ""}`,
    );
  }
  return redirect("/tournaments");
}

export default function Page(props: Parameters<typeof Issue271Page>[0]) {
  return remotePage(() => Issue271Page(props));
}
