import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { ScopeLibrarySectionNav } from "@/components/scope-library/scope-library-section-nav";
import { TagManagementPanel } from "@/components/scope-library/tag-management-panel";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";

export const dynamic = "force-dynamic";

export default async function ScopeLibraryTagsPage() {
  const ctx = await getRequestContextOrThrow();

  const tags = await db.tag.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          lineItemTemplates: true,
          taskTemplates: true,
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Tag Library"
        description="Manage organization-wide tags for line items and tasks. Merge duplicates, archive unused tags, and manage aliases to keep your library clean."
      />
      <ScopeLibrarySectionNav active="tags" />
      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <TagManagementPanel initialTags={tags} />
      </WorkspacePanel>
    </div>
  );
}
