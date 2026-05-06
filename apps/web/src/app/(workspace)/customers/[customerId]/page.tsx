import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  HandoffPanel,
  handoffMutedLinkClass,
  handoffPrimaryLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import {
  formatLeadSource,
  formatLeadStatus,
  leadStatusBadgeTone,
} from "@/lib/lead-display";
import {
  formatMoneyCents,
  formatQuoteStatus,
  quoteStatusBadgeTone,
} from "@/lib/quote-display";
import {
  Building2,
  CalendarDays,
  CreditCard,
  FileText,
  FolderKanban,
  MessageSquare,
  Phone,
  Tag,
  UserRound,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

function ConnectedRecordSlot({
  title,
  description,
  icon: Icon,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-dashed border-border bg-surface/50 p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <Icon
          className="size-5 shrink-0 text-foreground-subtle opacity-80"
          strokeWidth={1.25}
          aria-hidden
        />
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      </div>
      <p className="mb-4 flex-1 text-xs leading-relaxed text-foreground-muted">{description}</p>
      <Link href={href} className={`${listLinkClass} self-start`}>
        {linkLabel}
      </Link>
    </div>
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const org = await getDevOrganizationOrThrow();
  const customer = await db.customer.findFirst({
    where: {
      id: customerId,
      organizationId: org.id,
    },
  });

  if (!customer) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Relationships" },
            { label: "Customers", href: "/customers" },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          eyebrow="Relationships"
          title="Customer"
          description="No customer exists for this id in the current development organization. Links only resolve within your tenant scope—not across organizations."
          actions={
            <Link href="/customers" className={listLinkClass}>
              ← Customers list
            </Link>
          }
        />
        <WorkspacePanel padding="compact" className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Requested id
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{customerId}</p>
        </WorkspacePanel>
        <EmptyState
          icon={UserRound}
          title="Customer not found"
          description="This id is not a customer record in the development organization, or it belongs to another tenant. When auth exists, routing will follow your real org context."
        >
          <Link href="/customers" className={listLinkClass}>
            Back to customers
          </Link>
        </EmptyState>
      </div>
    );
  }

  const createdLabel = new Date(customer.createdAt).toLocaleString();
  const updatedLabel = new Date(customer.updatedAt).toLocaleString();

  const linkedLeads = await db.lead.findMany({
    where: {
      organizationId: org.id,
      customerId: customer.id,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      source: true,
      contactName: true,
      email: true,
      phone: true,
      createdAt: true,
      convertedAt: true,
    },
  });

  const linkedQuotes = await db.quote.findMany({
    where: {
      organizationId: org.id,
      customerId: customer.id,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      totalCents: true,
      updatedAt: true,
    },
  });

  const linkedLeadCount = linkedLeads.length;
  const newestLinkedLeadCreatedAt = linkedLeads[0]?.createdAt ?? null;
  const linkedWithConvertedStatus = linkedLeads.filter((l) => l.status === "CONVERTED").length;
  const linkedWithConversionTimestamp = linkedLeads.filter((l) => l.convertedAt != null).length;
  const newestLinkedLeadLabel = newestLinkedLeadCreatedAt
    ? new Date(newestLinkedLeadCreatedAt).toLocaleString()
    : "—";

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Relationships" },
          { label: "Customers", href: "/customers" },
          { label: customer.displayName },
        ]}
      />
      <PageHeader
        eyebrow="Relationships"
        title={customer.displayName}
        description="Durable relationship record—not Sales-only. A customer can exist without any leads; leads you link or create from intake appear in Linked leads below. Linked quotes are read-only from the database for this organization; jobs, schedule, and payments stay out of scope here. Identity and contact fields are edited on the separate edit route; this view stays read-first."
        actions={
          <>
            <Link href="/customers" className={listLinkClass}>
              ← Customers list
            </Link>
            <Link href={`/customers/${customer.id}/edit`} className={listLinkClass}>
              Edit customer
            </Link>
            <Link
              href={`/quotes/new?customerId=${encodeURIComponent(customer.id)}`}
              className={listLinkClass}
            >
              Create quote
            </Link>
          </>
        }
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Record
        </p>
        <p className="mt-1 break-all font-mono text-xs text-foreground-muted">{customer.id}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Relationship record" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            Scoped to development organization ({org.name})
          </span>
        </div>
        <dl className="mt-4 grid gap-2 text-xs text-foreground-muted sm:grid-cols-2">
          <div>
            <dt className="font-medium uppercase tracking-wide text-foreground-subtle">Created</dt>
            <dd className="mt-0.5 text-foreground">{createdLabel}</dd>
          </div>
          <div>
            <dt className="font-medium uppercase tracking-wide text-foreground-subtle">Updated</dt>
            <dd className="mt-0.5 text-foreground">{updatedLabel}</dd>
          </div>
        </dl>
      </WorkspacePanel>

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Relationship summary (Sales)"
          description="Derived from leads linked to this customer in this organization—counts are honest database reads, not fabricated activity. Quotes and jobs get their own sections when modeled."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SignalCard
            label="Linked leads"
            value={String(linkedLeadCount)}
            hint="Intake rows with this customerId in your org."
          />
          <SignalCard
            label="Newest linked intake"
            value={newestLinkedLeadLabel}
            hint="By lead created date (newest first in the list below)."
          />
          <SignalCard
            label='Status "Converted" (manual)'
            value={String(linkedWithConvertedStatus)}
            hint="Count where lead.status is CONVERTED—set on the lead, not inferred here."
          />
          <SignalCard
            label="Conversion timestamp recorded"
            value={String(linkedWithConversionTimestamp)}
            hint="Leads with convertedAt from explicit link or create-from-lead."
          />
        </div>
      </WorkspacePanel>

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Customer identity"
          description="Legal name, display name, and billing entity anchor here. Fields below are read from the database for this organization only."
        />
        <div className="rounded-lg border border-border bg-surface px-4 py-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                Display name
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{customer.displayName}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                Company
              </dt>
              <dd className="mt-1 text-sm text-foreground">{customer.companyName || "—"}</dd>
            </div>
          </dl>
        </div>
      </WorkspacePanel>

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Contact methods"
          description="Office phone, mobile, email, and preferred channel—structured fields expand with persistence."
        />
        {customer.email || customer.phone ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                  Email
                </dt>
                <dd className="mt-1 text-sm text-foreground">{customer.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                  Phone
                </dt>
                <dd className="mt-1 text-sm text-foreground">{customer.phone || "—"}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <EmptyState
            icon={Phone}
            title="No contact methods on file"
            description="None are stored for this customer yet. Add email or phone on Edit customer."
          >
            <Link href={`/customers/${customer.id}/edit`} className={listLinkClass}>
              Edit customer
            </Link>
          </EmptyState>
        )}
      </WorkspacePanel>

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Internal notes"
          description="Free-form notes stored on the customer record—edit on the customer edit route."
        />
        {customer.notes ? (
          <p className="rounded-lg border border-border bg-foreground/[0.02] px-4 py-3 text-sm leading-relaxed text-foreground-muted">
            {customer.notes}
          </p>
        ) : (
          <p className="text-sm text-foreground-muted">No notes on this record.</p>
        )}
      </WorkspacePanel>

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Linked leads"
          description="Read-only: intake records in this organization that were explicitly linked or created-from-lead for this customer. Linking and unlinking happen on each lead’s detail page—not here."
        />
        {linkedLeads.length === 0 ? (
          <p className="text-sm text-foreground-muted">No leads are linked to this customer yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {linkedLeads.map((row) => {
              const created = new Date(row.createdAt).toLocaleString();
              const converted = row.convertedAt
                ? new Date(row.convertedAt).toLocaleString()
                : null;
              const contactBits = [row.contactName, row.email, row.phone].filter(Boolean);
              const contactLine =
                contactBits.length > 0 ? contactBits.join(" · ") : "No contact on lead";
              return (
                <li key={row.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/leads/${row.id}`}
                        className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {row.title}
                      </Link>
                      <p className="mt-1 text-xs text-foreground-muted">
                        <span className="break-words">{contactLine}</span>
                      </p>
                      <dl className="mt-2 grid gap-1 text-xs text-foreground-muted sm:grid-cols-2">
                        <div>
                          <dt className="font-medium uppercase tracking-wide text-foreground-subtle">
                            Created
                          </dt>
                          <dd className="mt-0.5 text-foreground">{created}</dd>
                        </div>
                        {converted ? (
                          <div>
                            <dt className="font-medium uppercase tracking-wide text-foreground-subtle">
                              Converted (recorded)
                            </dt>
                            <dd className="mt-0.5 text-foreground">{converted}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                      <StatusBadge
                        label={formatLeadStatus(row.status)}
                        tone={leadStatusBadgeTone(row.status)}
                      />
                      <span className="text-xs text-foreground-muted">
                        {formatLeadSource(row.source)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </WorkspacePanel>

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Linked quotes"
          description="Read-only: quotes in this organization that reference this customer. Create and edit quote actions are not implemented yet."
        />
        {linkedQuotes.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            No quotes reference this customer yet. Quote authoring will land in a later phase—this
            section only reflects persisted rows.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {linkedQuotes.map((q) => {
              const updated = new Date(q.updatedAt).toLocaleString();
              return (
                <li key={q.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/quotes/${q.id}`}
                        className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {q.title}
                      </Link>
                      <p className="mt-1 text-xs text-foreground-muted">
                        Updated {updated} · Total {formatMoneyCents(q.totalCents)}
                      </p>
                    </div>
                    <StatusBadge
                      label={formatQuoteStatus(q.status)}
                      tone={quoteStatusBadgeTone(q.status)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </WorkspacePanel>

      <WorkspacePanel className="mb-6 border-border-strong shadow-md ring-1 ring-ring/30">
        <SectionHeading
          title="Connected records"
          description="The customer record is where Sales history and Work history meet. Linked leads and quotes above are live for this organization; jobs, schedule, and payments remain placeholders until those models exist."
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SignalCard
            label="Linked leads"
            value={String(linkedLeads.length)}
            hint="Intake tied to this party in this organization."
          />
          <SignalCard
            label="Quotes (any state)"
            value={String(linkedQuotes.length)}
            hint="Commercial quotes with this customerId in your org."
          />
          <SignalCard
            label="Jobs"
            value="—"
            hint="Reserved execution records—none linked yet."
          />
          <SignalCard
            label="Schedule context"
            value="—"
            hint="Reserved timing shell—no holds stored."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectedRecordSlot
            title="Leads"
            description="Browse all leads in Sales. Records linked to this customer are listed in Linked leads above."
            icon={Users}
            href="/leads"
            linkLabel="Open Leads"
          />
          <ConnectedRecordSlot
            title="Quotes"
            description="Working quotes for this customer in your org—use the quote workspace for line items and recorded send checkpoints."
            icon={FileText}
            href="/quotes"
            linkLabel="Open Quotes"
          />
          <ConnectedRecordSlot
            title="Jobs"
            description="Reserved job directory—not linked to quotes or checkpoints yet; routes exist for planning layout only."
            icon={FolderKanban}
            href="/jobs"
            linkLabel="Open Jobs (reserved)"
          />
          <ConnectedRecordSlot
            title="Schedule context"
            description="Reserved schedule planning shell—no appointments or engine tied to this customer yet."
            icon={CalendarDays}
            href="/schedule"
            linkLabel="Open Schedule (reserved)"
          />
          <ConnectedRecordSlot
            title="Payments"
            description="Reserved payments shell under navigation—no ledger, history, or automatic quote linkage yet."
            icon={CreditCard}
            href="/payments"
            linkLabel="Open Payments (reserved)"
          />
        </div>
      </WorkspacePanel>

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Relationship signals & tags"
          description="Company tags you choose (VIP, GC, referral) sit beside system-derived signals when the product already knows them—repeat customer, import source, in-flight quotes, linked work (future), service area, needs follow-up."
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SignalCard
            label="Repeat / history"
            value="—"
            hint="Derived when job or quote history exists."
          />
          <SignalCard
            label="Active quote signal"
            value="—"
            hint="Unsold or in-flight commercial work."
          />
          <SignalCard
            label="Linked work (reserved)"
            value="—"
            hint="Future execution tie-ins—not evaluated."
          />
          <SignalCard
            label="Import / referral"
            value="—"
            hint="Provenance and source tags later."
          />
        </div>
        <EmptyState
          icon={Tag}
          title="No tags applied"
          description="Manual chips and automated signals render after rules and storage exist—no fabricated tags."
        >
          <PlaceholderButton title="No tagging in this build">Add tag (soon)</PlaceholderButton>
        </EmptyState>
      </WorkspacePanel>

      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Related parties"
          description="Future links to contacts, property owners, GCs or builders, subs and partners, vendors, and referral sources—still under this relationship, without new routes in this build."
        />
        <EmptyState
          icon={Building2}
          title="No related parties"
          description="Those relationship types ship later; this shell does not mock people or companies."
        />
      </WorkspacePanel>

      <WorkspacePanel padding="compact" className="mb-6">
        <SectionHeading
          title="Activity timeline"
          description="Internal calls, visits, billing notes, and job events in one timeline—audit behavior is future work."
        />
        <EmptyState
          icon={MessageSquare}
          title="No activity yet"
          description="No fabricated events; logging attaches when persistence exists beyond this customer row."
        />
      </WorkspacePanel>

      <HandoffPanel
        title="Sales + Work from one record"
        description="Leads and Quotes live under Sales. Jobs and Schedule under Work are reserved shells. Workstation is a static attention layout—this page is the relationship anchor, not an inbox or orchestrator."
      >
        <Link href="/customers" className={handoffMutedLinkClass}>
          Customers list
        </Link>
        <Link href="/leads" className={handoffMutedLinkClass}>
          Leads
        </Link>
        <Link href="/quotes" className={handoffMutedLinkClass}>
          Quotes
        </Link>
        <Link href="/jobs" className={handoffMutedLinkClass}>
          Jobs
        </Link>
        <Link href="/schedule" className={handoffMutedLinkClass}>
          Schedule
        </Link>
        <Link href="/payments" className={handoffMutedLinkClass}>
          Payments
        </Link>
        <Link href="/workstation" className={handoffPrimaryLinkClass}>
          Workstation
        </Link>
      </HandoffPanel>
    </div>
  );
}
