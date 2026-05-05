import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListOrdered, Wallet, Wrench, MessageSquare, Eye } from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export function QuoteWorkspaceShell({
  mode,
  quoteId,
}: {
  mode: "new" | "detail";
  quoteId?: string;
}) {
  const isNew = mode === "new";

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales" },
          { label: "Quotes", href: "/quotes" },
          isNew
            ? { label: "New" }
            : { label: `Quote ${quoteId ?? ""}` },
        ]}
      />
      <PageHeader
        eyebrow="Sales"
        title={isNew ? "New quote" : "Quote"}
        description={
          isNew
            ? "Line items sell the scope; the payment plan states money terms. Execution detail stays optional internal planning—not required to produce a quote. Nothing here persists or sends."
            : "Workspace shell for a future stored quote. The identifier is taken from the URL only; there is no fetch, no activation, and no silent mutation of customer-facing terms."
        }
        actions={
          <>
            <Link href="/quotes" className={listLinkClass}>
              ← Quotes list
            </Link>
            <PlaceholderButton>Save draft</PlaceholderButton>
            <PlaceholderButton title="No send pipeline in this build">
              Send to customer
            </PlaceholderButton>
          </>
        }
      />

      {!isNew && quoteId ? (
        <WorkspacePanel padding="compact" className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Placeholder identifier (from URL)
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{quoteId}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge label="Draft" tone="draft" />
            <span className="text-xs text-foreground-muted">
              Visual only—not loaded from a database
            </span>
          </div>
        </WorkspacePanel>
      ) : null}

      <div className="space-y-6">
        <WorkspacePanel>
          <SectionHeading
            title="Customer / lead context"
            description="Ties this quote to a relationship record (customer) or an active lead from Sales—selectors ship with persistence."
          />
          <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-10 text-center text-sm text-foreground-muted">
            No customer or lead linked. Matching rules and search will replace this
            placeholder.
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Line items"
            description="Commercial anchor: labor, materials, allowances, and tax summaries attach here first."
            actions={<PlaceholderButton>Add line</PlaceholderButton>}
          />
          <EmptyState
            icon={ListOrdered}
            title="No line items yet"
            description="Templates will accelerate common assemblies later—they stay optional, not a gate to quoting."
          />
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Payment plan"
            description="Quote-level money truth: deposit, progress draws, and final balance—payment tasks as gates come later as operational controls."
            actions={<PlaceholderButton>Add milestone</PlaceholderButton>}
          />
          <EmptyState
            icon={Wallet}
            title="No payment plan rows"
            description="Approved or sent customer-facing terms will not be silently rewritten later; versioning is a persistence concern."
          />
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Execution plan (internal, optional)"
            description="Progressive detail for how work gets done—crew assumptions, rough phases, or notes. Not a task engine and not required before you can price."
          />
          <EmptyState
            icon={Wrench}
            title="No execution notes"
            description="Keep this light until the quote wins; deep execution stays on the job side once activation exists."
          />
        </WorkspacePanel>

        <div className="grid gap-6 lg:grid-cols-2">
          <WorkspacePanel>
            <SectionHeading
              title="Internal notes & status"
              description="Office-only context—does not replace customer-facing PDF or approval trail."
            />
            <EmptyState
              icon={MessageSquare}
              title="No notes"
              description="Status history and handoff comments will log here when events exist."
            />
          </WorkspacePanel>
          <WorkspacePanel>
            <SectionHeading
              title="Preview & approval"
              description="Customer-facing preview and approval capture—stubbed; no PDF engine or e-sign."
            />
            <EmptyState
              icon={Eye}
              title="Preview not generated"
              description="Snapshot-at-approval protects what the customer agreed to; that behavior needs storage."
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <PlaceholderButton>Generate preview</PlaceholderButton>
              <PlaceholderButton>Record approval</PlaceholderButton>
            </div>
          </WorkspacePanel>
        </div>

        <HandoffPanel
          title={isNew ? "How quoting fits" : "Commercial integrity"}
          description={
            isNew
              ? "Line items and the payment plan carry the sold scope and money terms first. Execution notes stay optional—nothing here replaces a task engine or job activation."
              : "Once sent or approved, customer-facing terms should stay versioned—no silent rewrite later. Turning a win into a Work job is persistence work down the road, not a control on this page."
          }
        >
          <Link href="/quotes" className={handoffMutedLinkClass}>
            Quotes list
          </Link>
        </HandoffPanel>

        <WorkspacePanel padding="compact" className="border-dashed">
          <p className="text-xs text-foreground-muted">
            <span className="font-medium text-foreground">Reminder:</span> Workstation
            will surface quotes that need attention (follow-ups, approvals, holds)—
            this page is where you author and review the commercial spine.
          </p>
        </WorkspacePanel>
      </div>
    </div>
  );
}
