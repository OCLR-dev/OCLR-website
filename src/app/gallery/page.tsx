import { randomInt } from "node:crypto";
import { LiruGacha } from "@/components/liru-gacha";
import { SignedMessageBoard } from "@/components/player-message-board";
import { WikiGallery } from "@/components/wiki-gallery";
import { getAppTranslations } from "@/i18n/server";
import { currentUser } from "@/lib/auth/user";
import { remoteMode } from "@/lib/data-source";
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
  const viewer = remote ? null : await currentUser().catch(() => null);

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
          figures={gallery}
          initialIndex={randomInt(gallery.length)}
          showAnotherLabel={tr("Show another look")}
        />
        <section
          className="wiki-gallery-comments"
          aria-labelledby="wiki-gallery-comments"
        >
          <h2 id="wiki-gallery-comments">{tr("Message board")}</h2>
          <SignedMessageBoard
            endpoint="/api/wiki/liru-gallery/messages"
            name={title}
            signedIn={!!viewer}
            viewerId={viewer?.osuId}
            readOnly={remote}
            showAll
          />
        </section>
      </article>
    </div>
  );
}

export default function Page() {
  return remotePage(GalleryPage);
}
