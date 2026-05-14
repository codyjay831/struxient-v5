import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { ScopeLibrarySectionNav } from "@/components/scope-library/scope-library-section-nav";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { Zap } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function ScopeLibrarySignalsPage() {
  const ctx = await getRequestContextOrThrow();

  // Collect all signals from task templates and line item template tasks
  const [taskTemplates, lineItemTasks] = await Promise.all([
    db.taskTemplate.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      select: { providesSignals: true, requiresSignals: true },
    }),
    db.lineItemTemplateTask.findMany({
      where: { lineItemTemplate: { organizationId: ctx.organizationId, archivedAt: null } },
      select: { providesSignals: true, requiresSignals: true },
    }),
  ]);

  const allSignals = new Set<string>();
  const providers = new Set<string>();
  const consumers = new Set<string>();

  taskTemplates.forEach(t => {
    t.providesSignals.forEach(s => { allSignals.add(s); providers.add(s); });
    t.requiresSignals.forEach(s => { allSignals.add(s); consumers.add(s); });
  });

  lineItemTasks.forEach(t => {
    t.providesSignals.forEach(s => { allSignals.add(s); providers.add(s); });
    t.requiresSignals.forEach(s => { allSignals.add(s); consumers.add(s); });
  });

  const sortedSignals = Array.from(allSignals).sort();

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Sales" }, { label: "Scope Library", href: "/scope-library" }, { label: "Signals" }]}
      />
      <PageHeader
        title="Signal catalog"
        description="All named facts currently used in your reusable tasks and line items."
      />
      <ScopeLibrarySectionNav active="signals" />
      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        {sortedSignals.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No signals yet"
            description="Signals are created when you add 'Provides' or 'Requires' to reusable tasks."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedSignals.map(signal => (
              <div key={signal} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-3 w-3 text-primary" />
                  <span className="text-sm font-medium text-foreground">{signal}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  {providers.has(signal) && (
                    <span className="rounded bg-approved/10 px-1.5 py-0.5 text-[10px] font-medium text-approved-strong">
                      Provided
                    </span>
                  )}
                  {consumers.has(signal) && (
                    <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning-strong">
                      Required
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </WorkspacePanel>
    </div>
  );
}
