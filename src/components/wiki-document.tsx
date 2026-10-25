import Link from "next/link";
import { getAppTranslations } from "@/i18n/server";
import { wikiArticles, wikiHref, type WikiArticle } from "@/lib/wiki-articles";
export async function WikiDocument({ article }: { article: WikiArticle }) {
  const tr = await getAppTranslations();
  return (
    <div className="container page wiki-page information-page">
      <nav className="wiki-articles" aria-label={tr("Wiki articles")}>
        {wikiArticles(tr).map((item) => (
          <Link
            key={item.slug}
            href={wikiHref(item.slug)}
            aria-current={item.slug === article.slug ? "page" : undefined}
          >
            {item.title}
          </Link>
        ))}
      </nav>
      <div className="information-layout">
        <article
          className="information-document document-typeset"
          aria-labelledby="wiki-title"
        >
          <header className="information-heading">
            <p className="eyebrow">
              {tr("OCLR Wiki")} · {article.category}
            </p>
            <h1 id="wiki-title">{article.title}</h1>
          </header>
          <p className="information-intro">{article.intro}</p>
          {article.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph, i) => (
                <p key={i}>
                  {typeof paragraph === "string"
                    ? paragraph
                    : paragraph.map((part, j) =>
                        typeof part === "string" ? (
                          part
                        ) : (
                          <a
                            key={j}
                            href={part.href}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {part.label}
                          </a>
                        ),
                      )}
                </p>
              ))}
              {section.items && (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {section.table && (
                <div
                  className="information-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label={section.title}
                >
                  <table>
                    <thead>
                      <tr>
                        {section.table.headers.map((header) => (
                          <th scope="col" key={header}>
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
          {article.source && (
            <footer className="wiki-source">
              <span>{tr("Source")}</span>
              <a href={article.source.href} target="_blank" rel="noreferrer">
                {article.source.title} ↗
              </a>
              <span>
                {article.source.author} ·{" "}
                <time dateTime={article.source.date}>
                  {article.source.date}
                </time>
              </span>
            </footer>
          )}
        </article>
        <aside className="information-contents">
          <nav aria-label={tr("Contents")}>
            <h2>{tr("Contents")}</h2>
            <ol>
              {article.sections.map((section, i) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>
                    <span aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
            <a className="information-back-top" href="#wiki-title">
              {tr("Back to top")} ↑
            </a>
          </nav>
        </aside>
      </div>
    </div>
  );
}
