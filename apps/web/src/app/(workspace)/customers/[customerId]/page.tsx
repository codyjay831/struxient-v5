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
import {
  Building2,
  CalendarDays,
  FileText,
  FolderKanban,
  MessageSquare,
  Phone,
  Tag,
  UserRound,
  Users,
} from "lucide-react";

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

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Relationships" },
          { label: "Customers", href: "/customers" },
          { label: `Customer ${customerId}` },
        ]}
      />
      <PageHeader
        eyebrow="Relationships"
        title="Customer"
        description="Durable relationship record—not Sales-only. When data exists, quotes, jobs, and intake all tie back here. This route is a shell: the id is from the URL only."
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
          <StatusBadge label="Relationship record" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            Visual only—not loaded from a database
          </span>
        </div>
      </WorkspacePanel>

      {/* Identity — future profile shell */}
      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Customer identity"
          description="Legal name, display name, billing entity, and service addresses will anchor here. Nothing below is populated until persistence ships."
        />
        <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-10 text-center">
          <UserRound
            className="mx-auto mb-3 size-10 text-foreground-subtle opacity-70"
            strokeWidth={1.25}
            aria-hidden
          />
          <p className="text-sm font-medium text-foreground">Future profile shell</p>
          <p className="mt-2 text-xs text-foreground-muted">
            No display name, tax ID, or merge history yet—this screen only proves routing and
            layout.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <PlaceholderButton title="No customer store in this build">
              Edit profile (soon)
            </PlaceholderButton>
          </div>
        </div>
      </WorkspacePanel>

      {/* Contact methods */}
      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Contact methods"
          description="Office phone, mobile or SMS, email, job-site contact, billing contact, and preferred channel—structured fields and portal invites come with persistence."
        />
        <EmptyState
          icon={Phone}
          title="No contact methods on file"
          description="Crews and CSRs need reliable numbers and addresses; this block stays empty until an address book exists."
        >
          <PlaceholderButton title="No contact editor in this build">
            Add phone (soon)
          </PlaceholderButton>
          <PlaceholderButton title="No contact editor in this build">
            Add email (soon)
          </PlaceholderButton>
        </EmptyState>
      </WorkspacePanel>

      {/* Connected records — primary: Sales + Work */}
      <WorkspacePanel className="mb-6 border-border-strong shadow-md ring-1 ring-ring/30">
        <SectionHeading
          title="Connected records"
          description="The customer record is where Sales history and Work history meet—leads and quotes on one side, jobs and schedule context on the other. Counts stay honest (—) until queries exist."
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SignalCard
            label="Linked leads"
            value="—"
            hint="Intake tied to this party."
          />
          <SignalCard
            label="Quotes (any state)"
            value="—"
            hint="Commercial artifacts for this customer."
          />
          <SignalCard
            label="Jobs"
            value="—"
            hint="Approved work and delivery containers."
          />
          <SignalCard
            label="Schedule context"
            value="—"
            hint="Holds and visits associated with this account."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectedRecordSlot
            title="Leads"
            description="Open or past intake that referenced this customer. No rows are invented in this build."
            icon={Users}
            href="/leads"
            linkLabel="Open Leads"
          />
          <ConnectedRecordSlot
            title="Quotes"
            description="Draft, sent, and approved quotes roll up here for repeat business context."
            icon={FileText}
            href="/quotes"
            linkLabel="Open Quotes"
          />
          <ConnectedRecordSlot
            title="Jobs"
            description="Active and historical jobs linked after activation and data models exist."
            icon={FolderKanban}
            href="/jobs"
            linkLabel="Open Jobs"
          />
          <ConnectedRecordSlot
            title="Schedule context"
            description="Appointments and calendar holds tied to this customer—not a full schedule engine on this page."
            icon={CalendarDays}
            href="/schedule"
            linkLabel="Open Schedule"
          />
        </div>
      </WorkspacePanel>

      {/* Relationship signals / tags */}
      <WorkspacePanel className="mb-6">
        <SectionHeading
          title="Relationship signals & tags"
          description="Company tags you choose (VIP, GC, referral) sit beside system-derived signals when the product already knows them—repeat customer, import source, unsold quote, approved work, service area, needs follow-up."
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
            label="Approved work"
            value="—"
            hint="Post-commitment execution tied here."
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

      {/* Related parties — future */}
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

      {/* Notes & activity */}
      <WorkspacePanel padding="compact" className="mb-6">
        <SectionHeading
          title="Notes & activity"
          description="Internal calls, visits, billing notes, and job events in one timeline—audit behavior is future work."
        />
        <EmptyState
          icon={MessageSquare}
          title="No activity yet"
          description="No fabricated events; logging attaches when persistence exists."
        />
      </WorkspacePanel>

      <HandoffPanel
        title="Sales + Work from one record"
        description="Leads and Quotes live under Sales. Jobs and Schedule live under Work. The Workstation is where attention and next actions surface—this page is the relationship anchor, not the inbox."
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
        <Link href="/workstation" className={handoffPrimaryLinkClass}>
          Workstation
        </Link>
      </HandoffPanel>
    </div>
  );
}
