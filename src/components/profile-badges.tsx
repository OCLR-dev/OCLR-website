"use client";

import Image from "next/image";
import { useId, useState, type FocusEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useAppTranslations } from "@/i18n/shared";
import { isGameplayBadge } from "@/lib/badge-activity";
import { formatDate } from "@/lib/editions";
import type { ProfileBadge } from "@/lib/osu-profile-model";

type Placement = "above" | "below";
type Tip = {
  badge: ProfileBadge;
  x: number;
  y: number;
  placement: Placement;
  // Painted inside the themed shell so the panel inherits the active theme.
  host: Element;
};

/**
 * The player's osu! badge ribbons in one row above the rank chart. Each badge
 * shows its description and award time on hover or keyboard focus, and links to
 * its source page when the provider supplies one.
 */
export function ProfileBadges({ badges }: { badges: ProfileBadge[] }) {
  const tr = useAppTranslations();
  const tipId = `profile-badge-tip-${useId()}`;
  const [tip, setTip] = useState<Tip | null>(null);

  const show = (badge: ProfileBadge, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    // Keep the panel inside the viewport on the first row of a short page.
    const placement: Placement = rect.top < 140 ? "below" : "above";
    // The panel is centred on the ribbon and at most 16rem wide.
    const half = Math.min(128, (window.innerWidth - 16) / 2);
    setTip({
      badge,
      x: Math.min(
        Math.max(rect.left + rect.width / 2, half + 8),
        window.innerWidth - half - 8,
      ),
      y: placement === "above" ? rect.top - 8 : rect.bottom + 8,
      placement,
      host: target.closest(".themed-site") ?? document.body,
    });
  };
  const hide = () => setTip(null);

  return (
    <ul className="profile-badges" aria-label={tr("Badges")}>
      {badges.map((badge, index) => {
        // The 1x ribbon is already 85×40; the 2x is a fallback for it.
        const artwork = badge.imageUrl ?? badge.image2xUrl;
        const image = artwork ? (
          <Image
            className="profile-badge-image"
            src={artwork}
            alt=""
            width={85}
            height={40}
            unoptimized
          />
        ) : (
          <span
            className="profile-badge-image profile-badge-image--empty"
            aria-hidden="true"
          />
        );
        const describedBy = tip?.badge === badge ? tipId : undefined;
        const className = isGameplayBadge(badge.description)
          ? "profile-badge profile-badge--gameplay"
          : "profile-badge";
        const handlers = {
          onMouseEnter: (event: MouseEvent<HTMLElement>) =>
            show(badge, event.currentTarget),
          onMouseLeave: hide,
          onFocus: (event: FocusEvent<HTMLElement>) =>
            show(badge, event.currentTarget),
          onBlur: hide,
        };
        return (
          <li key={`${badge.awardedAt}-${index}`}>
            {badge.url ? (
              <a
                className={className}
                href={badge.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-describedby={describedBy}
                {...handlers}
              >
                {image}
              </a>
            ) : (
              <span
                className={className}
                tabIndex={0}
                aria-describedby={describedBy}
                {...handlers}
              >
                {image}
              </span>
            )}
          </li>
        );
      })}
      {tip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={tipId}
            role="tooltip"
            className={`profile-badge-tip profile-badge-tip--${tip.placement}`}
            style={{ left: tip.x, top: tip.y }}
          >
            <strong>{tip.badge.description}</strong>
            {isGameplayBadge(tip.badge.description) && (
              <span className="profile-badge-tip-note">
                {tr(
                  "This badge may be tournament-related and will be automatically weighted.",
                )}
              </span>
            )}
            <time dateTime={tip.badge.awardedAt}>
              {formatDate(tip.badge.awardedAt, "UTC", tr.locale)}
            </time>
          </div>,
          tip.host,
        )}
    </ul>
  );
}
