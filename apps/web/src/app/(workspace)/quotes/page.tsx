import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { FileText } from "lucide-react";

const primaryLinkClass =
  "inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

export default function QuotesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Sales" }, { label: "Quotes" }]}
      />
      <PageHeader
        eyebrow="Sales"
        title="Quotes"
        description="Sales-stage anchor from draft through approval—line items, optional payment plans, and an immutable snapshot at approval will tie quotes to jobs. Nothing here persists yet."
        actions={
          <>
            <Link href="/quotes/new" className={primaryLinkClass}>
              New quote
            </Link>
            <PlaceholderButton>Templates (soon)</PlaceholderButton>
          </>
        }
      />

      <HandoffPanel
        title="Commercial handoff"
        description="Quotes organize line items and payment terms before approved work becomes a job under Work › Jobs. Approved quotes later feed that catalog—activation and job creation stay future persistence work, not a button in this shell."
      >
        <Link href="/leads" className={handoffMutedLinkClass}>
          Go to Leads
        </Link>
      </HandoffPanel>

      <WorkspacePanel className="mb-8" padding="compact">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Status labels (visual only)
        </p>
        <p className="mt-2 text-sm text-foreground-muted">
          Draft, sent, and approved are conceptual stages for the list UI—badges are
          not bound to stored quote state in this build.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge label="Draft" tone="draft" />
          <StatusBadge label="Sent" tone="sent" />
          <StatusBadge label="Approved" tone="approved" />
        </div>
      </WorkspacePanel>

      <div className="mb-10 grid gap-6 lg:grid-cols-[1fr_minmax(0,17rem)]">
        <div>
          <SectionHeading
            title="Quote list"
            description="Search, filters, and sorting attach to server queries later."
          />
          <EmptyState
            icon={FileText}
            title="No quotes on file"
            description="Authoring, PDFs, approvals, and version history require a data layer. Line items (labor, materials, allowances) and optional staged payment plans will live on each quote detail page."
          >
            <Link href="/quotes/new" className={primaryLinkClass}>
              Start a quote (shell)
            </Link>
          </EmptyState>
        </div>
        <WorkspacePanel padding="compact">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Future detail surface
          </p>
          <ul className="mt-3 space-y-2 text-sm text-foreground-muted">
            <li>Line-item editor with tax/shipping summaries</li>
            <li>Payment plan preview (deposit, progress, final)</li>
            <li>Customer-visible PDF & approval trail</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/quotes/new" className={primaryLinkClass}>
              Open quote workspace
            </Link>
            <PlaceholderButton title="No template library in this build">
              Browse templates (soon)
            </PlaceholderButton>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
