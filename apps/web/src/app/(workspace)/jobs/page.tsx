import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { FolderKanban } from "lucide-react";

export default function JobsRecordPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Work"
        title="Jobs"
        description="Open and manage job records—filters, columns, and detail routes will attach here. This is the Work area for job records, not the Workstation attention lens."
        actions={
          <>
            <PlaceholderButton>New job</PlaceholderButton>
            <PlaceholderButton>Import</PlaceholderButton>
          </>
        }
      />

      <WorkspacePanel className="mb-8" padding="compact">
        <p className="text-sm text-foreground-muted">
          <span className="font-medium text-foreground">Workstation vs this page:</span>{" "}
          Use{" "}
          <Link
            href="/workstation/jobs"
            className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            Workstation → Jobs lens
          </Link>{" "}
          for “what needs attention on jobs” across statuses. Use this route when
          you are explicitly navigating the job catalog.
        </p>
      </WorkspacePanel>

      <SectionHeading
        title="All jobs"
        description="Search, saved views, and pagination will map to org-scoped queries. Row actions will open `/jobs/{id}` for the Work record shell—not the Workstation lens."
      />

      <EmptyState
        icon={FolderKanban}
        title="No jobs to show yet"
        description="Once Prisma and org data exist, this grid becomes your canonical job directory. Each row will deep-link to the job workspace shell; nothing is linked while the list is empty."
      >
        <PlaceholderButton>Open first job (soon)</PlaceholderButton>
      </EmptyState>
    </div>
  );
}
