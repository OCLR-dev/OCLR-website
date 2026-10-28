import Link from "./pending-link";
import type { ReactNode } from "react";
export function Action({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link className={`button${secondary ? " secondary" : ""}`} href={href}>
      {children}
    </Link>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {children && <p className="muted">{children}</p>}
    </header>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="empty-state">
      <span className="empty-mark" aria-hidden="true">
        ◌
      </span>
      <h2>{title}</h2>
      <p className="muted">{children}</p>
    </section>
  );
}
