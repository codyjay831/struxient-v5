import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { queryWorkstationWorkItems } from "@/lib/workstation-query";
import { redirect } from "next/navigation";
import {
  parseWorkstationUrlState,
  buildWorkstationUrl,
} from "@/lib/workstation/url-state";
import { WorkstationSelectionModal } from "@/components/workstation/workstation-selection-modal";
import { usesGenericPanel } from "@/lib/workstation/uses-generic-panel";
import { WorkstationPanelContent } from "@/components/workstation/workstation-panel-content";
import { resolveExecutableWorkItem } from "@/lib/workstation/schedule-event-task-routing";
import {
  WorkstationQueueItem,
  WorkstationClearedState,
} from "@/components/workstation/workstation-ui";
import { ButtonLink } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function WorkstationScheduleLensPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await getRequestContextOrThrow();
  const sp = await searchParams;
  const urlState = parseWorkstationUrlState(sp);
  const selectedId = urlState.selected?.id;

  const allItems = await queryWorkstationWorkItems(ctx.organizationId, ctx.role, ctx.userId);
  const scheduleItems = allItems.filter(
    (item) =>
      item.kind === "schedule" ||
      (item.kind === "task" &&
        (item.status === "Overdue" ||
          item.status === "Due today" ||
          item.status === "Needs schedule")),
  );
  const todayCount = scheduleItems.filter(
    (item) => item.status === "Today" || item.status === "Due today",
  ).length;
  const missedCount = scheduleItems.filter(
    (item) => item.status === "Missed" || item.status === "Overdue",
  ).length;
  const unscheduledCount = scheduleItems.filter(
    (item) => item.status === "Needs schedule",
  ).length;

  const selectedItemRaw = selectedId
    ? scheduleItems.find((i) => i.id === selectedId) ??
      allItems.find((i) => i.id === selectedId)
    : null;
  const selectedItem = selectedItemRaw
    ? resolveExecutableWorkItem(selectedItemRaw, allItems)
    : null;
  if (selectedId && !selectedItem) {
    const cleared = buildWorkstationUrl(urlState, { selected: undefined });
    redirect(`/workstation/schedule${cleared}`);
  }

  const buildItemHref = (item: (typeof scheduleItems)[number]) =>
    buildWorkstationUrl(urlState, { selected: { id: item.id, kind: item.kind } });

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

      <WorkstationSelectionModal
        item={selectedItem ?? null}
        genericContent={
          selectedItem && usesGenericPanel(selectedItem) ? (
            <WorkstationPanelContent item={selectedItem} />
          ) : undefined
        }
      />

      {scheduleItems.length > 0 ? (
        <div className="grid gap-2">
          {scheduleItems.slice(0, 20).map((item) => {
            const executable = resolveExecutableWorkItem(item, allItems);
            return (
              <WorkstationQueueItem
                key={item.id}
                item={{ ...executable, href: buildItemHref(executable) }}
                isSelected={
                  selectedId === item.id || selectedId === executable.id
                }
              />
            );
          })}
        </div>
      ) : (
        <WorkstationClearedState lens="upcoming" />
      )}

      <div className="mt-12 flex flex-wrap gap-4 border-t border-border pt-8">
        <ButtonLink href="/workstation" variant="ghost" size="sm">
          {WORKSTATION_COPY.continuation.backToToday}
        </ButtonLink>
      </div>
    </div>
  );
}
