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
import { SignalCard } from "@/components/ui/signal-card";
import {
  ListOrdered,
  Wallet,
  Wrench,
  MessageSquare,
  Eye,
  UserRound,
} from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

/** Suggested authoring order — copy only, no workflow engine. */
function QuoteBuildOrderStrip() {
  const steps = [
    "Link customer or lead",
    "Build line items (scope)",
    "Set payment plan (money)",
    "Add execution detail if helpful",
    "Review customer-facing terms",
  ];
  return (
    <WorkspacePanel padding="compact" className="mb-6 border-border-strong">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
        Suggested order (new quote)
      </p>
      <ol className="mt-3 flex list-none flex-col gap-2 text-sm text-foreground-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1 sm:gap-y-2">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-1">
            <span className="tabular-nums text-foreground-subtle">{i + 1}.</span>
            <span>{label}</span>
            {i < steps.length - 1 ? (
              <span
                className="mx-1 hidden text-foreground-subtle sm:inline"
                aria-hidden
              >
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </WorkspacePanel>
  );
}

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
            ? "Author the sold scope and money terms here. Nothing saves, sends, or charges yet."
            : "Shell for a future stored quote. The id is from the URL only—no fetch, no activation, no silent edits to customer-facing terms."
        }
        actions={
          <>
            <Link href="/quotes" className={listLinkClass}>
              ← Quotes list
            </Link>
            <PlaceholderButton title="No persistence in this build">
              Save draft (soon)
            </PlaceholderButton>
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

      {isNew ? <QuoteBuildOrderStrip /> : null}

      <div className="space-y-6">
        {/* 1. Customer / lead */}
        <WorkspacePanel>
          <SectionHeading
            title="Customer / lead context"
            description="Point this quote at a customer or an open lead before you lock scope—pickers ship with real data later."
          />
          <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-8 text-center sm:py-10">
            <UserRound
              className="mx-auto mb-3 size-9 text-foreground-subtle opacity-70"
              strokeWidth={1.25}
              aria-hidden
            />
            <p className="text-sm text-foreground-muted">
              No customer or lead linked yet.
            </p>
            <p className="mt-2 text-xs text-foreground-subtle">
              Search and rules replace this placeholder when persistence exists.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/customers" className={listLinkClass}>
                Customers
              </Link>
              <Link href="/leads" className={listLinkClass}>
                Leads
              </Link>
            </div>
          </div>
        </WorkspacePanel>

        {/* 2. Line items — primary commercial / scope surface */}
        <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
          <SectionHeading
            title="Line items"
            description="This is the main scope you are selling—labor, materials, allowances, and tax roll up here first."
            actions={
              <PlaceholderButton title="No editor in this build">
                Add line item
              </PlaceholderButton>
            }
          />
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <SignalCard
              label="Quoted total (from lines)"
              value="—"
              hint="Appears when line items exist and roll up."
            />
            <SignalCard
              label="Line item count"
              value="—"
              hint="Honest empty shell—no sample rows."
            />
          </div>
          <EmptyState
            icon={ListOrdered}
            title="No line items yet"
            description="Start from a blank list or a template later. You can still rough the payment plan, but the quote stays thin until lines describe the work."
          >
            <PlaceholderButton title="No editor in this build">
              Add line item
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {/* 3. Payment plan — quote-level money truth */}
        <WorkspacePanel className="border border-border border-l-[3px] border-l-accent">
          <SectionHeading
            title="Payment plan"
            description="Quote-level money truth: deposit, draws, and balance. This is what you agreed on dollars—not the same as later payment reminders or job tasks."
            actions={
              <PlaceholderButton title="No editor in this build">
                Add payment step
              </PlaceholderButton>
            }
          />
          <p className="mb-4 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
            After a quote is approved or sent to the customer, those terms should not
            be silently rewritten here—versioning and audit belong with persistence.
            Operational payment tracking will live under{" "}
            <Link
              href="/payments"
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Finance → Payments
            </Link>{" "}
            later.
          </p>
          <EmptyState
            icon={Wallet}
            title="No payment plan yet"
            description="Lay out how money moves on this quote. Card charges, ACH, and field payment tasks are operational layers for later—not the source of truth for quote money."
          >
            <PlaceholderButton title="No editor in this build">
              Add payment step
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {/* 4. Progressive execution — secondary */}
        <WorkspacePanel
          padding="compact"
          className="border-dashed border-border bg-surface/80"
        >
          <SectionHeading
            title="Execution detail (optional)"
            description="Rough phases, crew assumptions, or internal notes as the picture sharpens—not a task engine and not required to finish a quote."
          />
          <EmptyState
            icon={Wrench}
            title="No execution notes"
            description="Add detail when it helps the crew or estimator. Heavy execution still lives on the job after activation exists."
          >
            <PlaceholderButton title="No notes store in this build">
              Add note
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {/* 5. Preview / approval */}
        <WorkspacePanel>
          <SectionHeading
            title="Preview & approval"
            description="Customer-facing wording, totals, and payment language get a deliberate read before send or approval later—no PDF, e-sign, or mailer in this build."
          />
          <EmptyState
            icon={Eye}
            title="Preview not built yet"
            description="When this ships, you will freeze what the customer saw at approval so office edits do not quietly change agreed terms."
          >
            <PlaceholderButton title="No preview engine in this build">
              Open preview (soon)
            </PlaceholderButton>
            <PlaceholderButton title="No approval capture in this build">
              Record approval (soon)
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {/* 6. Notes / activity — placeholder */}
        <WorkspacePanel padding="compact">
          <SectionHeading
            title="Notes & activity"
            description="Internal timeline and chatter—separate from the customer-facing snapshot."
          />
          <EmptyState
            icon={MessageSquare}
            title="No activity yet"
            description="Edits, sends, and handoffs will show here when events exist."
          />
        </WorkspacePanel>

        <HandoffPanel
          title={isNew ? "Quoting spine" : "After this quote matures"}
          description={
            isNew
              ? "Lines carry scope; the payment plan carries money. Execution notes are optional seasoning."
              : "Treat send/approval as a line in the sand for customer-facing terms. Jobs and tasks come after activation."
          }
        >
          <Link href="/quotes" className={handoffMutedLinkClass}>
            Quotes list
          </Link>
        </HandoffPanel>
      </div>
    </div>
  );
}
