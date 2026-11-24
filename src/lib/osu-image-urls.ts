export const imageKinds = ["avatar", "background"] as const;
export type ImageKind = (typeof imageKinds)[number];
export type ImageVariant = "avatar" | "cover" | "list";

export function imageKind(variant: ImageVariant): ImageKind {
  return variant === "avatar" ? "avatar" : "background";
}

export function officialImageUrl(variant: ImageVariant, id: number) {
  if (variant === "avatar") return `https://a.ppy.sh/${id}`;
  return `https://assets.ppy.sh/beatmaps/${id}/covers/${variant === "list" ? "list@2x" : "cover"}.jpg`;
}

export function cachedImageUrl(source: string): string {
  const avatar = /^https:\/\/a\.ppy\.sh\/([1-9]\d*)(?:\?[^#]*)?$/.exec(source);
  const cover =
    /^https:\/\/assets\.ppy\.sh\/beatmaps\/([1-9]\d*)\/covers\/(cover|list@2x)\.jpg(?:\?[^#]*)?$/.exec(
      source,
    );
  const id = avatar?.[1] ?? cover?.[1];
  if (!id || Number(id) > 2147483647) return source;
  return `/api/osu-images/${avatar ? "avatar" : cover?.[2] === "cover" ? "cover" : "list"}/${id}`;
}
