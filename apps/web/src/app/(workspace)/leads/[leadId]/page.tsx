import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { loadLeadCommercialSurface } from "@/lib/lead-commercial-surface/loader";
import { LeadCommercialSurface } from "@/components/work-surfaces/lead-commercial-surface";
import { Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const ctx = await getRequestContextOrThrow();

  const payload = await loadLeadCommercialSurface(leadId, ctx);
  if (!payload) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Leads", href: "/leads" },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          eyebrow="Lead"
          title="Lead"
          description="No lead exists for this id in the current development organization. Links only resolve within your tenant scope—not across organizations."
          actions={
            <Link href="/leads" className={listLinkClass}>
              ← Leads list
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
          icon={Inbox}
          title="Lead not found"
          description="This id is not a lead record in the development organization, or it belongs to another tenant. When auth exists, routing will follow your real org context."
        >
          <Link href="/leads" className={listLinkClass}>
            Back to leads
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Leads", href: "/leads" },
          { label: payload.lead.title },
        ]}
      />
      <LeadCommercialSurface payload={payload} entryPoint="record" />
    </div>
  );
}
