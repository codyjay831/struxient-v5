import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { ScopeLibrarySectionNav } from "@/components/scope-library/scope-library-section-nav";
import { ScopeLibraryTaskTemplatesPanel } from "@/components/scope-library/scope-library-task-templates";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import type { TaskTemplateLibraryRow } from "@/lib/task-template-display";

export const dynamic = "force-dynamic";

export default async function ScopeLibraryTasksPage() {
  const org = await getDevOrganizationOrThrow();

  const rows = await db.taskTemplate.findMany({
    where: { organizationId: org.id, archivedAt: null },
    orderBy: { updatedAt: "desc" },
  });

  const templates: TaskTemplateLibraryRow[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    stageKey: t.stageKey,
    category: t.category,
    instructions: t.instructions,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Sales" }, { label: "Scope Library", href: "/scope-library" }, { label: "Reusable tasks" }]}
      />
      <PageHeader
        eyebrow="Sales · Scope Library"
        title="Reusable tasks"
        description="Internal task templates with fixed execution stages—library only; quotes and jobs will copy from here when execution planning ships."
      />
      <ScopeLibrarySectionNav active="tasks" />
      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <ScopeLibraryTaskTemplatesPanel templates={templates} />
      </WorkspacePanel>
    </div>
  );
}
