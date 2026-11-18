import { galleryCardPortrait, galleryCardSize } from "./wiki-gallery-card";

async function loadImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

export async function createGalleryCardPng(
  card: SVGSVGElement,
  portraitSrc: string,
) {
  // Use the gallery's actual frame and caption. Decode the original portrait
  // separately so the SVG image does not depend on an external subresource.
  const frame = card.cloneNode(true) as SVGSVGElement;
  frame.querySelector("image")?.remove();
  const frameUrl = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(frame)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );
  try {
    const [background, portrait] = await Promise.all([
      loadImage(frameUrl),
      loadImage(portraitSrc),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = galleryCardSize.width;
    canvas.height = galleryCardSize.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context unavailable");
    context.drawImage(background, 0, 0);
    const { x, y, width, height } = galleryCardPortrait;
    context.drawImage(portrait, x, y, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNG encoding failed"));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(frameUrl);
  }
}

export function saveGalleryCardPng(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const download = document.createElement("a");
  download.href = url;
  download.download = filename;
  document.body.append(download);
  download.click();
  download.remove();
  // Let the browser read the URL before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
