import type { FormEventHandler, ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import styles from "./api-access-form.module.css";

export function ApiAccessForm({
  backend,
  editionSlug,
  description,
  onSubmit,
  children,
}: {
  backend: string;
  editionSlug?: string;
  description: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {
  const tr = useAppTranslations();
  return (
    <section className={styles.create} aria-labelledby="developer-create">
      <header className={styles.heading}>
        <h2 id="developer-create">{tr("Create read-only access")}</h2>
        <a className="context-link" href="/api/v1/openapi.json">
          {tr("View API specification")}
        </a>
      </header>
      <div className={styles.backend}>
        <strong>{tr("Backend")}</strong>
        <code>{backend}</code>
        {editionSlug && <span className="badge">{editionSlug}</span>}
      </div>
      <div className={styles.description}>
        <p>
          {tr(
            "This token can only read data, even if your account has other roles.",
          )}
        </p>
        {description}
      </div>
      <form className={styles.form} onSubmit={onSubmit}>
        {children}
      </form>
    </section>
  );
}
