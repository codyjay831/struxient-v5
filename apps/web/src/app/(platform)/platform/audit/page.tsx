import Link from "next/link";
import { format } from "date-fns";
import { PlatformAuditOutcome } from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getPlatformContext } from "@/lib/platform/platform-context";
import { listPlatformAuditEvents } from "@/lib/platform/platform-audit-query";

export const dynamic = "force-dynamic";

function buildPageHref(
  page: number,
  filters: {
    actorUserId?: string;
    organizationId?: string;
    action?: string;
    outcome?: string;
  },
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (filters.actorUserId) params.set("actorUserId", filters.actorUserId);
  if (filters.organizationId) params.set("organizationId", filters.organizationId);
  if (filters.action) params.set("action", filters.action);
  if (filters.outcome) params.set("outcome", filters.outcome);
  const query = params.toString();
  return query ? `/platform/audit?${query}` : "/platform/audit";
}

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams?: Promise<{
    page?: string;
    actorUserId?: string;
    organizationId?: string;
    action?: string;
    outcome?: string;
    pageSize?: string;
  }>;
}) {
  const sq = await (searchParams ??
    Promise.resolve({} as {
      page?: string;
      actorUserId?: string;
      organizationId?: string;
      action?: string;
      outcome?: string;
      pageSize?: string;
    }));
  const ctx = await getPlatformContext();
  const result = await listPlatformAuditEvents(ctx, {
    page: sq.page ? Number(sq.page) : undefined,
    pageSize: sq.pageSize ? Number(sq.pageSize) : undefined,
    actorUserId: sq.actorUserId,
    organizationId: sq.organizationId,
    action: sq.action,
    outcome: sq.outcome as PlatformAuditOutcome | undefined,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Platform Operations"
        title="Platform audit"
        description="Append-only audit feed for platform operator actions."
      />

      <form className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          name="actorUserId"
          defaultValue={sq.actorUserId ?? ""}
          placeholder="Actor user ID"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <input
          name="organizationId"
          defaultValue={sq.organizationId ?? ""}
          placeholder="Organization ID"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <input
          name="action"
          defaultValue={sq.action ?? ""}
          placeholder="Action (e.g. platform.access.bootstrapped)"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <select
          name="outcome"
          defaultValue={sq.outcome ?? ""}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="">All outcomes</option>
          {Object.values(PlatformAuditOutcome).map((outcome) => (
            <option key={outcome} value={outcome}>
              {outcome}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm font-medium sm:col-span-2 lg:col-span-1"
        >
          Apply filters
        </button>
      </form>

      {result.items.length === 0 ? (
        <EmptyState title="No audit events found" description="Adjust filters or check back later." />
      ) : (
        <>
          <WorkspacePanel className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-foreground-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Actor</th>
                  <th className="px-4 py-2 font-medium">Target</th>
                  <th className="px-4 py-2 font-medium">Outcome</th>
                  <th className="px-4 py-2 font-medium">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((event) => (
                  <tr key={event.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-2 text-foreground-muted">
                      {format(event.createdAt, "MMM d, yyyy HH:mm")}
                    </td>
                    <td className="px-4 py-2">{event.action}</td>
                    <td className="px-4 py-2 text-foreground-muted">
                      {event.actorType === "SYSTEM"
                        ? "System"
                        : event.actorEmailSnapshot ?? event.actorUserId ?? "Unknown"}
                    </td>
                    <td className="px-4 py-2 text-foreground-muted">
                      {event.targetType}
                      {event.targetId ? ` · ${event.targetId.slice(-8)}` : ""}
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
                    <td className="max-w-xs px-4 py-2">
                      {event.metadataJson ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-foreground-muted">
                            View metadata
                          </summary>
                          <pre className="mt-2 overflow-x-auto rounded-md bg-foreground/[0.03] p-2 text-[10px]">
                            {JSON.stringify(event.metadataJson, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-foreground-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </WorkspacePanel>

          <div className="mt-4 flex items-center justify-between text-sm text-foreground-muted">
            <span>
              Page {result.page} of {result.totalPages} · {result.totalCount} total
            </span>
            <div className="flex gap-2">
              {result.page > 1 ? (
                <Link
                  href={buildPageHref(result.page - 1, sq)}
                  className="hover:text-foreground"
                >
                  Previous
                </Link>
              ) : null}
              {result.page < result.totalPages ? (
                <Link
                  href={buildPageHref(result.page + 1, sq)}
                  className="hover:text-foreground"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
