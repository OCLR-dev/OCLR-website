"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { LoadingOverlay } from "./loading-overlay";

function NavigationStatus() {
  const { pending } = useLinkStatus();
  return pending ? <LoadingOverlay /> : null;
}

export default function PendingLink({
  children,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <NavigationStatus />
    </Link>
  );
}
