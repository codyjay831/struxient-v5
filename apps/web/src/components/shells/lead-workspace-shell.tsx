import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertTriangle, FileText, History, Inbox, UserPlus } from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

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
      <PageHeader
        eyebrow="Sales"
        title={isNew ? "New lead" : "Lead"}
        description={
          isNew
            ? "Lightweight intake shell—capture source, basic qualification, and watch for duplicates before anyone builds a quote. No rows are written to a database here."
            : "Detail shell for a future stored lead. The id is from the URL only; there is no API fetch and no workflow engine."
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
        </WorkspacePanel>
      ) : null}

      {!isNew ? (
        <WorkspacePanel className="mb-6">
          <SectionHeading
            title="Intake summary"
            description="Stage, owner, and key facts will summarize here when a lead record exists."
          />
          <p className="text-sm text-foreground-muted">
            No stored fields—this shell only mirrors the route you opened.
          </p>
        </WorkspacePanel>
      ) : null}

      <div className="space-y-6">
        <WorkspacePanel>
          <SectionHeading
            title="Source / channel"
            description="Phone, walk-in, partner referral, web form—channels will normalize here; integrations come later."
          />
          <EmptyState
            icon={Inbox}
            title="No source selected"
            description="Pick how this lead arrived once picklists exist. For now this is layout only."
          >
            <PlaceholderButton>Mark source</PlaceholderButton>
          </EmptyState>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Contact & customer match"
            description="See whether this intake maps to an existing Relationships customer or stays a net-new party before quoting."
          />
          <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-8 text-center text-sm text-foreground-muted">
            No matching run—linking to{" "}
            <Link
              href="/customers"
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Customers
            </Link>{" "}
            will require persistence and search.
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Qualification & context"
            description="Job type, timing, budget band, and notes—enough to decide if a quote is worth the effort."
          />
          <div className="space-y-3">
            {["Job type / trade", "Timing", "Location / service area", "Notes"].map(
              (label) => (
                <div
                  key={label}
                  className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5 text-xs text-foreground-subtle"
                >
                  {label} — field placeholder (not editable yet)
                </div>
              ),
            )}
          </div>
        </WorkspacePanel>

        <WorkspacePanel padding="compact">
          <div className="flex gap-2">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
              strokeWidth={1.5}
              aria-hidden
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                Possible duplicate (concept)
              </p>
              <p className="mt-2 text-sm text-foreground-muted">
                When data exists, similar phones or addresses can flash a warning
                before you save—nothing evaluates in this shell.
              </p>
            </div>
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeading
            title="Next: quote"
            description="When intake is enough, Sales continues in the quote workspace—still no automatic handoff without persistence."
            actions={
              <Link
                href="/quotes/new"
                className="inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90"
              >
                Open new quote
              </Link>
            }
          />
          <EmptyState
            icon={UserPlus}
            title="No quote started from this lead"
            description="The link above is navigation only—it does not copy lead fields until models exist."
          />
        </WorkspacePanel>

        {!isNew ? (
          <WorkspacePanel>
            <SectionHeading
              title="Quotes linked to this lead"
              description="After persistence, approved or draft quotes created from this intake will list here."
            />
            <EmptyState
              icon={FileText}
              title="No linked quotes"
              description="Nothing is fabricated—open a quote workspace manually if you are exploring layout."
            />
          </WorkspacePanel>
        ) : null}

        <WorkspacePanel>
          <SectionHeading
            title="Notes & activity"
            description="Calls, emails, and stage changes will append here when events are stored."
          />
          <EmptyState
            icon={History}
            title="No activity yet"
            description="Timeline is empty—no fabricated events."
          />
        </WorkspacePanel>
      </div>
    </div>
  );
}
