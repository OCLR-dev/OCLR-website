import { mediaDirectory } from "./media-directory";
import { randomUUID } from "node:crypto";
import { open, rename, unlink, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { HttpError } from "./http-error";
import { TEAM_IMAGE_MAX_BYTES } from "./request-body-limits";
import { teamImageMimeTypes } from "./team-image-formats";
export { TEAM_IMAGE_MAX_BYTES } from "./request-body-limits";
const directory = () => mediaDirectory("teams");
const maxFrameDimension = 4096;
const maxDecodedPixels = maxFrameDimension ** 2;
const maxFrames = 120;
const maxStoredBytes = 1024 * 1024;

export async function normalizeTeamImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > TEAM_IMAGE_MAX_BYTES)
    throw new HttpError(
      400,
      "Choose a JPEG, PNG, GIF or WebP image up to 5 MB.",
    );
  let output: Buffer;
  try {
    const image = sharp(bytes, {
      limitInputPixels: maxDecodedPixels,
      failOn: "warning",
      animated: true,
    });
    const {
      mediaType,
      width,
      height,
      pageHeight,
      pages = 1,
    } = await image.metadata();
    const frameHeight = pageHeight ?? height;
    if (
      !mediaType ||
      !teamImageMimeTypes.includes(mediaType) ||
      !width ||
      !frameHeight ||
      width > maxFrameDimension ||
      frameHeight > maxFrameDimension
    )
      throw new Error();
    if (pages > maxFrames || width * frameHeight * pages > maxDecodedPixels)
      throw new HttpError(
        400,
        "Choose a shorter animation or reduce its resolution. Animations support up to 120 frames.",
      );
    const animated = pages > 1;
    if (!animated) image.autoOrient();
    const size = animated ? 256 : 512;
    output = await image
      .resize(size, size, { fit: "cover" })
      .webp({ quality: animated ? 80 : 85 })
      .toBuffer();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      "Choose a valid JPEG, PNG, GIF or WebP image with dimensions up to 4096 × 4096 per frame.",
    );
  }
  if (output.length > maxStoredBytes)
    throw new HttpError(
      400,
      "The processed team image is too large. Choose a smaller image or a shorter animation.",
    );
  return output;
}
export async function storeTeamImage(bytes: Buffer) {
  const normalized = await normalizeTeamImage(bytes);
  const root = await directory();
  const key = randomUUID(),
    temp = join(root, `.${key}.tmp`);
  try {
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.writeFile(normalized);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, join(root, `${key}.webp`));
    const directoryHandle = await open(root, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    await unlink(temp).catch(() => {});
    await unlink(join(root, `${key}.webp`)).catch(() => {});
    throw error;
  }
  return key;
}
async function file(key: string) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(key))
    throw new HttpError(404, "Team image not found.");
  return join(await directory(), `${key}.webp`);
}
export async function removeTeamImage(key: string) {
  await unlink(await file(key)).catch(() => {});
}
export async function readTeamImage(key: string) {
  const path = await file(key),
    stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxStoredBytes)
    throw new HttpError(404, "Team image not found.");
  return readFile(path);
}
