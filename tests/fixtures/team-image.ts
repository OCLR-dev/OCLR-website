import sharp from "sharp";

export function animatedTeamImage(format: "gif" | "webp", frames = 2) {
  const width = 80;
  const pageHeight = 40;
  const frameBytes = width * pageHeight * 3;
  const pixels = Buffer.alloc(frameBytes * frames);
  for (let frame = 0; frame < frames; frame++) {
    pixels.fill(
      frame % 2 ? 210 : 40,
      frame * frameBytes,
      (frame + 1) * frameBytes,
    );
  }
  const image = sharp(pixels, {
    raw: { width, height: pageHeight * frames, pageHeight, channels: 3 },
  });
  return image[format]({
    delay: Array.from({ length: frames }, (_, frame) =>
      frame % 2 ? 160 : 110,
    ),
    loop: 3,
  }).toBuffer();
}
