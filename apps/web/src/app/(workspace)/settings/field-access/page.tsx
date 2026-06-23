import Link from "next/link";
import { getSettingsRequestContextOrNull } from "@/lib/auth-context";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { AccessDeniedPanel } from "@/components/ui/access-denied-panel";
import { AccessControls } from "./access-controls";
import { db } from "@/lib/db";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function FieldAccessSettingsPage() {
  const ctx = await getSettingsRequestContextOrNull();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Field access"
          description="Manage crews and subcontractor job visibility."
        />
        <AccessDeniedPanel
          description="Only Owners and Admins can manage field access settings."
          backHref="/settings"
          backLabel="Back to Settings"
        />
      </div>
    );
  }

  const [crews, jobs, collaboratorGrants] = await Promise.all([
    db.crew.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
      select: { id: true, name: true, archivedAt: true },
    }),
    db.job.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true },
    }),
    db.jobCollaborator.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        job: { select: { title: true } },
        user: { select: { email: true } },
      },
      take: 50,
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Field access"
        description="Configure how field staff and subcontractors see assigned work."
        actions={
          <>
            <Link href="/settings" className={listLinkClass}>
              ← All settings
            </Link>
            <Link href="/settings/team" className={listLinkClass}>
              Team
            </Link>
          </>
        }
      />

      <WorkspacePanel>
        <AccessControls
          crews={crews.map((crew) => ({
            id: crew.id,
            name: crew.name,
            archived: Boolean(crew.archivedAt),
          }))}
          jobs={jobs}
          collaboratorGrants={collaboratorGrants.map((grant) => ({
            id: grant.id,
            jobTitle: grant.job.title,
            email: grant.user.email ?? "unknown",
            status: grant.status,
          }))}
        />
      </WorkspacePanel>
    </div>
  );
}
