import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { ButtonLink } from "@/components/ui/button";
import { QuoteWorkspaceShell } from "@/components/shells/quote-workspace-shell";
import { getCommercialRequestContextOrNull } from "@/lib/auth-context";
import { workstationReturnHref } from "@/lib/workstation-return-href";
import { loadQuoteWorkSurface } from "@/lib/quote-work-surface-loader";
import { FileText } from "lucide-react";
import { AccessDeniedPanel } from "@/components/ui/access-denied-panel";

export const dynamic = "force-dynamic";

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

  const ctx = await getCommercialRequestContextOrNull();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Sales", href: "/leads" },
            { label: "Access denied" },
          ]}
        />
        <PageHeader
          eyebrow="Sales"
          title="Quote"
          description="Review and update commercial proposal details."
        />
        <AccessDeniedPanel description="This role cannot access quote records." />
      </div>
    );
  }
  const result = await loadQuoteWorkSurface(quoteId, ctx.organizationId);

  if (!result) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Sales", href: "/leads" },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          eyebrow="Sales"
          title="Quote"
          description="This quote could not be found."
          actions={
            <ButtonLink href="/leads" variant="muted" size="sm">
              ← Sales pipeline
            </ButtonLink>
          }
        />
        <EmptyState
          icon={FileText}
          title="Quote not found"
          description="The quote may have been removed, or you may not have access to it."
        >
          <ButtonLink href="/leads" variant="muted" size="sm">
            Back to sales pipeline
          </ButtonLink>
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
