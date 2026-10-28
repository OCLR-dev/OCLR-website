"use client";
import { useAppTranslations } from "@/i18n/shared";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoadingRegion } from "./loading-region";
import { WorkspaceTabs } from "./workspace-tabs";

export function AuditModuleTabs({
  value,
  query,
  items,
}: {
  value: string;
  query: string;
  items: { value: string; label: string }[];
}) {
  const tr = useAppTranslations();

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="audit-module-tabs" aria-busy={pending}>
      {pending && <LoadingRegion scope=".audit-workspace" />}
      <WorkspaceTabs
        id="audit-modules"
        label={tr("Audit modules")}
        items={items}
        value={value}
        onChange={(module) => {
          const params = new URLSearchParams(query);
          if (module) params.set("module", module);
          else params.delete("module");
          startTransition(() =>
            router.push(`/admin/audit?${params}`, { scroll: false }),
          );
        }}
      />
    </div>
  );
}
