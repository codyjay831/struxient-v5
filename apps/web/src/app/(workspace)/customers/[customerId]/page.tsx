import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { FileText, FolderKanban, History, Phone, Tag, Users } from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Relationships"
        title="Customer"
        description="Relationship truth that spans Sales quotes and Work jobs—this screen is a shell until CRM data exists. It is not a sales-only view."
        actions={
          <>
            <Link href="/customers" className={listLinkClass}>
              ← Customers list
            </Link>
            <PlaceholderButton>Edit record</PlaceholderButton>
          </>
        }
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Placeholder identifier (from URL)
        </p>
        <p className="mt-1 break-all font-mono text-sm text-foreground">{customerId}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Active account" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            Label is illustrative only
          </span>
        </div>
      </WorkspacePanel>

      <section className="mb-8">
        <SectionHeading
          title="Relationship signals"
          description="Lightweight rollups—not live metrics."
        />
        <ul className="grid gap-3 sm:grid-cols-3">
          <li>
            <SignalCard label="Open quotes" value="—" hint="Sales-side drafts" />
          </li>
          <li>
            <SignalCard label="Active jobs" value="—" hint="Work in progress" />
          </li>
          <li>
            <SignalCard label="AR status" value="—" hint="When billing exists" />
          </li>
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <WorkspacePanel>
          <SectionHeading
            title="Contact methods"
            description="Phones, email, site address—what crews and office actually use."
          />
          <EmptyState
            icon={Phone}
            title="No contacts on file"
            description="Address book fields will bind here; nothing is seeded in this build."
          />
        </WorkspacePanel>
        <WorkspacePanel>
          <SectionHeading
            title="Tags & signals"
            description="VIP, GC, referral source, credit hold—tags stay flexible."
          />
          <EmptyState
            icon={Tag}
            title="No tags applied"
            description="Tag chips render after persistence and rules exist."
          />
        </WorkspacePanel>
      </div>

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Related leads, quotes, and jobs"
          description="Sales and Work both point back here—rows will hydrate from queries later."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <EmptyState
            icon={Users}
            title="Leads"
            description="Intake that referenced this party."
          />
          <EmptyState
            icon={FileText}
            title="Quotes"
            description="Commercial history for this customer."
          />
          <EmptyState
            icon={FolderKanban}
            title="Jobs"
            description="Approved execution tied to this account."
          />
        </div>
      </WorkspacePanel>

      <div className="grid gap-6 lg:grid-cols-2">
        <WorkspacePanel>
          <SectionHeading
            title="Notes & history"
            description="Calls, visits, billing notes, and job events in one timeline."
          />
          <EmptyState
            icon={History}
            title="No history yet"
            description="Events are not generated for this placeholder route."
          />
        </WorkspacePanel>
        <WorkspacePanel>
          <SectionHeading
            title="Related parties (future)"
            description="Subs, property owners, GCs, and referral partners may appear here under Relationships without crowding the core customer row."
          />
          <EmptyState
            icon={Users}
            title="No related parties"
            description="Additional relationship types ship later—no mock parties in this baseline."
          />
        </WorkspacePanel>
      </div>
    </div>
  );
}
