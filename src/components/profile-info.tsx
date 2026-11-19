import type { ComponentProps, ReactNode } from "react";

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

export function BwsCardNoteTrigger({
  onOpenLabel,
  ...button
}: { onOpenLabel: string } & Pick<
  ComponentProps<"button">,
  "ref" | "popoverTarget"
>) {
  return (
    <button
      {...button}
      type="button"
      className="bws-card-note-trigger"
      aria-label={onOpenLabel}
    >
      <svg
        className="bws-card-note-icon"
        viewBox="0 0 16 16"
        width="18"
        height="18"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="8"
          cy="8"
          r="6.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
        <path
          d="M8 7.1v4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
