import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
  handoffPrimaryLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { FileText, Wallet, Users, FolderKanban, Gauge } from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default function PaymentsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Finance" }, { label: "Payments" }]}
      />
      <PageHeader
        eyebrow="Finance"
        title="Payments"
        description="Operational money tracking—what is requested, collected, or overdue. This is a shell for future payment workflows, not a live processor or accounting system."
        actions={
          <>
            <PlaceholderButton title="No payment recording in this build">
              Record payment (soon)
            </PlaceholderButton>
            <PlaceholderButton title="No payment requests in this build">
              Request payment (soon)
            </PlaceholderButton>
          </>
        }
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Payments surface
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          <span className="font-medium text-foreground">Finance › Payments</span> will
          track real-world money movement. The agreed terms and payment schedule stay
          anchored on the <span className="font-medium text-foreground">Quote</span>. No
          processor (Stripe) or persistence is wired in this shell.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Money shell" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            Visual only—no live ledger or sync
          </span>
        </div>
      </WorkspacePanel>

      <div className="space-y-6">
        {/* Primary: Money attention */}
        <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
          <SectionHeading
            title="Money attention"
            description="Roll-up of payment status across all active jobs and quotes. When wired, this highlights where money is stuck or needs a human decision."
            actions={
              <PlaceholderButton title="No live feed in this build">
                Refresh ledger (soon)
              </PlaceholderButton>
            }
          />
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SignalCard
              label="Requested"
              value="—"
              hint="Sent to customer"
            />
            <SignalCard
              label="Collected"
              value="—"
              hint="Confirmed this month"
            />
            <SignalCard
              label="Needs follow-up"
              value="—"
              hint="Unpaid after N days"
            />
            <SignalCard
              label="Failed / overdue"
              value="—"
              hint="Requires intervention"
            />
          </div>
          <EmptyState
            icon={Wallet}
            title="No payment records yet"
            description="There is no live ledger, no mock transactions, and no processor sync. After persistence, real-time status from Stripe or manual entries will populate this view."
          >
            <PlaceholderButton title="No editor in this build">
              Record payment (soon)
            </PlaceholderButton>
            <Link href="/quotes" className={listLinkClass}>
              Quotes
            </Link>
          </EmptyState>
        </WorkspacePanel>

        {/* Quote/payment-plan boundary */}
        <WorkspacePanel>
          <SectionHeading
            title="Quote & payment plan boundary"
            description="The agreed money truth—deposits, milestones, and final balance—stays on the quote record. Payments will later track the real-world fulfillment of those terms."
          />
          <EmptyState
            icon={FileText}
            title="View commercial terms"
            description="Go to Quotes to see the agreed payment schedules that feed this operational surface."
          >
            <Link href="/quotes" className={handoffPrimaryLinkClass}>
              Open Quotes
            </Link>
          </EmptyState>
        </WorkspacePanel>

        {/* Connected records */}
        <div className="grid gap-6 lg:grid-cols-2">
          <WorkspacePanel padding="compact">
            <SectionHeading
              title="Customers & Jobs"
              description="Money ties back to the relationship and the work record."
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/customers" className={listLinkClass}>
                <Users className="mr-2 size-3.5" />
                Customers
              </Link>
              <Link href="/jobs" className={listLinkClass}>
                <FolderKanban className="mr-2 size-3.5" />
                Jobs
              </Link>
            </div>
          </WorkspacePanel>
          <WorkspacePanel padding="compact">
            <SectionHeading
              title="Workstation attention"
              description="Payment blocks and holds surface in the cockpit."
            />
            <div className="mt-4">
              <Link href="/workstation" className={listLinkClass}>
                <Gauge className="mr-2 size-3.5" />
                Open Workstation
              </Link>
            </div>
          </WorkspacePanel>
        </div>

        {/* Future systems deferred */}
        <WorkspacePanel>
          <SectionHeading
            title="Future money systems (deferred)"
            description="Struxient v5 focuses on the shell and execution path first. These systems are intentionally not built in this pass."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "Invoice generation",
              "Stripe / Processor sync",
              "Refunds & credits",
              "Accounting (QBO/Xero)",
              "Payouts & taxes",
              "Billing & subscriptions",
            ].map((label) => (
              <div
                key={label}
                className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5 text-xs text-foreground-subtle"
              >
                {label} — (future)
              </div>
            ))}
          </div>
        </WorkspacePanel>

        <HandoffPanel
          title="Payments connect Sales and Work"
          description="Quotes define the money truth. Jobs define the work. Payments track the fulfillment. Workstation surfaces the risk. This page is the operational home for money, not the record catalog."
        >
          <Link href="/quotes" className={handoffMutedLinkClass}>
            Quotes
          </Link>
          <Link href="/customers" className={handoffMutedLinkClass}>
            Customers
          </Link>
          <Link href="/jobs" className={handoffMutedLinkClass}>
            Jobs
          </Link>
          <Link href="/workstation" className={handoffPrimaryLinkClass}>
            Workstation
          </Link>
        </HandoffPanel>
      </div>
    </div>
  );
}
