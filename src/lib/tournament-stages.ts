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
type ActiveStage = Omit<TournamentStage, "state" | "id"> & { phaseId?: string };

export function focusedTournamentStage(stages: TournamentStage[]) {
  const current = stages.findLastIndex((stage) => stage.state === "current");
  if (current >= 0) return current;
  const upcoming = stages.findIndex((stage) => stage.state === "upcoming");
  if (upcoming >= 0) return upcoming;
  return Math.max(
    0,
    stages.findLastIndex((stage) => stage.state === "past"),
  );
}

export function tournamentStageView(
  planned: PlannedStage[],
  active: ActiveStage | null,
  now = Date.now(),
) {
  let next = Infinity;
  for (const { at, endAt } of planned) {
    for (const value of [at, endAt]) {
      const time = Date.parse(value ?? "");
      if (time > now && time < next) next = time;
    }
  }
  return {
    stages: tournamentStages(planned, active, now),
    nextStageChangeAt: Number.isFinite(next) ? next : undefined,
  };
}

export function tournamentStages(
  planned: PlannedStage[],
  active: ActiveStage | null,
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
          ? Date.parse(at) <= now
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
