"use client";
import { cachedImageUrl } from "@/lib/osu-image-urls";
import Image from "next/image";
import { useState } from "react";
export function Avatar({
  osuId,
  username,
  avatarUrl,
}: {
  osuId: number;
  username: string;
  avatarUrl?: string;
}) {
  const source =
    !avatarUrl || /^https:\/\/a\.ppy\.sh\/guest\.png(?:\?|$)/.test(avatarUrl)
      ? `https://a.ppy.sh/${osuId}`
      : avatarUrl;
  const src = cachedImageUrl(source);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <div className="avatar">
      {failedSource === src ? (
        <span aria-hidden="true">{username.slice(0, 2)}</span>
      ) : (
        <Image
          src={src}
          alt=""
          width={88}
          height={88}
          unoptimized
          onError={() => setFailedSource(src)}
        />
      )}
    </div>
  );
}
