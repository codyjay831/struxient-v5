import type { ScheduleUrlView } from "@/lib/scheduling/schedule-url-state";

export const VIEW_TO_FC: Record<ScheduleUrlView, string> = {
  month: "dayGridMonth",
  week: "timeGridWeek",
  day: "timeGridDay",
  agenda: "agendaList",
};

/** FullCalendar view options — exported for component/config verification tests. */
export function buildScheduleFullCalendarViewConfig() {
  return {
    dayGridMonth: {
      fixedWeekCount: false,
      showNonCurrentDates: true,
      dayMaxEventRows: true,
    },
    timeGridWeek: {
      scrollTime: "06:00:00",
      scrollTimeReset: false,
      nowIndicator: true,
    },
    timeGridDay: {
      scrollTime: "06:00:00",
      scrollTimeReset: false,
      nowIndicator: true,
    },
    agendaList: {
      type: "list" as const,
      duration: { days: 14 },
    },
  };
}

export const SCHEDULE_FULLCALENDAR_BASE_OPTIONS = {
  headerToolbar: false as const,
  height: "auto" as const,
  editable: false,
  selectable: false,
  eventStartEditable: false,
  eventDurationEditable: false,
  droppable: false,
  firstDay: 0,
  nowIndicator: true,
  moreLinkClick: "popover" as const,
};
