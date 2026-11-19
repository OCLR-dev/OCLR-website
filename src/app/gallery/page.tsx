import { randomInt } from "node:crypto";
import { LiruGalleryPanel } from "@/components/liru-card-display";
import { LiruGacha } from "@/components/liru-gacha";
import { SignedMessageBoard } from "@/components/player-message-board";
import { WikiGallery } from "@/components/wiki-gallery";
import { getAppTranslations } from "@/i18n/server";
import { currentUser } from "@/lib/auth/user";
import { remoteMode } from "@/lib/data-source";
import { publicLiruCollectionAuthors } from "@/lib/liru-collection";
import { remotePage } from "@/lib/remote-page";
import { liruGallery } from "@/lib/wiki-articles";
import "../community-interactions.css";
import "../tournaments/[edition]/information.css";
import "../wiki/wiki.css";

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Liru Gallery") };
}

async function GalleryPage() {
  const tr = await getAppTranslations();
  const { title, gallery } = liruGallery(tr);
  const remote = remoteMode();
  const [viewer, collectionAuthorIds] = remote
    ? [null, undefined]
    : await Promise.all([
        currentUser().catch(() => null),
        publicLiruCollectionAuthors(gallery).catch(() => []),
      ]);

  return (
    <div className="container page wiki-page information-page">
      <article
        className="information-document document-typeset"
        aria-labelledby="liru-gallery-title"
      >
        <header className="information-heading">
          <h1 id="liru-gallery-title">{title}</h1>
        </header>
        {!remote && (
          <LiruGacha
            key={viewer?.osuId}
            profileHref={
              viewer ? `/players/${viewer.osuId}#liru-collection` : undefined
            }
            figures={gallery}
          />
        )}
        <WikiGallery
          title={tr("Liru Card Showcase")}
          figures={gallery}
          initialIndex={randomInt(gallery.length)}
          showAnotherLabel={tr("Show another look")}
        />
        <LiruGalleryPanel
          className="wiki-gallery-comments"
          headingId="wiki-gallery-comments"
          title={tr("Message board")}
        >
          <div className="wiki-gallery-comment-board">
            <SignedMessageBoard
              endpoint="/api/wiki/liru-gallery/messages"
              name={title}
              signedIn={!!viewer}
              viewerId={viewer?.osuId}
              readOnly={remote}
              collectionAuthorIds={collectionAuthorIds}
              showAll
            />
          </div>
        </LiruGalleryPanel>
      </article>
    </div>
  );
}

export default function Page() {
  return remotePage(GalleryPage);
}
