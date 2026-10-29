"use client";

import type { ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { ProfileInfo } from "./profile-info";

/** Supplemental explanation. Keep errors, consent and action-critical status visible. */
export function InfoNote({ children }: { children: ReactNode }) {
  const tr = useAppTranslations();
  return <ProfileInfo label={tr("Notes")}>{children}</ProfileInfo>;
}
