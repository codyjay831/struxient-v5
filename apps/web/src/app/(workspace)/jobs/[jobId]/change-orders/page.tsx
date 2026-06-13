import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { ChangeOrderWorkspace } from "@/components/jobs/change-order-workspace";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { jobDetailPath } from "@/lib/change-order-flow";
import { loadChangeOrderWorkspace } from "@/lib/change-order-loader";
import { FileText } from "lucide-react";

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
    focusRevisionId: focus ?? null,
  });

  if (!workspace) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Execution" },
          { label: "Jobs", href: "/jobs" },
          { label: workspace.jobTitle, href: jobDetailPath(workspace.jobId) },
          { label: "Change Orders" },
        ]}
      />

      <PageHeader
        title="Change Orders"
        description="Formal commercial scope changes for this active job. Draft, review impact, approve, then apply to execution."
        actions={
          <>
            <ButtonLink href={jobDetailPath(workspace.jobId)} variant="secondary" size="sm">
              ← Back to job
            </ButtonLink>
            <ButtonLink
              href={`/quotes/${workspace.quoteId}`}
              variant="muted"
              size="sm"
            >
              View quote
            </ButtonLink>
          </>
        }
      />

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
