import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { ScopeLibraryLinePresetsPanel } from "@/components/scope-library/scope-library-line-presets";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import type { LineItemTemplateLibraryRow } from "@/lib/line-item-template-display";
import { formatCentsAsDollarInput } from "@/lib/quote-display";

export const dynamic = "force-dynamic";

export default async function ScopeLibraryPage() {
  const org = await getDevOrganizationOrThrow();

  const rows = await db.lineItemTemplate.findMany({
    where: { organizationId: org.id, archivedAt: null },
    orderBy: { updatedAt: "desc" },
  });

  const templates: LineItemTemplateLibraryRow[] = rows.map((t) => ({
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
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb items={[{ label: "Sales" }, { label: "Scope Library" }]} />
      <PageHeader
        eyebrow="Sales"
        title="Scope Library"
        description="Reusable quote scope, proposal wording, and future execution defaults."
      />
      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <ScopeLibraryLinePresetsPanel templates={templates} />
      </WorkspacePanel>
    </div>
  );
}
