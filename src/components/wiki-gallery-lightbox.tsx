"use client";

import { useState, type RefObject } from "react";
import Lightbox, { IconButton, createIcon } from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { useAppTranslations } from "@/i18n/shared";
import type { WikiGalleryFigure } from "@/lib/wiki-articles";
import {
  createGalleryCardPng,
  saveGalleryCardPng,
} from "./wiki-gallery-card-download";
import "yet-another-react-lightbox/styles.css";
import "./wiki-gallery-lightbox.css";

const DownloadArtworkIcon = createIcon(
  "DownloadArtwork",
  <path
    d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
);

const DownloadCardIcon = createIcon(
  "DownloadCard",
  <>
    <rect
      x="5"
      y="2.5"
      width="14"
      height="19"
      rx="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <path
      d="M12 8v8m-3-3 3 3 3-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>,
);

export default function WikiGalleryLightbox({
  figure,
  cardRef,
  close,
}: {
  figure: WikiGalleryFigure;
  cardRef: RefObject<SVGSVGElement | null>;
  close: () => void;
}) {
  const tr = useAppTranslations();
  const artworkLabel = tr("Download transparent artwork");
  const cardLabel = tr("Download card");
  const [cardDownload, setCardDownload] = useState<"idle" | "busy" | "error">(
    "idle",
  );

  async function downloadCard() {
    const card = cardRef.current;
    if (!card || cardDownload === "busy") return;
    setCardDownload("busy");
    try {
      const png = await createGalleryCardPng(card, figure.src);
      saveGalleryCardPng(png, `${figure.caption} - ${figure.rarity}.png`);
      setCardDownload("idle");
    } catch {
      setCardDownload("error");
    }
  }

  return (
    <Lightbox
      open
      close={close}
      className="wiki-gallery-lightbox"
      slides={[
        {
          src: figure.src,
          alt: figure.alt,
          width: figure.width,
          height: figure.height,
        },
      ]}
      plugins={[Zoom]}
      toolbar={{
        buttons: [
          "zoom",
          <a
            key="download-artwork"
            className="yarl__button"
            href={figure.src}
            download={`${figure.caption}.webp`}
            aria-label={artworkLabel}
            title={artworkLabel}
          >
            <DownloadArtworkIcon className="yarl__icon" />
          </a>,
          <IconButton
            key="download-card"
            icon={DownloadCardIcon}
            label={cardLabel}
            onClick={() => void downloadCard()}
            disabled={cardDownload === "busy"}
            aria-busy={cardDownload === "busy"}
          />,
          "close",
          cardDownload === "error" && (
            <span
              key="download-error"
              className="wiki-gallery-download-error"
              role="alert"
            >
              {tr("This request could not be completed. Please try again.")}
            </span>
          ),
        ],
      }}
      carousel={{ finite: true }}
      controller={{ closeOnBackdropClick: true }}
      render={{ buttonPrev: () => null, buttonNext: () => null }}
      labels={{
        Close: tr("Close"),
        "Zoom in": tr("Zoom in"),
        "Zoom out": tr("Zoom out"),
        Lightbox: figure.caption,
        "Photo gallery": tr("Liru Gallery"),
        Carousel: tr("Gallery"),
        Slide: tr("Image"),
        "{index} of {total}": figure.caption,
      }}
    />
  );
}
