import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { loadLeadSurface } from "@/lib/lead-commercial-surface/loader";
import { LeadCommercialSurface } from "@/components/work-surfaces/lead-commercial-surface";
import { Users } from "lucide-react";
import { AccessDeniedPanel } from "@/components/ui/access-denied-panel";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
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
            <Link href="/leads" className={listLinkClass}>
              ← Sales
            </Link>
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
            <Link href="/workstation" className={listLinkClass}>
              ← Workstation
            </Link>
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
          <Link href="/workstation" className={listLinkClass}>
            Back to workstation
          </Link>
        </EmptyState>
      </div>
    );
  }

  const isAssignedVisit = payload.surfaceMode === "assigned_visit";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={isAssignedVisit ? "Site visit" : payload.reviewDisplay.pageEyebrow}
        title={
          isAssignedVisit
            ? payload.lead.contactName || payload.lead.jobsiteAddressLine || payload.lead.title
            : payload.reviewDisplay.primaryName
        }
        description={
          isAssignedVisit
            ? payload.lead.jobsiteAddressLine || "Assigned sales site visit"
            : payload.reviewDisplay.contextLine
        }
        actions={
          isAssignedVisit ? (
            <Link href="/workstation" className={listLinkClass}>
              ← Workstation
            </Link>
          ) : (
            <Link href="/leads" className={listLinkClass}>
              ← Sales
            </Link>
          )
        }
      />
      <LeadCommercialSurface payload={payload} entryPoint="record" />
    </div>
  );
}
