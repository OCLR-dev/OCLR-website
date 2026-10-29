export type TournamentStage = {
  id: string;
  label: string;
  detail?: string;
  href: string;
  action: string;
  state: "past" | "current" | "upcoming" | "planned";
};
export type PlannedStage = Omit<TournamentStage, "state"> & {
  at?: string;
  endAt?: string | null;
  interval?: boolean;
  authoritative?: boolean;
  order?: number;
};

export function tournamentStages(
  planned: PlannedStage[],
  active: (Omit<TournamentStage, "state" | "id"> & { phaseId?: string }) | null,
  now = Date.now(),
): TournamentStage[] {
  const stages: TournamentStage[] = [...planned]
    .sort((a, b) => {
      const time = (at?: string) =>
        at && Number.isFinite(Date.parse(at)) ? Date.parse(at) : Infinity;
      return (
        time(a.at ?? a.endAt ?? undefined) -
          time(b.at ?? b.endAt ?? undefined) || (a.order ?? 4) - (b.order ?? 4)
      );
    })
    .map(({ at, endAt, interval, authoritative, ...stage }) => ({
      ...stage,
      state: interval
        ? endAt && Date.parse(endAt) <= now
          ? "past"
          : at && Date.parse(at) > now
            ? "upcoming"
            : at && endAt && !authoritative && !active
              ? "current"
              : "planned"
        : at && Number.isFinite(Date.parse(at))
          ? Date.parse(at) < now
            ? "past"
            : "upcoming"
          : "planned",
    }));
  if (!active) return stages;
  const currentIndex = stages.findIndex((stage) =>
    active.phaseId ? stage.id === active.phaseId : stage.label === active.label,
  );
  const { phaseId, ...current } = active;
  if (currentIndex >= 0) {
    stages[currentIndex] = {
      ...stages[currentIndex],
      ...current,
      state: "current",
    };
  } else {
    const next = stages.findIndex((stage) => stage.state !== "past");
    stages.splice(next < 0 ? stages.length : next, 0, {
      ...current,
      id: phaseId ?? "active",
      state: "current",
    });
  }
  return stages;
}
