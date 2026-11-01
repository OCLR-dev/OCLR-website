"use client";
import { useStaffReadOnly } from "./staff-read-only";

import { useAppTranslations } from "@/i18n/shared";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./avatar";
import { CountryFlag } from "./country-flag";
import { countryFlagData } from "@/lib/country-flag";
export type CaptainIdentity = {
  avatarUrl: string | null;
  countryCode: string | null;
  countryName: string | null;
};
// Only visible missing identities are looked up. Serialize through the existing server cache/rate limiter.
let profileQueue: Promise<void> = Promise.resolve();
export function CaptainPlayerCard({
  userId,
  username,
  identity,
}: {
  userId: number;
  username: string;
  identity?: CaptainIdentity;
}) {
  const readOnly = useStaffReadOnly();
  const tr = useAppTranslations();

  const root = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState(identity);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (readOnly) return;
    if (identity?.countryCode || !root.current) return;
    const controller = new AbortController();
    let visible = false,
      scheduled = false;
    const load = () => {
      if (scheduled) return;
      scheduled = true;
      setLoading(true);
      const pending = profileQueue
        .then(async () => {
          if (controller.signal.aborted || !visible) return;
          observer.disconnect();
          const response = await fetch("/api/admin/profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: String(userId), mode: "osu" }),
            signal: controller.signal,
          });
          if (!response.ok) return;
          const snapshot = await response.json(),
            p = snapshot.profile;
          if (!controller.signal.aborted && p?.osuId === userId)
            setProfile({
              avatarUrl: p.avatarUrl,
              countryCode: p.countryCode,
              countryName: p.countryName,
            });
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
          scheduled = false;
        });
      profileQueue = pending;
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) load();
    });
    observer.observe(root.current);
    return () => {
      controller.abort();
      observer.disconnect();
    };
  }, [userId, identity?.countryCode, readOnly]);
  const country = profile?.countryCode;
  const flag = countryFlagData(country, tr.locale);
  return (
    <div className="captain-player-identity" ref={root}>
      <Avatar
        key={profile?.avatarUrl ?? String(userId)}
        osuId={userId}
        username={username}
        avatarUrl={profile?.avatarUrl ?? undefined}
      />
      <div>
        <a
          draggable={false}
          className="text-link captain-player-name"
          href={`https://osu.ppy.sh/users/${userId}`}
        >
          {username}
        </a>
        <p className="muted small">
          {tr("osu! ID ")}
          {userId}
        </p>
        <p className="captain-player-country small">
          {flag ? (
            <>
              <CountryFlag code={country} decorative />
              {profile?.countryName ?? flag.name}
            </>
          ) : (
            <span className="muted">
              {loading ? tr("Loading country…") : tr("Country unavailable")}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
