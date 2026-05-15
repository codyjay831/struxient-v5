import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { ScopeLibrarySectionNav } from "@/components/scope-library/scope-library-section-nav";
import { ScopeLibraryStagesPanel } from "@/components/scope-library/scope-library-stages";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";

export const dynamic = "force-dynamic";

export default async function ScopeLibraryStagesPage() {
  const ctx = await getRequestContextOrThrow();

  const stages = await db.stage.findMany({
    where: { organizationId: ctx.organizationId, archivedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Settings", href: "/settings" }, { label: "Scope Library", href: "/settings/scope-library" }, { label: "Stages" }]}
      />
      <PageHeader
        title="Execution stages"
        description="Configure the phases used for grouping tasks across your organization."
      />
      <ScopeLibrarySectionNav active="stages" />
      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <ScopeLibraryStagesPanel stages={stages} />
      </WorkspacePanel>
    </div>
  );
}
