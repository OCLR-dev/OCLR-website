"use client";

import Lightbox from "yet-another-react-lightbox";
import Download from "yet-another-react-lightbox/plugins/download";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { useAppTranslations } from "@/i18n/shared";
import type { WikiGalleryFigure } from "@/lib/wiki-articles";
import "yet-another-react-lightbox/styles.css";
import "./wiki-gallery-lightbox.css";

export default function WikiGalleryLightbox({
  figure,
  close,
}: {
  figure: WikiGalleryFigure;
  close: () => void;
}) {
  const tr = useAppTranslations();

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
          download: { url: figure.src, filename: `${figure.caption}.webp` },
        },
      ]}
      plugins={[Zoom, Download]}
      carousel={{ finite: true }}
      controller={{ closeOnBackdropClick: true }}
      render={{ buttonPrev: () => null, buttonNext: () => null }}
      labels={{
        Close: tr("Close"),
        Download: tr("Download"),
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
