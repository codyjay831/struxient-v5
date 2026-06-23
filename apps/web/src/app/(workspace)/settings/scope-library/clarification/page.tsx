import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { ScopeLibrarySectionNav } from "@/components/scope-library/scope-library-section-nav";
import { ClarificationLibraryPanel } from "@/components/scope-library/clarification-library-panel";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";

export const dynamic = "force-dynamic";

export default async function ScopeLibraryClarificationPage() {
  const ctx = await getRequestContextOrThrow();

  const [sets, tags] = await Promise.all([
    db.clarificationQuestionSet.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ updatedAt: "desc" }],
      include: {
        questions: {
          orderBy: { sortOrder: "asc" },
          include: {
            options: { orderBy: { sortOrder: "asc" } },
          },
        },
        tags: { select: { id: true, name: true } },
      },
    }),
    db.tag.findMany({
      where: { organizationId: ctx.organizationId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Clarification Library"
        description="Build reusable scope clarification question sets with tags, aliases, version-safe edits, and AI-assisted drafting."
      />
      <ScopeLibrarySectionNav active="clarification" />
      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <ClarificationLibraryPanel
          initialSets={sets.map((set) => ({
            id: set.id,
            key: set.key,
            version: set.version,
            label: set.label,
            status: set.status,
            description: set.description ?? "",
            aliases: set.aliases,
            keywords: set.keywords,
            mergedIntoKey: "",
            tagIds: set.tags.map((tag) => tag.id),
            questions: set.questions.map((question) => ({
              key: question.key,
              label: question.label,
              inputType: question.inputType,
              helpText: question.helpText ?? "",
              allowOther: question.allowOther,
              unit: question.unit ?? "",
              customerFacing: question.customerFacing,
              aliases: question.aliases,
              options: question.options.map((option) => ({
                key: option.key,
                label: option.label,
                aliases: option.aliases,
              })),
            })),
          }))}
          availableTags={tags}
        />
      </WorkspacePanel>
    </div>
  );
}
