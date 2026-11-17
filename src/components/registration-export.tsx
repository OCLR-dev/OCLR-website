"use client";

export function RegistrationExport({
  label,
  links,
}: {
  label: string;
  links: { label: string; href: string }[];
}) {
  return (
    <details
      className="registration-export"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        event.preventDefault();
        event.currentTarget.querySelector("summary")?.focus();
        event.currentTarget.open = false;
      }}
    >
      <summary className="button secondary">
        {label}
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
          <path
            d="m4 6 4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          />
        </svg>
      </summary>
      <ul className="registration-export-options">
        {links.map(({ label, href }) => (
          <li key={href}>
            <a href={href}>{label}</a>
          </li>
        ))}
      </ul>
    </details>
  );
}
