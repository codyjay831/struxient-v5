import Link from "next/link";
import { format } from "date-fns";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getPlatformContext } from "@/lib/platform/platform-context";
import { listPlatformUsers } from "@/lib/platform/platform-users";
import { shortId } from "@/lib/platform/platform-pagination";

export const dynamic = "force-dynamic";

function buildPageHref(page: number, q?: string): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/platform/users?${query}` : "/platform/users";
}

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; q?: string; pageSize?: string }>;
}) {
  const sq = await (searchParams ??
    Promise.resolve({} as { page?: string; q?: string; pageSize?: string }));
  const ctx = await getPlatformContext();
  const result = await listPlatformUsers(ctx, {
    page: sq.page ? Number(sq.page) : undefined,
    pageSize: sq.pageSize ? Number(sq.pageSize) : undefined,
    q: sq.q,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Platform Operations"
        title="Users"
        description="Global user directory with contractor memberships. List-only in MVP."
      />

      <form className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={sq.q ?? ""}
          placeholder="Search name or email (min 2 chars)"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm font-medium"
        >
          Search
        </button>
      </form>

      {result.items.length === 0 ? (
        <EmptyState title="No users found" description="Try a different search or check back later." />
      ) : (
        <>
          <WorkspacePanel className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-foreground-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Short ID</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Verified</th>
                  <th className="px-4 py-2 font-medium">Last active org</th>
                  <th className="px-4 py-2 font-medium">Memberships</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{user.name ?? "—"}</td>
                    <td className="px-4 py-2 text-foreground-muted">{user.email ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs text-foreground-muted">
                      {shortId(user.id)}
                    </td>
                    <td className="px-4 py-2 text-foreground-muted">
                      {format(user.createdAt, "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge
                        label={user.emailVerified ? "Verified" : "Unverified"}
                        tone={user.emailVerified ? "approved" : "neutral"}
                      />
                    </td>
                    <td className="px-4 py-2 text-foreground-muted">
                      {user.lastActiveOrganizationName ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-foreground-muted">
                      {user.memberships.length > 0
                        ? user.memberships
                            .map((m) => `${m.organizationName} (${m.role})`)
                            .join("; ")
                        : "—"}
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
                <Link href={buildPageHref(result.page - 1, sq.q)} className="hover:text-foreground">
                  Previous
                </Link>
              ) : null}
              {result.page < result.totalPages ? (
                <Link href={buildPageHref(result.page + 1, sq.q)} className="hover:text-foreground">
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
