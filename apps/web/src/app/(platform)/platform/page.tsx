import Link from "next/link";
import { format } from "date-fns";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalCard } from "@/components/ui/signal-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { getPlatformContext } from "@/lib/platform/platform-context";
import { getPlatformDashboardSummary } from "@/lib/platform/platform-dashboard";
import { shortId } from "@/lib/platform/platform-pagination";

export const dynamic = "force-dynamic";

export default async function PlatformHomePage() {
  const ctx = await getPlatformContext();
  const summary = await getPlatformDashboardSummary(ctx);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Platform Operations"
        title="Platform Home"
        description="Read-only overview of tenants, users, and recent platform activity."
      />

      <section className="mb-10">
        <SectionHeading title="At a glance" />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <li>
            <SignalCard label="Organizations" value={String(summary.organizationCount)} />
          </li>
          <li>
            <SignalCard label="Users" value={String(summary.userCount)} />
          </li>
          <li>
            <SignalCard
              label="Recent AI failures"
              value={String(summary.recentAiFailureCount)}
              hint="Last 7 days"
              tone={summary.recentAiFailureCount > 0 ? "warning" : "neutral"}
            />
          </li>
          <li>
            <SignalCard
              label="Notification failures"
              value={String(summary.recentNotificationFailureCount)}
              hint="Last 7 days"
              tone={summary.recentNotificationFailureCount > 0 ? "warning" : "neutral"}
            />
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <SectionHeading title="Recent organizations" />
        {summary.recentOrganizations.length === 0 ? (
          <EmptyState title="No organizations yet" description="Tenants will appear here once created." />
        ) : (
          <WorkspacePanel className="divide-y divide-border p-0">
            {summary.recentOrganizations.map((org) => (
              <div key={org.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <Link
                    href={`/platform/organizations/${org.id}`}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {org.name}
                  </Link>
                  <p className="text-xs text-foreground-muted">
                    {shortId(org.id)} · {format(org.createdAt, "MMM d, yyyy")}
                  </p>
                </div>
                <Link
                  href={`/platform/organizations/${org.id}`}
                  className="text-xs text-foreground-muted hover:text-foreground"
                >
                  Inspect
                </Link>
              </div>
            ))}
          </WorkspacePanel>
        )}
      </section>

      <section>
        <SectionHeading title="Recent platform audit" />
        {summary.recentAuditEvents.length === 0 ? (
          <EmptyState title="No audit events yet" description="Platform audit events will appear here." />
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
                {summary.recentAuditEvents.map((event) => (
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
