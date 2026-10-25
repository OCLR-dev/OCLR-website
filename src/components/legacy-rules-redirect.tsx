"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { rulesRedirectHref } from "@/lib/rules-navigation";

/** Fragments are browser-only, so retain chapter links before leaving the old route. */
export function LegacyRulesRedirect({
  base,
  anchors,
}: {
  base: string;
  anchors: Record<string, string>;
}) {
  const tr = useAppTranslations();
  const fallback = `${base}#rules`;
  useEffect(() => {
    window.location.replace(
      rulesRedirectHref(base, window.location.hash, anchors),
    );
  }, [base, anchors]);
  return (
    <>
      <p>
        <Link href={fallback}>{tr("Read the rules")}</Link>
      </p>
      <noscript>
        <meta httpEquiv="refresh" content={`0;url=${fallback}`} />
      </noscript>
    </>
  );
}
