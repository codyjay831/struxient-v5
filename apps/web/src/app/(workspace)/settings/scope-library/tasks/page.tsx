import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { ScopeLibrarySectionNav } from "@/components/scope-library/scope-library-section-nav";
import { ScopeLibraryTaskTemplatesPanel } from "@/components/scope-library/scope-library-task-templates";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import type { TaskTemplateLibraryRow } from "@/lib/task-template-display";

export const dynamic = "force-dynamic";

export default async function ScopeLibraryTasksPage() {
  const ctx = await getRequestContextOrThrow();

  const [rows, stages, allTags] = await Promise.all([
    db.taskTemplate.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      include: {
        stage: { select: { name: true } },
        tags: { select: { id: true, name: true, color: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.stage.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.tag.findMany({
      where: { organizationId: ctx.organizationId, status: "ACTIVE" },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const templates: TaskTemplateLibraryRow[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    stageId: t.stageId,
    stageName: t.stage?.name,
    category: t.category,
    instructions: t.instructions,
    providesSignals: t.providesSignals,
    requiresSignals: t.requiresSignals,
    tags: t.tags,
    hardSignal: t.hardSignal,
    requirementsJson: t.requirementsJson,
    partsRequiredJson: t.partsRequiredJson,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Settings", href: "/settings" }, { label: "Scope Library", href: "/settings/scope-library" }, { label: "Reusable tasks" }]}
      />
      <PageHeader
        title="Reusable tasks"
        description="Internal task templates with Signal-based readiness. library only; quotes and jobs will copy from here."
      />
      <ScopeLibrarySectionNav active="tasks" />
      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <ScopeLibraryTaskTemplatesPanel templates={templates} stages={stages} availableTags={allTags} />
      </WorkspacePanel>
    </div>
  );
}
