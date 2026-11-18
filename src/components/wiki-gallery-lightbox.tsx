"use client";

import { useState, type RefObject } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { useAppTranslations } from "@/i18n/shared";
import type { WikiGalleryFigure } from "@/lib/wiki-articles";
import {
  createGalleryCardPng,
  saveGalleryCardPng,
} from "./wiki-gallery-card-download";
import "yet-another-react-lightbox/styles.css";
import "./wiki-gallery-lightbox.css";

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
          "close",
          <div key="downloads" className="wiki-gallery-lightbox-downloads">
            <a
              className="yarl__button"
              href={figure.src}
              download={`${figure.caption}.webp`}
            >
              {tr("Download transparent artwork")}
            </a>
            <button
              className="yarl__button"
              type="button"
              onClick={() => void downloadCard()}
              disabled={cardDownload === "busy"}
              aria-busy={cardDownload === "busy"}
            >
              {tr("Download card")}
            </button>
            {cardDownload === "error" && (
              <span role="alert">
                {tr("This request could not be completed. Please try again.")}
              </span>
            )}
          </div>,
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
