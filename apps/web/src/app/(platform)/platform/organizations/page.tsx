import Link from "next/link";
import { format } from "date-fns";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { getPlatformContext } from "@/lib/platform/platform-context";
import { listPlatformOrganizations } from "@/lib/platform/platform-organizations";
import { shortId } from "@/lib/platform/platform-pagination";

export const dynamic = "force-dynamic";

function buildPageHref(page: number, q?: string): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/platform/organizations?${query}` : "/platform/organizations";
}

export default async function PlatformOrganizationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; q?: string; pageSize?: string }>;
}) {
  const sq = await (searchParams ??
    Promise.resolve({} as { page?: string; q?: string; pageSize?: string }));
  const ctx = await getPlatformContext();
  const result = await listPlatformOrganizations(ctx, {
    page: sq.page ? Number(sq.page) : undefined,
    pageSize: sq.pageSize ? Number(sq.pageSize) : undefined,
    q: sq.q,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Platform Operations"
        title="Organizations"
        description="Tenant directory with membership and job counts."
      />

      <form className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={sq.q ?? ""}
          placeholder="Search name or slug (min 2 chars)"
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
        <EmptyState title="No organizations found" description="Try a different search or check back later." />
      ) : (
        <>
          <WorkspacePanel className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-foreground-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Short ID</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Members</th>
                  <th className="px-4 py-2 font-medium">Owners</th>
                  <th className="px-4 py-2 font-medium">Jobs</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((org) => (
                  <tr key={org.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <Link
                        href={`/platform/organizations/${org.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {org.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-foreground-muted">
                      {shortId(org.id)}
                    </td>
                    <td className="px-4 py-2 text-foreground-muted">
                      {format(org.createdAt, "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-2">{org.memberCount}</td>
                    <td className="px-4 py-2 text-foreground-muted">
                      {org.ownerNames.length > 0 ? org.ownerNames.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-2">{org.jobCount}</td>
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
