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
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  AlertTriangle,
  ClipboardList,
  FileText,
  Inbox,
  MessageSquare,
  UserRound,
} from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

/** Suggested capture order — copy only, no workflow engine. */
function LeadIntakeOrderStrip() {
  const steps = [
    "Record source / channel",
    "Identify or match contact",
    "Qualify scope, timing, fit",
    "Move to a quote when context is enough",
  ];
  return (
    <WorkspacePanel padding="compact" className="mb-6 border-border-strong">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
        Suggested order (new lead)
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

export function LeadWorkspaceShell({
  mode,
  leadId,
}: {
  mode: "new" | "detail";
  leadId?: string;
}) {
  const isNew = mode === "new";

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales" },
          { label: "Leads", href: "/leads" },
          isNew
            ? { label: "New" }
            : { label: `Lead ${leadId ?? ""}` },
        ]}
      />
      <PageHeader
        eyebrow="Sales"
        title={isNew ? "New lead" : "Lead"}
        description={
          isNew
            ? "Capture intake and enough qualification to decide if a quote is worth doing. Nothing saves here yet."
            : "Shell for a future stored lead. The id is from the URL only—no API, no scoring, no task engine."
        }
        actions={
          <>
            <Link href="/leads" className={listLinkClass}>
              ← Leads list
            </Link>
            <PlaceholderButton>Save lead</PlaceholderButton>
          </>
        }
      />

      {!isNew && leadId ? (
        <WorkspacePanel padding="compact" className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Placeholder identifier (from URL)
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">{leadId}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge label="Open" tone="neutral" />
            <span className="text-xs text-foreground-muted">
              Label is visual only—not loaded from a database
            </span>
          </div>
        </WorkspacePanel>
      ) : null}

      {isNew ? <LeadIntakeOrderStrip /> : null}

      <div className="space-y-6">
        {/* Source / intake */}
        <WorkspacePanel>
          <SectionHeading
            title="Source / intake"
            description="Phone, text, email, website form, walk-in, referral, or manual entry—channels normalize here when integrations and imports exist."
          />
          <EmptyState
            icon={Inbox}
            title="No source recorded"
            description="Pick how this inquiry arrived once picklists and webhooks ship. This panel is layout and copy only."
          >
            <PlaceholderButton title="No channel store in this build">
              Mark source
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {/* Contact / customer match */}
        <WorkspacePanel>
          <SectionHeading
            title="Contact / customer match"
            description="Future flow: tie this intake to an existing Relationships customer or spin up a new relationship record—search and merge rules are persistence work."
          />
          <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-8 text-center sm:py-10">
            <UserRound
              className="mx-auto mb-3 size-9 text-foreground-subtle opacity-70"
              strokeWidth={1.25}
              aria-hidden
            />
            <p className="text-sm text-foreground-muted">
              No contact linked and no duplicate check run.
            </p>
            <p className="mt-2 text-xs text-foreground-subtle">
              Matching and soft-merge warnings replace this placeholder when data exists.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/customers" className={listLinkClass}>
                Customers
              </Link>
            </div>
          </div>
          <div className="mt-4 flex gap-2 rounded-lg border border-border bg-foreground/[0.02] p-3">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-xs leading-relaxed text-foreground-muted">
              <span className="font-medium text-foreground">Possible duplicate</span> will
              be a warn-only hint (similar phones or addresses)—nothing evaluates in this
              shell.
            </p>
          </div>
        </WorkspacePanel>

        {/* Qualification + scope — primary */}
        <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
          <SectionHeading
            title="Qualification & scope signals"
            description="Job type, timing, location or service area, budget band, and fit—enough to know if quoting is worth the effort. Not a score, not a required schema."
            actions={
              <PlaceholderButton title="No qualification store in this build">
                Add signal
              </PlaceholderButton>
            }
          />
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <SignalCard
              label="Scope clarity"
              value="—"
              hint="Summarizes what work is on the table when fields exist."
            />
            <SignalCard
              label="Timing / urgency"
              value="—"
              hint="Start date, deadline, or “ASAP” class signals later."
            />
          </div>
          <EmptyState
            icon={ClipboardList}
            title="No qualification captured"
            description="Keep this lightweight: rough notes beat an empty record. Execution planning stays on quotes and jobs—not the lead inbox."
          >
            <PlaceholderButton title="No qualification store in this build">
              Add signal
            </PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        {/* Quote readiness / next step */}
        <WorkspacePanel className="border border-border border-l-[3px] border-l-accent">
          <SectionHeading
            title="Quote readiness"
            description="When customer, scope, and timing context are solid enough, continue in Quotes—line items and payment plan become the commercial anchor there. No automatic conversion or field copy until models exist."
            actions={
              <>
                <PlaceholderButton title="Needs persisted lead and quote wiring">
                  Create quote from lead
                </PlaceholderButton>
                <Link href="/quotes/new" className={handoffPrimaryLinkClass}>
                  Open new quote
                </Link>
              </>
            }
          />
          <p className="mb-4 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
            Workstation will eventually surface leads that need follow-up; this page is
            for intake and qualification, not your daily action queue.
          </p>
          <EmptyState
            icon={FileText}
            title="Quote handoff not wired"
            description={
              isNew
                ? "Opening “New quote” is navigation only—it does not carry this lead. Linked quotes will appear here after persistence."
                : "Quotes created from this lead will list here. Until then, use Quotes manually—nothing is fabricated."
            }
          >
            <Link href="/quotes" className={listLinkClass}>
              Browse quotes
            </Link>
          </EmptyState>
        </WorkspacePanel>

        {/* Notes & activity */}
        <WorkspacePanel padding="compact">
          <SectionHeading
            title="Notes & activity"
            description="Calls, texts, and stage changes append here when events are stored—internal timeline only."
          />
          <EmptyState
            icon={MessageSquare}
            title="No activity yet"
            description="No fabricated events—timeline shows real history once logging ships."
          />
        </WorkspacePanel>

        <HandoffPanel
          title="Intake → Quotes"
          description="Leads collect context; the quote workspace carries sold scope and money. List and shell links do not sync data yet."
        >
          <Link href="/leads" className={handoffMutedLinkClass}>
            Leads list
          </Link>
          <Link href="/quotes" className={handoffPrimaryLinkClass}>
            View quotes
          </Link>
        </HandoffPanel>
      </div>
    </div>
  );
}
