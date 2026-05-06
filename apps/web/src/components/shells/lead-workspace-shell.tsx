import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LeadCommercialProgressPanel } from "@/components/leads/lead-commercial-progress-panel";
import { LeadCreateCustomerFromLeadForm } from "@/components/leads/lead-create-customer-from-lead-form";
import { LeadLinkCustomerForm } from "@/components/leads/lead-link-customer-form";
import { LeadStatusForm } from "@/components/leads/lead-status-form";
import type { LeadFormState } from "@/app/(workspace)/leads/lead-form-actions";
import type { LeadCustomerMatchHints } from "@/lib/lead-customer-match-hints";
import type { LeadCommercialProgress } from "@/lib/lead-commercial-progress";
import {
  formatLeadSource,
  formatLeadStatus,
  leadStatusBadgeTone,
  type LeadDetailPayload,
} from "@/lib/lead-display";
import {
  formatMoneyCents,
  formatQuoteStatus,
  quoteStatusBadgeTone,
  type QuoteLinkedSummary,
} from "@/lib/quote-display";
import { AlertTriangle, ClipboardList, MessageSquare } from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

function LeadRecordPanel({
  lead,
  updateStatusAction,
}: {
  lead: LeadDetailPayload;
  updateStatusAction: (
    prevState: LeadFormState,
    formData: FormData,
  ) => Promise<LeadFormState>;
}) {
  const createdLabel = new Date(lead.createdAt).toLocaleString();
  const updatedLabel = new Date(lead.updatedAt).toLocaleString();
  const convertedLabel = lead.convertedAt
    ? new Date(lead.convertedAt).toLocaleString()
    : null;
  const showConvertedWithoutCustomerHelper =
    lead.status === "CONVERTED" && lead.customerId == null;

  return (
    <WorkspacePanel padding="compact" className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
        Record
      </p>
      <p className="mt-1 break-all font-mono text-xs text-foreground-muted">{lead.id}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge
          label={formatLeadStatus(lead.status)}
          tone={leadStatusBadgeTone(lead.status)}
        />
        <span className="text-xs text-foreground-muted">
          Lead status is set manually here. It is independent from the derived
          Commercial Progress shown above.
        </span>
      </div>
      {showConvertedWithoutCustomerHelper ? (
        <p className="mt-3 rounded-lg border border-border border-l-[3px] border-l-accent bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
          <span className="font-medium text-foreground">Converted without a linked customer.</span>{" "}
          That is allowed. Linking or creating a customer from this lead is a
          separate explicit step.
        </p>
      ) : null}
      <LeadStatusForm currentStatus={lead.status} formAction={updateStatusAction} />
      <dl className="mt-4 grid gap-2 text-xs text-foreground-muted sm:grid-cols-2">
        <div>
          <dt className="font-medium uppercase tracking-wide text-foreground-subtle">Created</dt>
          <dd className="mt-0.5 text-foreground">{createdLabel}</dd>
        </div>
        <div>
          <dt className="font-medium uppercase tracking-wide text-foreground-subtle">Updated</dt>
          <dd className="mt-0.5 text-foreground">{updatedLabel}</dd>
        </div>
        {convertedLabel ? (
          <div className="sm:col-span-2">
            <dt className="font-medium uppercase tracking-wide text-foreground-subtle">
              Converted (recorded)
            </dt>
            <dd className="mt-0.5 text-foreground">{convertedLabel}</dd>
          </div>
        ) : null}
      </dl>
    </WorkspacePanel>
  );
}

export type LeadWorkspaceShellProps = {
  lead: LeadDetailPayload;
  /** Bound `updateLeadStatusAction.bind(null, lead.id)` from the lead detail route. */
  updateStatusAction: (
    prevState: LeadFormState,
    formData: FormData,
  ) => Promise<LeadFormState>;
  /** Org-scoped customers for the link form; omit when the lead is already linked. */
  customersForLink?: { id: string; displayName: string }[];
  /** Bound `linkLeadToCustomerAction.bind(null, lead.id)`; omit when already linked. */
  linkLeadAction?: (
    prevState: LeadFormState,
    formData: FormData,
  ) => Promise<LeadFormState>;
  /** Warn-only customer match hints when the lead is unlinked. */
  matchHints?: LeadCustomerMatchHints;
  /** Bound `createCustomerFromLeadAction.bind(null, lead.id)` when unlinked. */
  createFromLeadAction?: (
    prevState: LeadFormState,
    formData: FormData,
  ) => Promise<LeadFormState>;
  /** Quotes in this org that reference this lead (read-only). */
  linkedQuotes?: QuoteLinkedSummary[];
  /** Derived commercial progress story; computed server-side per request. */
  commercialProgress: LeadCommercialProgress;
};

export function LeadWorkspaceShell({
  lead,
  updateStatusAction,
  customersForLink,
  linkLeadAction,
  matchHints,
  createFromLeadAction,
  linkedQuotes = [],
  commercialProgress,
}: LeadWorkspaceShellProps) {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales" },
          { label: "Leads", href: "/leads" },
          { label: lead.title },
        ]}
      />
      <PageHeader
        eyebrow="Sales"
        title={lead.title}
        description="Commercial workspace for this opportunity. Commercial Progress below summarizes where things stand across the lead and any related quotes; lead status, customer link, and notes still live on this page as separate explicit actions."
        actions={
          <>
            <Link href="/leads" className={listLinkClass}>
              ← Leads list
            </Link>
            <Link href={`/leads/${lead.id}/edit`} className={listLinkClass}>
              Edit lead
            </Link>
          </>
        }
      />

      <LeadCommercialProgressPanel
        progress={commercialProgress}
        leadId={lead.id}
        manualLeadStatus={lead.status}
      />

      <LeadRecordPanel lead={lead} updateStatusAction={updateStatusAction} />

      <div className="space-y-6">
        {/* Source / intake */}
        <WorkspacePanel>
          <SectionHeading
            title="Source / intake"
            description="Phone, text, email, website form, walk-in, referral, or manual entry—channels normalize here when integrations and imports exist."
          />
          <div className="rounded-lg border border-border bg-surface px-4 py-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                  Source
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {formatLeadSource(lead.source)}
                </dd>
              </div>
              <div>
                <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                  Source detail
                </dt>
                <dd className="mt-1 text-sm text-foreground">{lead.sourceDetail || "—"}</dd>
              </div>
            </dl>
          </div>
        </WorkspacePanel>

        {/* Contact / customer match */}
        <WorkspacePanel>
          <SectionHeading
            title="Contact / customer match"
            description="Intake contact fields stay on the lead. Duplicate hints are warn-only and never block you. Create a customer from this lead or link an existing one only when you choose to—both are explicit."
          />
          <div className="rounded-lg border border-border bg-surface px-4 py-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                  Contact name
                </dt>
                <dd className="mt-1 text-sm text-foreground">{lead.contactName || "—"}</dd>
              </div>
              <div>
                <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                  Email
                </dt>
                <dd className="mt-1 text-sm text-foreground">{lead.email || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                  Phone
                </dt>
                <dd className="mt-1 text-sm text-foreground">{lead.phone || "—"}</dd>
              </div>
            </dl>
          </div>
          {matchHints ? (
            matchHints.kind === "skipped-no-contact" ? (
              <div className="mt-4 rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-3">
                <p className="text-xs leading-relaxed text-foreground-muted">
                  <span className="font-medium text-foreground">Possible customer matches</span>{" "}
                  need an email or phone on this lead. Add them on{" "}
                  <Link
                    href={`/leads/${lead.id}/edit`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Edit lead
                  </Link>{" "}
                  to check for exact matches in your organization (normalized email and digits-only
                  phone).
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-border border-l-[3px] border-l-accent bg-foreground/[0.02] px-4 py-4">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
                  Possible customer matches
                </p>
                <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
                  Same organization only. Exact normalized email and/or phone—suggestions only,
                  never automatic linking or merging.
                </p>
                {matchHints.matches.length === 0 ? (
                  <p className="mt-3 text-sm text-foreground-muted">
                    No customer rows in the scanned set match this lead&apos;s email or phone.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
                    {matchHints.matches.map((m) => (
                      <li key={m.id} className="px-3 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/customers/${m.id}`}
                              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                            >
                              {m.displayName}
                            </Link>
                            {m.companyName ? (
                              <p className="text-xs text-foreground-muted">{m.companyName}</p>
                            ) : null}
                            <p className="mt-1 text-xs text-foreground-muted">
                              <span className="break-all">{m.email || "—"}</span>
                              <span className="text-foreground-subtle"> · </span>
                              <span>{m.phone || "—"}</span>
                            </p>
                          </div>
                          <StatusBadge
                            label={
                              m.matchOn === "both"
                                ? "Email & phone"
                                : m.matchOn === "email"
                                  ? "Email match"
                                  : "Phone match"
                            }
                            tone="neutral"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[0.65rem] leading-relaxed text-foreground-subtle">
                  Scanned {matchHints.scannedCustomerCount} of up to {matchHints.fetchCap} customer
                  records (display name order). Matches outside this window are not evaluated yet.
                </p>
              </div>
            )
          ) : null}
          {linkLeadAction && createFromLeadAction ? (
            <div className="mt-4 rounded-lg border border-border bg-foreground/[0.02] px-4 py-4">
              <LeadCreateCustomerFromLeadForm lead={lead} formAction={createFromLeadAction} />
            </div>
          ) : null}
          <div
            id="customer-link"
            className="mt-4 scroll-mt-24 rounded-lg border border-border bg-foreground/[0.02] px-4 py-4"
          >
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
              Customer link
            </p>
            {lead.customer ? (
              <>
                <p className="mt-2 text-sm text-foreground-muted">
                  Linked to{" "}
                  <Link
                    href={`/customers/${lead.customer.id}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {lead.customer.displayName}
                  </Link>
                  .
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/customers" className={listLinkClass}>
                    Browse customers
                  </Link>
                </div>
              </>
            ) : linkLeadAction ? (
              <div className="mt-3">
                <LeadLinkCustomerForm
                  linkFormAction={linkLeadAction}
                  customers={customersForLink ?? []}
                />
              </div>
            ) : (
              <>
                <p className="mt-2 text-sm text-foreground-muted">Not linked to a customer yet.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/customers" className={listLinkClass}>
                    Browse customers
                  </Link>
                </div>
              </>
            )}
          </div>
          <div className="mt-4 flex gap-2 rounded-lg border border-border bg-foreground/[0.02] p-3">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-xs leading-relaxed text-foreground-muted">
              <span className="font-medium text-foreground">Reminder</span>—suggestions never block
              linking. Choose a customer in{" "}
              <span className="font-medium text-foreground">Customer link</span> and submit
              explicitly; there is no auto-merge.
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

        <WorkspacePanel className="mb-6">
          <SectionHeading
            title="Related quotes"
            description="All quotes for this lead in this organization, newest first. Commercial Progress above tracks the most recent active quote; older or archived ones stay listed here as history."
            actions={
              linkedQuotes.length > 0 ? (
                <Link
                  href={`/quotes/new?leadId=${encodeURIComponent(lead.id)}`}
                  className={listLinkClass}
                >
                  New quote from this lead
                </Link>
              ) : null
            }
          />
          {linkedQuotes.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No quotes reference this lead yet. Use the Commercial Progress action above to start
              one when ready.
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

        {/* Notes & activity */}
        <WorkspacePanel padding="compact">
          <SectionHeading
            title="Notes & activity"
            description="Calls, texts, and stage changes append here when events are stored—internal timeline only."
          />
          {lead.notes ? (
            <p className="mb-6 rounded-lg border border-border bg-foreground/[0.02] px-4 py-3 text-sm leading-relaxed text-foreground-muted">
              {lead.notes}
            </p>
          ) : (
            <p className="mb-6 text-sm text-foreground-muted">No notes on this record.</p>
          )}
          <EmptyState
            icon={MessageSquare}
            title="No activity yet"
            description="No fabricated events—timeline shows real history once logging ships."
          />
        </WorkspacePanel>
      </div>
    </div>
  );
}
