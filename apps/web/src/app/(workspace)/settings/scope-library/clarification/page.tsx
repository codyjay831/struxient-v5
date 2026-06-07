import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { ScopeLibrarySectionNav } from "@/components/scope-library/scope-library-section-nav";
import { ClarificationLibraryPanel } from "@/components/scope-library/clarification-library-panel";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";

export const dynamic = "force-dynamic";

export default async function ScopeLibraryClarificationPage() {
  const ctx = await getRequestContextOrThrow();

  // #region agent log
  {
    const dbUrl = process.env.DATABASE_URL ?? "";
    const dbHost = dbUrl.match(/@([^/]+)/)?.[1] ?? "unknown";
    const dbName = dbUrl.match(/\/([^/?]+)(?:\?|$)/)?.[1] ?? "unknown";
    const tableCheck = await db.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'ClarificationQuestionSet'
      ) AS "exists"
    `;
    fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "27fb01" },
      body: JSON.stringify({
        sessionId: "27fb01",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "clarification/page.tsx:pre-query",
        message: "DB target and ClarificationQuestionSet table existence",
        data: {
          dbHost,
          dbName,
          tableExists: tableCheck[0]?.exists ?? null,
          organizationId: ctx.organizationId,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion

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
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Scope Library", href: "/settings/scope-library" },
          { label: "Clarification" },
        ]}
      />
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
