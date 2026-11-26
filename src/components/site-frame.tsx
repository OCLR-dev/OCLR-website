"use client";
/* eslint-disable @next/next/no-css-tags -- React 19 stylesheet resources block route paint until the shared page styles are loaded. */
import { usePathname, useSearchParams } from "next/navigation";
import type { ChatEdition } from "@/lib/chat-edition";
import type { User } from "@/lib/auth/sessions";
import { SiteLiruChat } from "./liru-chat-launcher";
import type { ReactNode } from "react";
import { isPublicPage, isBroadcastPage } from "@/lib/public-navigation";
export function SiteFrame({
  children,
  chatEditions,
  chatViewer,
}: {
  children: ReactNode;
  chatEditions: readonly ChatEdition[];
  chatViewer: User | null;
}) {
  const path = usePathname() ?? "/";
  const query = useSearchParams();
  const presenter = query?.get("presenter") === "1";
  const broadcast = isBroadcastPage(path, presenter);
  const publicPage = isPublicPage(path, presenter);
  return (
    <>
      {path !== "/" && (
        <link
          rel="stylesheet"
          href="/appearance-styles/pages.css"
          precedence="site-pages"
        />
      )}
      <div
        className={`site-shell ${broadcast ? "broadcast-site" : "themed-site"} ${publicPage ? "public-site" : "private-site"}`}
      >
        {children}
        <SiteLiruChat
          path={path}
          query={query}
          editions={chatEditions}
          viewer={chatViewer}
        />
      </div>
    </>
  );
}
