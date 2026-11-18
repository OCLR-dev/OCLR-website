import { randomInt } from "node:crypto";
import Image from "next/image";
import Link from "next/link";
import { getAppTranslations } from "@/i18n/server";
import { currentUser } from "@/lib/auth/user";
import { remoteMode } from "@/lib/data-source";
import {
  wikiArticles,
  wikiHref,
  type WikiArticle,
  type WikiText,
} from "@/lib/wiki-articles";
import { WikiGallery } from "./wiki-gallery";
import { LiruGacha } from "./liru-gacha";
import { SignedMessageBoard } from "./player-message-board";

function WikiTextContent({ text }: { text: WikiText }) {
  return typeof text === "string"
    ? text
    : text.map((part, j) =>
        typeof part === "string" ? (
          part
        ) : (
          <a key={j} href={part.href} target="_blank" rel="noreferrer">
            {part.label}
          </a>
        ),
      );
}

export async function WikiDocument({ article }: { article: WikiArticle }) {
  const tr = await getAppTranslations();
  const remote = remoteMode();
  const viewer =
    article.gallery?.length && !remote
      ? await currentUser().catch(() => null)
      : null;
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
      <div className={article.gallery ? undefined : "information-layout"}>
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
          {article.intro && (
            <p className="information-intro">{article.intro}</p>
          )}
          {article.related && (
            <p>
              <Link href={wikiHref(article.related.slug)}>
                {article.related.title}
              </Link>
            </p>
          )}
          {!!article.gallery?.length && (
            <>
              {!remote && (
                <LiruGacha
                  key={viewer?.osuId}
                  profileHref={
                    viewer
                      ? `/players/${viewer.osuId}#liru-collection`
                      : undefined
                  }
                  figures={article.gallery}
                />
              )}
              <WikiGallery
                figures={article.gallery}
                initialIndex={randomInt(article.gallery.length)}
                showAnotherLabel={tr("Show another look")}
              />
              <section
                className="wiki-gallery-comments"
                aria-labelledby="wiki-gallery-comments"
              >
                <h2 id="wiki-gallery-comments">{tr("Message board")}</h2>
                <SignedMessageBoard
                  endpoint="/api/wiki/liru-gallery/messages"
                  name={article.title}
                  signedIn={!!viewer}
                  viewerId={viewer?.osuId}
                  readOnly={remote}
                />
              </section>
            </>
          )}
          {article.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph, i) => (
                <p key={i}>
                  <WikiTextContent text={paragraph} />
                </p>
              ))}
              {section.figures?.map((figure) => (
                <figure key={figure.src} className="wiki-figure">
                  <a href={figure.src} target="_blank" rel="noreferrer">
                    <Image
                      src={figure.src}
                      alt={figure.alt}
                      width={figure.width}
                      height={figure.height}
                      sizes="(max-width: 760px) 100vw, 820px"
                      unoptimized
                    />
                  </a>
                  <figcaption>{figure.caption}</figcaption>
                </figure>
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
                            <td
                              key={j}
                              className={
                                typeof cell === "string"
                                  ? undefined
                                  : "wiki-links"
                              }
                            >
                              <WikiTextContent text={cell} />
                            </td>
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
        {article.sections.length > 0 && (
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
        )}
      </div>
    </div>
  );
}
