import { remoteMode } from "@/lib/data-source";
import { HttpError } from "@/lib/http-error";
import { readOsuImage } from "@/lib/osu-image-cache";
import { officialImageUrl } from "@/lib/osu-image-urls";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ variant: string; id: string }> },
) {
  const { variant, id: raw } = await params;
  const id = Number(raw);
  if (
    (variant !== "avatar" && variant !== "cover" && variant !== "list") ||
    !/^[1-9]\d{0,9}$/.test(raw) ||
    id > 2147483647
  )
    return new Response(null, { status: 404 });
  const direct = () =>
    new Response(null, {
      status: 307,
      headers: {
        Location: officialImageUrl(variant, id),
        "Cache-Control": "no-store",
      },
    });
  if (remoteMode() || !process.env.DATABASE_URL) return direct();
  try {
    const image = await readOsuImage(variant, id);
    if (!image) return direct();
    const headers = {
      ETag: image.etag,
      "Cache-Control": "public, no-cache",
      "Content-Type": image.contentType,
      "X-Content-Type-Options": "nosniff",
    };
    if (
      request.headers
        .get("if-none-match")
        ?.split(",")
        .some(
          (tag) =>
            tag.trim().replace(/^W\//, "") === image.etag || tag.trim() === "*",
        )
    )
      return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(image.data), { headers });
  } catch (error) {
    if (error instanceof HttpError)
      return new Response(null, {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    return direct();
  }
}
