"use client";
import styles from "./archive-competition.module.css";
import { useState } from "react";
import { BracketView } from "./bracket-view";
import { useAppTranslations } from "@/i18n/shared";
import type { ResolvedBracket } from "@/lib/bracket-model";
import type { ReactNode } from "react";

/** Historical appearances are always-visible references, never confirmed advancement. */
export function ArchiveCompetition({
  bracket,
  teamUrls,
  standings,
  finalStandings,
}: {
  bracket: ResolvedBracket | null;
  teamUrls: Record<string, string>;
  standings?: ReactNode;
  finalStandings?: ReactNode;
}) {
  const tr = useAppTranslations();
  const [phase, setPhase] = useState<"group" | "knockout">("group");
  const groups =
    bracket?.groups.filter((g) =>
      phase === "group" ? g.layout === "grid" : g.layout !== "grid",
    ) ?? [];
  return (
    <section className={`archive-competition ${styles.competition}`}>
      <div className="event-tabs" role="group" aria-label={tr("Stage")}>
        <button
          type="button"
          aria-pressed={phase === "group"}
          onClick={() => setPhase("group")}
        >
          {tr("GROUP STAGE")}
        </button>
        <button
          type="button"
          aria-pressed={phase === "knockout"}
          onClick={() => setPhase("knockout")}
        >
          {tr("Knockout")}
        </button>
      </div>
      {bracket && groups.length ? (
        <BracketView
          hideGroupTabs={phase === "knockout"}
          key={phase}
          bracket={{ ...bracket, groups }}
          teamUrls={teamUrls}
        />
      ) : (
        <p className="muted">{tr("No recorded matches.")}</p>
      )}
      {phase === "group" && standings}
      {finalStandings}
    </section>
  );
}
