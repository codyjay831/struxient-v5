import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { workspaceContentWidth } from "@/components/shell/shell-layout-classes";
import { ButtonLink } from "@/components/ui/button";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { loadLeadSurface } from "@/lib/lead-commercial-surface/loader";
import { loadOpportunityWorkspace } from "@/lib/lead-commercial-surface/opportunity-workspace-loader.server";
import { LeadCommercialSurface } from "@/components/work-surfaces/lead-commercial-surface";
import { OpportunityWorkspaceShell } from "@/components/work-surfaces/opportunity-workspace-shell";
import { parseOpportunityWorkspaceTab } from "@/lib/opportunity-tab-routing";
import { Users } from "lucide-react";
import { AccessDeniedPanel } from "@/components/ui/access-denied-panel";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { leadId } = await params;
  const { tab: tabParam } = await searchParams;
  const initialTab = parseOpportunityWorkspaceTab(tabParam);

  let ctx;
  try {
    ctx = await getRequestContextOrThrow();
  } catch {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="Sales"
          title="Lead review"
          actions={
            <ButtonLink href="/leads" variant="muted" size="sm">
              ← Sales
            </ButtonLink>
          }
        />
        <AccessDeniedPanel description="This role cannot access lead records." />
      </div>
    );
  }

  const payload = await loadLeadSurface(leadId, ctx);
  if (!payload) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="Sales"
          title="Lead not found"
          description="No record exists for this id in your organization. Links only resolve within your tenant scope."
          actions={
            <ButtonLink href="/workstation" variant="muted" size="sm">
              ← Workstation
            </ButtonLink>
          }
        />
        <WorkspacePanel padding="compact" className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Requested id
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{leadId}</p>
        </WorkspacePanel>
        <EmptyState
          icon={Users}
          title="Opportunity not found"
          description="This id is not a valid sales record in your organization, or you do not have access to it."
        >
          <ButtonLink href="/workstation" variant="muted" size="sm">
            Back to workstation
          </ButtonLink>
        </EmptyState>
      </div>
    );
  }

  const isAssignedVisit = payload.surfaceMode === "assigned_visit";

  if (isAssignedVisit) {
    return (
      <div className={workspaceContentWidth.default}>
        <PageHeader
          variant="compact"
          title={
            payload.lead.contactName ||
            payload.lead.jobsiteAddressLine ||
            payload.lead.title
          }
          description={payload.lead.jobsiteAddressLine || "Assigned sales site visit"}
          actions={
            <ButtonLink href="/workstation" variant="muted" size="sm">
              ← Workstation
            </ButtonLink>
          }
        />
        <LeadCommercialSurface payload={payload} entryPoint="record" />
      </div>
    );
  }

  const workspace = await loadOpportunityWorkspace(leadId, ctx);
  if (!workspace) {
    return (
      <div className={workspaceContentWidth.wide}>
        <EmptyState icon={Users} title="Opportunity unavailable" />
      </div>
    );
  }

  return (
    <OpportunityWorkspaceShell
      key={`${leadId}:${initialTab}:${workspace.activeQuoteId ?? "none"}`}
      payload={workspace.lead}
      activeQuoteSurface={workspace.activeQuoteSurface}
      initialTab={initialTab}
    />
  );
}
