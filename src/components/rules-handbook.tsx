"use client";
import { useAppTranslations } from "@/i18n/shared";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  rulesBodyText,
  rulesContentsLabel,
  rulesSectionIds,
} from "@/lib/rules-navigation";
type RuleFigure = {
  after: string;
  src: string;
  alt: string;
  width: number;
  height: number;
};
type RuleSection = {
  id?: string;
  heading: string;
  body: string;
  figures?: RuleFigure[];
};
function RuleIllustration({ figure }: { figure: Omit<RuleFigure, "after"> }) {
  return (
    <figure className="rules-illustration">
      <Image
        src={figure.src}
        alt={figure.alt}
        width={figure.width}
        height={figure.height}
        unoptimized
      />
    </figure>
  );
}
function RuleBody({
  section,
  archiveSeason,
}: {
  section: RuleSection;
  archiveSeason?: string;
}) {
  let offset = 0;
  return (
    <>
      {section.figures?.map((figure) => {
        const start = section.body.indexOf(figure.after, offset);
        if (start < 0) return null;
        const end = start + figure.after.length;
        const text = section.body.slice(offset, end);
        offset = end;
        return (
          <div key={figure.src}>
            <p className="preserve-lines">
              {rulesBodyText(text, archiveSeason)}
            </p>
            <RuleIllustration figure={figure} />
          </div>
        );
      })}
      {section.body.slice(offset).trim() && (
        <p className="preserve-lines">
          {rulesBodyText(section.body.slice(offset), archiveSeason)}
        </p>
      )}
    </>
  );
}
export function RulesHandbook({
  sections,
  cover,
  archiveSeason,
  showContents = true,
}: {
  sections: RuleSection[];
  archiveSeason?: string;
  cover?: Omit<RuleFigure, "after">;
  showContents?: boolean;
}) {
  const tr = useAppTranslations();

  const ids = useMemo(() => {
    const generated = rulesSectionIds(sections.map((s) => s.heading));
    return sections.map((section, index) => section.id ?? generated[index]);
  }, [sections]);
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    if (!showContents) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: "-80px 0px -50% 0px" },
    );
    for (const id of ids) {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [ids, showContents]);
  function contents() {
    return (
      <nav aria-label={tr("Rules contents")}>
        {sections.map((s, i) => (
          <a
            href={`#${ids[i]}`}
            key={ids[i]}
            aria-current={active === ids[i] ? "location" : undefined}
            onClick={(event) => {
              setActive(ids[i]);
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            {rulesContentsLabel(s.heading, archiveSeason)}
          </a>
        ))}
      </nav>
    );
  }
  return (
    <div
      className={showContents ? "rules-handbook" : "rules-handbook-document"}
    >
      {showContents && (
        <aside className="rules-desktop-contents">
          <p className="eyebrow">{tr("Contents")}</p>
          {contents()}
        </aside>
      )}
      <div className="rules-reading">
        {showContents && (
          <details className="rules-mobile-contents">
            <summary>{tr("On this page")}</summary>
            {contents()}
          </details>
        )}
        <article className="rules-article">
          {cover && <RuleIllustration figure={cover} />}
          {sections.map((s, i) => (
            <section key={ids[i]} aria-labelledby={ids[i]}>
              <h2 id={ids[i]} tabIndex={-1}>
                <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                {s.heading}
              </h2>
              <RuleBody section={s} archiveSeason={archiveSeason} />
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
