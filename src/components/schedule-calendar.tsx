"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import classic from "@fullcalendar/react/themes/classic";
import timeGrid from "@fullcalendar/react/timegrid";
import interaction from "@fullcalendar/react/interaction";
import zhCn from "@fullcalendar/react/locales/zh-cn";
import zhTw from "@fullcalendar/react/locales/zh-tw";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import { localDateTime } from "@/lib/edition-time";
import { useAppTranslations } from "@/i18n/shared";
import type { AvailabilityInterval } from "@/lib/schedule-model";
export default function ScheduleCalendar({
  timeZone,
  official,
  proposed,
  intervals,
  summary,
  editable,
  onSelect,
}: {
  timeZone: string;
  official: string | null;
  proposed?: string;
  intervals: AvailabilityInterval[];
  summary: { start: string; end: string; count: number }[];
  editable: boolean;
  onSelect: (start: string, end: string) => void;
}) {
  const tr = useAppTranslations();
  const [mobile, setMobile] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const label = tr("Calendar time slots");
  // The calendar's internal scroll viewport needs its own keyboard stop in Safari.
  // Inspect overflow rather than depending on FullCalendar's generated CSS names.
  const enableKeyboardScroll = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      root.current?.querySelectorAll<HTMLElement>("div").forEach((element) => {
        if (
          ["auto", "scroll"].includes(getComputedStyle(element).overflowY) &&
          element.scrollHeight > element.clientHeight + 1
        ) {
          // allDaySlot is disabled: this viewport owns the body's rows.
          // Move the rowgroup role onto it so focus does not interrupt the table tree.
          const group = element.closest('[role="rowgroup"]');
          if (group && group !== element) group.removeAttribute("role");
          element.setAttribute("role", "rowgroup");
          element.tabIndex = 0;
          element.classList.add("schedule-time-scroller");
        }
      });
    });
  }, []);
  useEffect(() => {
    enableKeyboardScroll();
    return () => cancelAnimationFrame(frame.current);
  }, [enableKeyboardScroll, mobile]);
  useEffect(() => {
    const media = matchMedia("(max-width: 640px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <div
      className="schedule-calendar"
      ref={root}
      role="region"
      aria-label={label}
    >
      <FullCalendar
        key={mobile ? "day" : "week"}
        plugins={[classic, timeGrid, interaction]}
        initialView={mobile ? "timeGridDay" : "timeGridWeek"}
        initialDate={proposed ?? official ?? undefined}
        timeZone={timeZone}
        locale={
          tr.locale === "zh-Hans" ? zhCn : tr.locale === "zh-Hant" ? zhTw : "en"
        }
        headerToolbar={{
          left: "prev,next",
          center: "title",
          right: "timeGridDay,timeGridWeek",
        }}
        dayText={tr("Day")}
        weekTextLong={tr("Week")}
        class="schedule-calendar-root"
        toolbarTitleClass="schedule-calendar-title"
        toolbarClass="schedule-calendar-toolbar"
        height={560}
        scrollTime={`${String(Math.max(0, Number(localDateTime(proposed ?? official ?? new Date().toISOString(), timeZone).slice(11, 13)) - 2)).padStart(2, "0")}:00:00`}
        allDaySlot={false}
        editable={false}
        selectable={editable}
        dayLaneClass="schedule-day-lane"
        datesSet={enableKeyboardScroll}
        selectMirror
        select={(info) => {
          onSelect(info.start.toISOString(), info.end.toISOString());
          info.view.calendar.unselect();
        }}
        events={[
          ...intervals.map((i, index) => ({
            ...i,
            id: `own-${index}`,
            title: tr("My availability"),
            extendedProps: { own: true },
            class: "schedule-own",
          })),
          ...summary.map((i, index) => ({
            ...i,
            id: `summary-${index}`,
            title: tr("{value0} available", { value0: i.count }),
            display: "background" as const,
          })),
          ...(official
            ? [
                {
                  id: "official",
                  start: official,
                  title: tr("Official start"),
                  contrastColor: "var(--site-foreground)",
                  class: "schedule-point schedule-official",
                },
              ]
            : []),
          ...(proposed
            ? [
                {
                  id: "proposal",
                  start: proposed,
                  title: tr("Proposed start"),
                  contrastColor: "var(--site-foreground)",
                  class: "schedule-point schedule-proposal",
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
