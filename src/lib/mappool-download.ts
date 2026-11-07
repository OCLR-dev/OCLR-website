import { z } from "zod";

/** An operator-supplied browser download link; the server never fetches it. */
export const downloadMirrorSchema = z
  .string()
  .trim()
  .max(2048)
  .regex(/^[^\s\u0000-\u001f\u007f]+$/)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !/[\s\u0000-\u001f\u007f]/.test(value)
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS download URL without credentials.");

export function safeDownloadMirror(value: unknown): string | null {
  const parsed = downloadMirrorSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type BeatmapMirror = {
  name: string;
  href: string;
  icon?: "beatconnect" | "sayobot" | "catboy" | "github";
  search?: boolean;
};

export function beatmapDownloadMirrors(
  setId: number | null | undefined,
  savedMirror: string | null | undefined,
  searchTitle?: string | null,
) {
  const knownSet = Number.isSafeInteger(setId) && setId! > 0;
  const query = searchTitle?.trim();
  const beatConnectSearch = new URL("https://beatconnect.io/");
  const sayobotSearch = new URL("https://osu.sayobot.cn/home");
  if (query && !knownSet) {
    beatConnectSearch.searchParams.set("q", query);
    sayobotSearch.searchParams.set("search", query);
  }
  const providers: BeatmapMirror[] = [
    {
      name: "BeatConnect",
      icon: "beatconnect",
      href: knownSet
        ? `https://beatconnect.io/b/${setId}`
        : beatConnectSearch.href,
      search: !knownSet,
    },
    {
      name: "Sayobot",
      icon: "sayobot",
      href: knownSet
        ? `https://dl.sayobot.cn/beatmaps/download/full/${setId}`
        : sayobotSearch.href,
      search: !knownSet,
    },
    {
      name: "Catboy",
      icon: "catboy",
      href: knownSet
        ? `https://catboy.best/d/${setId}`
        : "https://catboy.best/search",
      search: !knownSet,
    },
  ];
  const saved = safeDownloadMirror(savedMirror);
  if (!saved) return providers;
  const host = new URL(saved).hostname.replace(/^www\./, "");
  const github = host === "github.com" || host === "raw.githubusercontent.com";
  const savedOption: BeatmapMirror = providers.find(
    ({ href }) => href === saved,
  ) ?? {
    name: github ? "GitHub" : host,
    href: saved,
    icon: github ? "github" : undefined,
  };
  return [savedOption, ...providers.filter(({ href }) => href !== saved)];
}
