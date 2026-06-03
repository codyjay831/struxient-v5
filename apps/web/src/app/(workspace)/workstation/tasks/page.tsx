import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { ButtonLink } from "@/components/ui/button";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { queryWorkstationWorkItems } from "@/lib/workstation-query";
import {
  parseWorkstationUrlState,
  buildWorkstationUrl,
} from "@/lib/workstation/url-state";
import { WorkstationWorkPanel } from "@/components/workstation/workstation-work-panel";
import { WorkstationPanelContent } from "@/components/workstation/workstation-panel-content";
import {
  WorkstationQueueItem,
  WorkstationClearedState,
} from "@/components/workstation/workstation-ui";

export const dynamic = "force-dynamic";

export default async function WorkstationTasksLensPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await getRequestContextOrThrow();
  const sp = await searchParams;
  const urlState = parseWorkstationUrlState(sp);
  const selectedId = urlState.selected?.id;

  const allItems = await queryWorkstationWorkItems(ctx.organizationId, ctx.role);
  const taskItems = allItems.filter((i) => i.kind === "task");

  const selectedItem = selectedId ? taskItems.find((i) => i.id === selectedId) : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground-subtle">
          Active Tasks
        </h2>
        <div className="flex items-center gap-4 text-xs font-medium text-foreground-muted">
          <span>{taskItems.length} total tasks</span>
        </div>
      </div>

      {selectedItem && (
        <div id="selected-item-panel" className="scroll-mt-6">
          <WorkstationWorkPanel item={selectedItem}>
            <WorkstationPanelContent item={selectedItem} />
          </WorkstationWorkPanel>
        </div>
      )}

      {taskItems.length > 0 ? (
        <div className="grid gap-2">
          {taskItems.map((item) => (
            <WorkstationQueueItem
              key={item.id}
              item={{
                ...item,
                href: buildWorkstationUrl(urlState, {
                  selected: { id: item.id, kind: item.kind },
                }),
              }}
              isSelected={selectedId === item.id}
            />
          ))}
        </div>
      ) : (
        <WorkstationClearedState />
      )}

      <div className="mt-12 flex flex-wrap gap-4 border-t border-border pt-8">
        <ButtonLink href="/leads" variant="ghost" size="sm">
          Browse Sales
        </ButtonLink>
        <ButtonLink href="/jobs" variant="ghost" size="sm">
          {WORKSTATION_COPY.continuation.openJobs}
        </ButtonLink>
        <ButtonLink href="/workstation" variant="ghost" size="sm">
          {WORKSTATION_COPY.continuation.backToToday}
        </ButtonLink>
      </div>
    </div>
  );
}
