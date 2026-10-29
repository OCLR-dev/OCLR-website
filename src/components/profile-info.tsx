import type { ReactNode } from "react";

export function ProfileInfo({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="info-note-box" role="note" aria-label={label}>
      {children}
    </div>
  );
}
