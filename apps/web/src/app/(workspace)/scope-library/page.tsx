import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { ScopeLibrarySectionNav } from "@/components/scope-library/scope-library-section-nav";
import { ScopeLibraryLinePresetsPanel } from "@/components/scope-library/scope-library-line-presets";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import type { LineItemTemplateLibraryRow } from "@/lib/line-item-template-display";
import { buildDefaultExecutionSummaryLine } from "@/lib/line-item-template-execution-summary";
import { formatCentsAsDollarInput } from "@/lib/quote-display";

export const dynamic = "force-dynamic";

export default async function ScopeLibraryPage() {
  const org = await getDevOrganizationOrThrow();

  const rows = await db.lineItemTemplate.findMany({
    where: { organizationId: org.id, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      defaultExecutionTasks: {
        select: { stageKey: true, category: true },
      },
    },
  });

  const templates: LineItemTemplateLibraryRow[] = rows.map((t) => {
    const exec = buildDefaultExecutionSummaryLine(t.defaultExecutionTasks);
    return {
      id: t.id,
      description: t.description,
      defaultQuantityDisplay: t.defaultQuantity.toString(),
      defaultUnitAmountCents: t.defaultUnitAmountCents,
      defaultUnitAmountDollars: formatCentsAsDollarInput(t.defaultUnitAmountCents),
      defaultInternalNotes: t.defaultInternalNotes,
      defaultCustomerScopeTitle: t.defaultCustomerScopeTitle,
      defaultCustomerScopeDescription: t.defaultCustomerScopeDescription,
      defaultCustomerIncludedNotes: t.defaultCustomerIncludedNotes,
      defaultCustomerExcludedNotes: t.defaultCustomerExcludedNotes,
      defaultCustomerPresentationGroup: t.defaultCustomerPresentationGroup,
      hasCustomerProposalDefaults: Boolean(
        t.defaultCustomerScopeTitle ||
          t.defaultCustomerScopeDescription ||
          t.defaultCustomerIncludedNotes ||
          t.defaultCustomerExcludedNotes ||
          t.defaultCustomerPresentationGroup,
      ),
      executionSummary: { taskCount: exec.taskCount, summaryLine: exec.summaryLine },
    };
  });

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb items={[{ label: "Sales" }, { label: "Scope Library" }]} />
      <PageHeader
        title="Scope Library"
        description="Saved line items (commercial presets) and reusable internal tasks. Applying a preset on a quote copies values; default execution on a saved line item is copied later the same way—never live-linked."
      />
      <ScopeLibrarySectionNav active="presets" />
      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <ScopeLibraryLinePresetsPanel templates={templates} />
      </WorkspacePanel>
    </div>
  );
}
