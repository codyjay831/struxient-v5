import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ChangeOrderWorkspace } from "@/components/jobs/change-order-workspace";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { jobDetailPath } from "@/lib/change-order-flow";
import { loadChangeOrderWorkspace } from "@/lib/change-order-loader";
import { FileText } from "lucide-react";
import { quoteAuthoringHref } from "@/lib/opportunity-tab-routing";

export const dynamic = "force-dynamic";

export default async function JobChangeOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ focus?: string }>;
}) {
  const { jobId } = await params;
  const { focus } = await searchParams;
  const id = jobId.trim();
  if (!id) {
    notFound();
  }

  const ctx = await getRequestContextOrThrow();
  const workspace = await loadChangeOrderWorkspace({
    organizationId: ctx.organizationId,
    jobId: id,
    role: ctx.role,
    focusChangeOrderId: focus ?? null,
  });

  if (!workspace) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Change Orders"
        description="Create a customer-facing Change Order for signed scope changes. This does not mutate the original quote."
        actions={
          <>
            <ButtonLink href={jobDetailPath(workspace.jobId)} variant="secondary" size="sm">
              ← Back to job
            </ButtonLink>
            <ButtonLink
              href={quoteAuthoringHref({
                quoteId: workspace.quoteId,
                leadId: workspace.quoteLeadId,
              })}
              variant="muted"
              size="sm"
            >
              View quote
            </ButtonLink>
          </>
        }
      />

      {workspace.changeOrders.length > 0 ? (
        <p className="mb-4 text-sm text-foreground-muted">
          {workspace.changeOrders.length} Change Order(s) on this job.
        </p>
      ) : null}

      {!workspace.quoteId ? (
        <EmptyState
          icon={FileText}
          title="No linked quote"
          description="Change Orders require a quote linked to this job."
        >
          <ButtonLink href={jobDetailPath(workspace.jobId)} variant="secondary" size="sm">
            Back to job
          </ButtonLink>
        </EmptyState>
      ) : (
        <ChangeOrderWorkspace data={workspace} />
      )}
    </div>
  );
}
