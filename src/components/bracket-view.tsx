"use client";
import { useState, type ReactNode } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { ResolvedBracket, ResolvedMatch } from "@/lib/bracket-model";
import { BracketColumns } from "./bracket-columns";
import { BracketCanvas } from "./bracket-canvas";

export function BracketView({
  bracket,
  renderMatch,
  teamUrls,
  hideGroupTabs = false,
}: {
  bracket: ResolvedBracket;
  renderMatch?: (match: ResolvedMatch) => ReactNode;
  teamUrls?: Record<string, string>;
  hideGroupTabs?: boolean;
}) {
  const tr = useAppTranslations();
  const [groupId, setGroup] = useState(bracket.groups[0].id);
  const group =
    bracket.groups.find((g) => g.id === groupId) ?? bracket.groups[0];
  return (
    <>
      {!renderMatch && !hideGroupTabs && (
        <div
          className="bracket-tabs"
          role="group"
          aria-label={tr("Bracket sections")}
        >
          {bracket.groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className={g.id === group.id ? "" : "secondary"}
              aria-pressed={g.id === group.id}
              onClick={() => setGroup(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}
      {group.layout === "grid" || renderMatch ? (
        <BracketColumns
          bracket={{ ...bracket, groups: [group] }}
          renderMatch={renderMatch}
          teamUrls={teamUrls}
          hideGroupTabs
        />
      ) : (
        <BracketCanvas
          key={`${bracket.editionSlug}:${group.id}`}
          group={group}
          editionSlug={bracket.editionSlug}
          teamUrls={teamUrls}
        />
      )}
    </>
  );
}
