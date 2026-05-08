import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { QuoteWorkspaceShell } from "@/components/shells/quote-workspace-shell";
import { getDevOrganizationOrThrow } from "@/lib/db";
import { workstationReturnHref } from "@/lib/workstation-return-href";
import { loadQuoteWorkSurface } from "@/lib/quote-work-surface-loader";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

/**
 * Full Quote page. The page is now a thin host: load via `loadQuoteWorkSurface`
 * (the same loader Workstation, the Lead Quote tab, and the Quotes popup use)
 * and hand the payload to `QuoteWorkspaceShell`, which renders
 * `<QuoteWorkSurface mode="full" />` as the entire workspace body. There is no
 * separate full-page client to maintain.
 */
export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ quoteId: string }>;
  searchParams?: Promise<{ from?: string; section?: string }>;
}) {
  const emptySearchParams: { from?: string; section?: string } = {};
  const [{ quoteId }, sq] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(emptySearchParams),
  ]);
  const fromWorkstation = sq.from === "workstation";
  const returnSection =
    typeof sq.section === "string" ? sq.section : "investigate";
  const returnHref = fromWorkstation
    ? workstationReturnHref(returnSection)
    : undefined;

  const org = await getDevOrganizationOrThrow();
  const result = await loadQuoteWorkSurface(quoteId, org.id);

  if (!result) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Sales" },
            { label: "Quotes", href: "/quotes" },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          eyebrow="Sales"
          title="Quote"
          description="No quote exists for this id in the current development organization. Links only resolve within your tenant scope—not across organizations."
          actions={
            <Link href="/quotes" className={listLinkClass}>
              ← Quotes list
            </Link>
          }
        />
        <WorkspacePanel padding="compact" className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Requested id
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">
            {quoteId}
          </p>
        </WorkspacePanel>
        <EmptyState
          icon={FileText}
          title="Quote not found"
          description="This id is not a quote record in the development organization, or it belongs to another tenant. When auth exists, routing will follow your real org context."
        >
          <Link href="/quotes" className={listLinkClass}>
            Back to quotes
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <QuoteWorkspaceShell
      quote={result.quote}
      readiness={result.readiness}
      workspaceTabs={result.workspaceTabs}
      returnHref={returnHref}
    />
  );
}
