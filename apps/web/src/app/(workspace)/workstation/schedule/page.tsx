import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { queryWorkstationWorkItems } from "@/lib/workstation-query";
import { WorkstationClearedState } from "@/components/workstation/workstation-ui";
import { ButtonLink } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { StatusBadge } from "@/components/ui/status-badge";

export const dynamic = "force-dynamic";

export default async function WorkstationScheduleLensPage() {
  const ctx = await getRequestContextOrThrow();
  const items = await queryWorkstationWorkItems(ctx.organizationId, ctx.role);
  const scheduleItems = items.filter(
    (item) =>
      item.kind === "schedule" ||
      (item.kind === "task" && (item.status === "Overdue" || item.status === "Due today")),
  );
  const todayCount = scheduleItems.filter((item) => item.status === "Today" || item.status === "Due today").length;
  const missedCount = scheduleItems.filter((item) => item.status === "Missed" || item.status === "Overdue").length;
  const unscheduledCount = scheduleItems.filter((item) => item.status === "Needs Schedule").length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-sm font-semibold text-foreground">
          Scheduling attention
        </h2>
        <div className="flex items-center gap-4 text-sm text-foreground-muted">
          <span>{todayCount} due today</span>
          <span>{missedCount} overdue/missed</span>
          <span>{unscheduledCount} unscheduled</span>
        </div>
      </div>

      {scheduleItems.length > 0 ? (
        <WorkspacePanel padding="compact">
          <div className="space-y-3">
            {scheduleItems.slice(0, 20).map((item) => (
              <a
                key={item.id}
                href={item.href || "/schedule"}
                className="block rounded border border-border bg-surface p-3 hover:border-border-strong"
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  {item.status ? <StatusBadge label={item.status} tone="sent" /> : null}
                </div>
                {item.subtitle ? (
                  <p className="text-xs text-foreground-muted">{item.subtitle}</p>
                ) : null}
                <p className="mt-1 text-xs text-foreground-muted">{item.reason}</p>
                <p className="mt-1 text-xs font-medium text-foreground">{item.nextStep}</p>
              </a>
            ))}
          </div>
        </WorkspacePanel>
      ) : (
        <WorkstationClearedState lens="upcoming" />
      )}

      <div className="mt-12 flex flex-wrap gap-4 border-t border-border pt-8">
        <ButtonLink href="/schedule" variant="ghost" size="sm">
          {WORKSTATION_COPY.continuation.openSchedule}
        </ButtonLink>
        <ButtonLink href="/workstation" variant="ghost" size="sm">
          {WORKSTATION_COPY.continuation.backToToday}
        </ButtonLink>
      </div>
    </div>
  );
}
