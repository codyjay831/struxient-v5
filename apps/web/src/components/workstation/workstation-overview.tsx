import type { WorkstationPresentation } from "@/lib/workstation-presentation";
import { parseWorkstationUrlState, buildWorkstationUrl } from "@/lib/workstation/url-state";
import type { WorkstationWorkItem } from "@/lib/workstation-query";
import {
  WorkstationColumn,
  CriticalGroupsList,
  NextActionsList,
  TodayAgendaList,
  WeekStrip,
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(220px,300px)] lg:gap-8">
        <WorkstationColumn
          title="Critical"
          description="Risks that can stop today's work."
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
          className="order-3 lg:border-l lg:border-border lg:pl-6"
        >
          <TodayAgendaList
            items={presentation.overviewTodayAgenda}
            buildHref={buildHref}
            selectedId={selectedId}
          />
        </WorkstationColumn>
      </div>

      <WeekStrip
        days={presentation.overviewWeekPreview}
        buildDayHref={() => buildWorkstationUrl(urlState, { tab: "calendar", selected: undefined })}
      />
    </div>
  );
}
