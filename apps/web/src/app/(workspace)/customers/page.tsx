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
import { SignalCard } from "@/components/ui/signal-card";
import { UserCircle } from "lucide-react";

export default function CustomersPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Relationships" }, { label: "Customers" }]}
      />
      <PageHeader
        eyebrow="Relationships"
        title="Customers"
        description="The first relationship record surface in Struxient—billing parties, job history, and tags you keep across quotes and work. It is not a sales-only list; Sales stays in Leads and Quotes."
        actions={
          <>
            <PlaceholderButton>New customer</PlaceholderButton>
            <PlaceholderButton>Merge records (soon)</PlaceholderButton>
          </>
        }
      />

      <HandoffPanel
        title="Relationship context"
        description="Customer records will tie together Sales history (leads and quotes), approved Work (jobs), contacts, and later repeat-business signals—still one route today; no extra relationship types or mock parties."
      >
        <Link href="/leads" className={handoffMutedLinkClass}>
          Sales: Leads
        </Link>
        <Link href="/quotes" className={handoffMutedLinkClass}>
          Sales: Quotes
        </Link>
      </HandoffPanel>

      <section className="mb-10">
        <SectionHeading
          title="System signals (preview)"
          description="Org-wide rollups—empty placeholders, not live metrics."
        />
        <ul className="grid gap-3 sm:grid-cols-3">
          <li>
            <SignalCard label="Active jobs" value="—" hint="Open work tied to customers" />
          </li>
          <li>
            <SignalCard label="Past-due AR" value="—" hint="When billing exists" />
          </li>
          <li>
            <SignalCard label="Stale contact" value="—" hint="No touch in N days" />
          </li>
        </ul>
      </section>

      <WorkspacePanel padding="compact" className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Where Relationships will grow
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          This route stays <span className="font-medium text-foreground">Customers</span>{" "}
          until persistence exists. Later, the same sidebar group may add contacts,
          subs and partners, GCs and builders, property owners, referral sources, and
          repeat-business signals—each with honest empty states, not mock rows. No
          extra nav items or routes are wired in this baseline.
        </p>
      </WorkspacePanel>

      <SectionHeading
        title="Customer records"
        description="Each row will open `/customers/{id}` with relationship context across Sales and Work—schemas are not defined in this repo yet, so no sample IDs are linked from this list."
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                <th className="pb-3 pr-4 font-medium">Customer</th>
                <th className="pb-3 pr-4 font-medium">Tags</th>
                <th className="pb-3 pr-4 font-medium">Signals</th>
                <th className="pb-3 font-medium">History</th>
              </tr>
            </thead>
          </table>
        </div>
        <div className="border-t border-border pt-6">
          <EmptyState
            icon={UserCircle}
            title="No customer rows yet"
            description="Tags (VIP, GC, service plan) and system signals (credit hold, warranty) will render in the middle columns. Activity and job references will populate the history column from events—no sample rows are shown."
          >
            <PlaceholderButton>Open row detail (needs data)</PlaceholderButton>
          </EmptyState>
        </div>
      </WorkspacePanel>
    </div>
  );
}
