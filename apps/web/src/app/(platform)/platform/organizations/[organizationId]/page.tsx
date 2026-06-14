import { notFound } from "next/navigation";
import { format } from "date-fns";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getPlatformContext } from "@/lib/platform/platform-context";
import { getPlatformOrganizationSummary } from "@/lib/platform/platform-organizations";
import { shortId } from "@/lib/platform/platform-pagination";

export const dynamic = "force-dynamic";

function renderCountMap(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "None";
  return entries.map(([status, count]) => `${status}: ${count}`).join(" · ");
}

export default async function PlatformOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const ctx = await getPlatformContext();
  const summary = await getPlatformOrganizationSummary(ctx, organizationId);

  if (!summary) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Organizations", href: "/platform/organizations" },
          { label: summary.name },
        ]}
      />
      <PageHeader
        title={summary.name}
        description={`Tenant inspector · ${shortId(summary.id)} · ${summary.timezone}`}
      />

      <section className="mb-10 grid gap-4 lg:grid-cols-2">
        <WorkspacePanel>
          <SectionHeading title="Identity" />
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-foreground-muted">Slug</dt>
              <dd>{summary.slug ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-foreground-muted">Created</dt>
              <dd>{format(summary.createdAt, "MMM d, yyyy")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-foreground-muted">Business profile</dt>
              <dd>
                {summary.businessProfile
                  ? `${summary.businessProfile.trades.join(", ") || "No trades"} · ${summary.businessProfile.teamSize ?? "Unknown team size"}`
                  : "Not configured"}
              </dd>
            </div>
          </dl>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading title="Operational counts" />
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="text-foreground-muted">Jobs</dt>
              <dd className="mt-1">{renderCountMap(summary.jobCountsByStatus)}</dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Quotes</dt>
              <dd className="mt-1">{renderCountMap(summary.quoteCountsByStatus)}</dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Leads</dt>
              <dd className="mt-1">{renderCountMap(summary.leadCountsByStatus)}</dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Tasks</dt>
              <dd className="mt-1">{renderCountMap(summary.taskCountsByStatus)}</dd>
            </div>
          </dl>
        </WorkspacePanel>
      </section>

      <section className="mb-10">
        <SectionHeading title="Memberships" />
        <WorkspacePanel className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-foreground-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {summary.memberships.map((membership) => (
                <tr key={membership.userId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{membership.name ?? "—"}</td>
                  <td className="px-4 py-2 text-foreground-muted">{membership.email ?? "—"}</td>
                  <td className="px-4 py-2">{membership.role}</td>
                  <td className="px-4 py-2 text-foreground-muted">
                    {format(membership.createdAt, "MMM d, yyyy")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </WorkspacePanel>
      </section>

      <section className="mb-10">
        <SectionHeading title="Pending invites" />
        {summary.pendingInvites.length === 0 ? (
          <EmptyState title="No pending invites" />
        ) : (
          <WorkspacePanel className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-foreground-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                {summary.pendingInvites.map((invite) => (
                  <tr key={invite.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{invite.email}</td>
                    <td className="px-4 py-2">{invite.role}</td>
                    <td className="px-4 py-2 text-foreground-muted">
                      {format(invite.expiresAt, "MMM d, yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </WorkspacePanel>
        )}
      </section>

      <section className="mb-10">
        <SectionHeading title="Recent AI failures (redacted)" />
        {summary.recentAiFailures.length === 0 ? (
          <EmptyState title="No recent AI failures" />
        ) : (
          <WorkspacePanel className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-foreground-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Feature</th>
                  <th className="px-4 py-2 font-medium">Provider</th>
                  <th className="px-4 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentAiFailures.map((failure) => (
                  <tr key={failure.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-foreground-muted">
                      {format(failure.createdAt, "MMM d, yyyy HH:mm")}
                    </td>
                    <td className="px-4 py-2">{failure.feature}</td>
                    <td className="px-4 py-2 text-foreground-muted">
                      {failure.provider}/{failure.model}
                    </td>
                    <td className="px-4 py-2 text-foreground-muted">{failure.errorMessage ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </WorkspacePanel>
        )}
      </section>

      <section className="mb-10">
        <SectionHeading title="AI usage (last 30 days)" />
        {summary.aiCountsByFeature.length === 0 ? (
          <EmptyState title="No AI usage recorded" />
        ) : (
          <WorkspacePanel className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-foreground-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Feature</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {summary.aiCountsByFeature.map((row) => (
                  <tr
                    key={`${row.feature}-${row.status}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-2">{row.feature}</td>
                    <td className="px-4 py-2">{row.status}</td>
                    <td className="px-4 py-2">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </WorkspacePanel>
        )}
      </section>

      <section className="mb-10">
        <SectionHeading title="Notification failures" />
        {summary.recentNotificationFailures.length === 0 ? (
          <EmptyState title="No notification failures" />
        ) : (
          <WorkspacePanel className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-foreground-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Kind</th>
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentNotificationFailures.map((failure) => (
                  <tr key={failure.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-foreground-muted">
                      {format(failure.createdAt, "MMM d, yyyy HH:mm")}
                    </td>
                    <td className="px-4 py-2">{failure.kind}</td>
                    <td className="px-4 py-2">{failure.title}</td>
                    <td className="px-4 py-2 text-foreground-muted">{failure.errorMessage ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </WorkspacePanel>
        )}
      </section>

      <section>
        <SectionHeading title="Platform audit (tenant)" />
        {summary.recentPlatformAuditEvents.length === 0 ? (
          <EmptyState title="No platform audit events for this tenant" />
        ) : (
          <WorkspacePanel className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-foreground-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Actor</th>
                  <th className="px-4 py-2 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentPlatformAuditEvents.map((event) => (
                  <tr key={event.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-foreground-muted">
                      {format(event.createdAt, "MMM d, yyyy HH:mm")}
                    </td>
                    <td className="px-4 py-2">{event.action}</td>
                    <td className="px-4 py-2 text-foreground-muted">
                      {event.actorType === "SYSTEM"
                        ? "System"
                        : event.actorEmailSnapshot ?? event.actorUserId ?? "Unknown"}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge
                        label={event.outcome}
                        tone={
                          event.outcome === "SUCCESS"
                            ? "approved"
                            : event.outcome === "DENIED"
                              ? "danger"
                              : "warning"
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </WorkspacePanel>
        )}
      </section>
    </div>
  );
}
