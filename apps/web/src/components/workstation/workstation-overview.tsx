import type { WorkstationPresentation } from "@/lib/workstation-presentation";
import { formatCalendarDayKey } from "@/lib/workstation-presentation";
import { parseWorkstationUrlState, buildWorkstationUrl } from "@/lib/workstation/url-state";
import type { WorkstationWorkItem } from "@/lib/workstation-query";
import {
  WorkstationColumn,
  CriticalGroupsList,
  NextActionsList,
  TodayAgendaList,
  WeekStrip,
  WaitingBlockedList,
  ActiveJobsList,
  UnassignedList,
  OperationalExceptionsList,
} from "./workstation-cockpit";

export function WorkstationOverview({
  presentation,
  urlState,
  selectedId,
}: {
  presentation: WorkstationPresentation;
  urlState: ReturnType<typeof parseWorkstationUrlState>;
  selectedId?: string;
}) {
  function buildHref(row: { selectedId: string; selectedKind: string }) {
    return buildWorkstationUrl(urlState, {
      selected: {
        id: row.selectedId,
        kind: row.selectedKind as Exclude<WorkstationWorkItem["kind"], "daily-log">,
      },
    });
  }

  function buildTabHref(
    tab: ReturnType<typeof parseWorkstationUrlState>["tab"],
    queueFilter?: string,
  ) {
    return buildWorkstationUrl(urlState, {
      tab,
      selected: undefined,
      queueFilter,
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(220px,300px)] lg:gap-8">
        <WorkstationColumn
          title="Critical"
          description="Risks that can stop today's work."
          viewAllHref={buildTabHref("tasks", "blocked")}
          className="order-1"
        >
          <CriticalGroupsList
            groups={presentation.overviewCriticalGroups}
            buildHref={buildHref}
            selectedId={selectedId}
          />
        </WorkstationColumn>

        <WorkstationColumn
          title="Next actions"
          description="Ranked work you can resolve from here."
          viewAllHref={buildTabHref("tasks")}
          className="order-2 lg:border-l lg:border-border lg:pl-6"
        >
          <NextActionsList
            items={presentation.overviewNextActions}
            buildHref={buildHref}
            selectedId={selectedId}
          />
        </WorkstationColumn>

        <WorkstationColumn
          title="Today"
          description="Scheduled visits, due work, and follow-ups."
          viewAllHref={buildTabHref("calendar", "today")}
          className="order-3 lg:border-l lg:border-border lg:pl-6"
        >
          <TodayAgendaList
            items={presentation.overviewTodayAgenda}
            buildHref={buildHref}
            selectedId={selectedId}
          />
        </WorkstationColumn>
      </div>

      <div className="grid grid-cols-1 gap-6 border-t border-border pt-6 lg:grid-cols-2 lg:gap-8">
        <WorkstationColumn
          title="Waiting & blocked"
          description="External holds and prerequisite blockers."
          viewAllHref={buildTabHref("tasks", "waiting")}
        >
          <WaitingBlockedList
            items={presentation.waitingBlocked}
            buildHref={buildHref}
            selectedId={selectedId}
          />
        </WorkstationColumn>

        <WorkstationColumn
          title="Active jobs"
          description="Jobs with multiple signals worth a glance."
          viewAllHref={buildTabHref("jobs", "risk")}
          className="lg:border-l lg:border-border lg:pl-6"
        >
          <ActiveJobsList
            items={presentation.activeJobs}
            buildHref={buildHref}
            selectedId={selectedId}
          />
        </WorkstationColumn>
      </div>

      {presentation.overviewUnassigned.length > 0 ||
      presentation.operationalExceptions.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 border-t border-border pt-6 lg:grid-cols-2 lg:gap-8">
          {presentation.overviewUnassigned.length > 0 ? (
            <WorkstationColumn
              title="Unassigned work"
              description="Tasks with no assignee on visible jobs."
              viewAllHref={buildTabHref("tasks")}
            >
              <UnassignedList
                items={presentation.overviewUnassigned}
                buildHref={buildHref}
                selectedId={selectedId}
              />
            </WorkstationColumn>
          ) : null}

          {presentation.operationalExceptions.length > 0 ? (
            <WorkstationColumn
              title="Operational exceptions"
              description="Overdue, missed, or payment/issue escalations."
              viewAllHref={buildTabHref("activity")}
              className={
                presentation.overviewUnassigned.length > 0
                  ? "lg:border-l lg:border-border lg:pl-6"
                  : undefined
              }
            >
              <OperationalExceptionsList
                items={presentation.operationalExceptions}
                buildHref={buildHref}
                selectedId={selectedId}
              />
            </WorkstationColumn>
          ) : null}
        </div>
      ) : null}

      <WeekStrip
        days={presentation.overviewWeekPreview}
        buildDayHref={(day) =>
          buildTabHref("calendar", `day:${formatCalendarDayKey(day.date)}`)
        }
      />
    </div>
  );
}
