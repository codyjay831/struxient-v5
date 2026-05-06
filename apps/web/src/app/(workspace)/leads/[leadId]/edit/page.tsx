import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { Inbox } from "lucide-react";
import { updateLeadAction } from "../../lead-form-actions";
import { LeadRecordForm } from "../../lead-record-form";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const org = await getDevOrganizationOrThrow();
  const lead = await db.lead.findFirst({
    where: {
      id: leadId,
      organizationId: org.id,
    },
  });

  if (!lead) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Sales" },
            { label: "Leads", href: "/leads" },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          title="Edit lead"
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
          { label: "Sales" },
          { label: "Leads", href: "/leads" },
          { label: lead.title, href: `/leads/${lead.id}` },
          { label: "Edit" },
        ]}
      />
      <PageHeader
        title={`Edit ${lead.title}`}
        description="Update intake fields for your development organization only. Status and customer link are not editable here yet. Organization cannot be changed from this form."
        actions={
          <>
            <Link href={`/leads/${lead.id}`} className={listLinkClass}>
              ← Lead detail
            </Link>
            <Link href="/leads" className={listLinkClass}>
              All leads
            </Link>
          </>
        }
      />

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Lead record"
          description="Title is required. Leave optional fields blank to clear stored values. Empty optional values normalize to null on the server."
        />
        <LeadRecordForm
          mode="edit"
          updateFormAction={updateLeadAction.bind(null, lead.id)}
          cancelHref={`/leads/${lead.id}`}
          initial={{
            title: lead.title,
            contactName: lead.contactName,
            email: lead.email,
            phone: lead.phone,
            source: lead.source,
            sourceDetail: lead.sourceDetail,
            notes: lead.notes,
          }}
        />
      </WorkspacePanel>
    </div>
  );
}
