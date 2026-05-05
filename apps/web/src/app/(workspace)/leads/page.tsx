import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
  handoffPrimaryLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { Inbox, AlertTriangle } from "lucide-react";

const primaryLinkClass =
  "inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

export default function LeadsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Sales" }, { label: "Leads" }]}
      />
      <PageHeader
        eyebrow="Sales"
        title="Leads"
        description="Intake queue for opportunities before they become customers or quotes—dedupe is advisory until matching rules and persistence land."
        actions={
          <>
            <Link href="/leads/new" className={primaryLinkClass}>
              New lead
            </Link>
            <PlaceholderButton>Connect channel (soon)</PlaceholderButton>
          </>
        }
      />

      <HandoffPanel
        title="Sales handoff"
        description="When a lead is qualified—customer, rough scope, and timing are clear—Sales continues in Quotes. Nothing moves automatically without persistence."
      >
        <Link href="/quotes" className={handoffPrimaryLinkClass}>
          Go to Quotes
        </Link>
        <Link href="/leads/new" className={handoffMutedLinkClass}>
          Start new lead
        </Link>
      </HandoffPanel>

      <div className="mb-10 grid gap-6 lg:grid-cols-[1fr_minmax(0,18rem)]">
        <div>
          <SectionHeading
            title="Intake queue"
            description="Columns are illustrative—workflow stages will follow your org once data exists. Row opens will use `/leads/{id}` for the lead workspace shell."
          />
          <WorkspacePanel padding="none" className="overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-border border-b border-border bg-foreground/[0.02] text-center">
              {["New", "Working", "Ready for quote"].map((col) => (
                <div
                  key={col}
                  className="px-2 py-2 text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle"
                >
                  {col}
                </div>
              ))}
            </div>
            <div className="p-6">
              <EmptyState
                icon={Inbox}
                title="Queue is empty"
                description="No leads are loaded—there is no seed data. Manual entry and future channels (web form, imports) will enqueue here with org-scoped visibility."
              />
            </div>
          </WorkspacePanel>
        </div>

        <aside className="space-y-6">
          <WorkspacePanel padding="compact">
            <div className="flex gap-2">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
                strokeWidth={1.5}
                aria-hidden
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                  Duplicate warning (concept)
                </p>
                <p className="mt-2 text-sm text-foreground-muted">
                  When persistence exists, similar names, phones, or addresses can
                  surface a non-blocking warning before you create another lead—no
                  matching runs in this build.
                </p>
              </div>
            </div>
          </WorkspacePanel>
          <WorkspacePanel padding="compact">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Channels (placeholder)
            </p>
            <p className="mt-2 text-sm text-foreground-muted">
              Phone, email, and partner referrals will map to the same intake
              pipeline; integrations are out of scope for this UI pass.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <PlaceholderButton>Web form</PlaceholderButton>
              <PlaceholderButton>CSV import</PlaceholderButton>
            </div>
          </WorkspacePanel>
        </aside>
      </div>
    </div>
  );
}
