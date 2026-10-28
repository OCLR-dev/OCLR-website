"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/** Track the RSC commit after a foreground mutation; router.refresh returns void. */
export function usePendingRefresh() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  return {
    refreshing,
    refresh: () => startTransition(() => router.refresh()),
  };
}
