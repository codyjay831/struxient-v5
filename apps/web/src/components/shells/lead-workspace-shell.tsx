import Link from "next/link";
import { ChevronRight, UserRound } from "lucide-react";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
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

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

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
  /**
   * Optional return context link — shown as the first header action when the
   * user arrived from Workstation (or another page that passes `from=workstation`).
   * Renders a "← Workstation" link before the standard navigation actions.
   */
  returnHref?: string;
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
  returnHref,
}: LeadWorkspaceShellProps) {
  const createdFull = new Date(lead.createdAt).toLocaleString();
  const updatedFull = new Date(lead.updatedAt).toLocaleString();
  const createdShort = new Date(lead.createdAt).toLocaleDateString();
  const convertedFull = lead.convertedAt
    ? new Date(lead.convertedAt).toLocaleString()
    : null;
  const showConvertedWithoutCustomerHelper =
    lead.status === "CONVERTED" && lead.customerId == null;
  const hasContactInfo =
    Boolean(lead.contactName) || Boolean(lead.email) || Boolean(lead.phone);
  const hasIntakeDetails = Boolean(lead.notes) || Boolean(lead.sourceDetail);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Breadcrumb */}
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales" },
          { label: "Leads", href: "/leads" },
          { label: lead.title },
        ]}
      />

      {/* Page header */}
      <PageHeader
        title={lead.title}
        description="Track this opportunity from intake through quote, approval, and job creation."
        actions={
          <>
            {returnHref ? (
              <Link href={returnHref} className={listLinkClass}>
                ← Workstation
              </Link>
            ) : null}
            <Link href="/leads" className={listLinkClass}>
              ← Leads list
            </Link>
            <Link href={`/leads/${lead.id}/edit`} className={listLinkClass}>
              Edit lead
            </Link>
          </>
        }
      />

      {/* ── 1. Lead progress / next action card ── */}
      <LeadCommercialProgressPanel
        progress={commercialProgress}
        leadId={lead.id}
      />

      <div className="space-y-4">
        {/* ── 2. Customer & contact card ── */}
        <WorkspacePanel id="customer-link" padding="compact">
          {lead.customer ? (
            /* Linked state — compact confirmation row */
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserRound
                    className="size-3.5 shrink-0 text-foreground-subtle"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                    Customer
                  </p>
                  <StatusBadge label="Linked" tone="approved" />
                </div>
                <Link
                  href={`/customers/${lead.customer.id}`}
                  className={listLinkClass}
                >
                  View customer
                </Link>
              </div>

              <p className="mt-2 text-sm font-medium text-foreground">
                {lead.customer.displayName}
              </p>

              {hasContactInfo ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {lead.contactName ? (
                    <span className="inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-foreground-muted">
                      {lead.contactName}
                    </span>
                  ) : null}
                  {lead.email ? (
                    <span className="inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-foreground-muted break-all">
                      {lead.email}
                    </span>
                  ) : null}
                  {lead.phone ? (
                    <span className="inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-foreground-muted">
                      {lead.phone}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs text-foreground-muted">
                  No contact info.{" "}
                  <Link
                    href={`/leads/${lead.id}/edit`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Add contact info
                  </Link>
                </p>
              )}
            </div>
          ) : (
            /* Unlinked state — action-forward */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserRound
                    className="size-3.5 shrink-0 text-foreground-subtle"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                    Customer & contact
                  </p>
                </div>
                {!hasContactInfo ? (
                  <Link
                    href={`/leads/${lead.id}/edit`}
                    className={listLinkClass}
                  >
                    Add contact info
                  </Link>
                ) : null}
              </div>

              {/* Contact chips */}
              {hasContactInfo ? (
                <div className="flex flex-wrap items-center gap-2">
                  {lead.contactName ? (
                    <span className="inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-foreground-muted">
                      {lead.contactName}
                    </span>
                  ) : null}
                  {lead.email ? (
                    <span className="inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-foreground-muted break-all">
                      {lead.email}
                    </span>
                  ) : null}
                  {lead.phone ? (
                    <span className="inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-foreground-muted">
                      {lead.phone}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-foreground-muted">
                  No contact info yet.
                </p>
              )}

              {/* Match hints — compact */}
              {matchHints ? (
                matchHints.kind === "skipped-no-contact" ? (
                  <p className="text-xs text-foreground-muted">
                    Add email or phone to{" "}
                    <Link
                      href={`/leads/${lead.id}/edit`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      Edit lead
                    </Link>{" "}
                    and check for matching customers.
                  </p>
                ) : matchHints.matches.length > 0 ? (
                  <div className="rounded-lg border border-border border-l-[3px] border-l-accent bg-foreground/[0.02] px-3 py-3">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
                      Possible matches
                    </p>
                    <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
                      {matchHints.matches.map((m) => (
                        <li
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/customers/${m.id}`}
                              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                            >
                              {m.displayName}
                            </Link>
                            {m.companyName ? (
                              <p className="text-xs text-foreground-muted">
                                {m.companyName}
                              </p>
                            ) : null}
                          </div>
                          <StatusBadge
                            label={
                              m.matchOn === "both"
                                ? "Email & phone"
                                : m.matchOn === "email"
                                  ? "Email"
                                  : "Phone"
                            }
                            tone="neutral"
                          />
                        </li>
                      ))}
                    </ul>
                    <details className="mt-2 group">
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-[0.65rem] text-foreground-subtle hover:text-foreground-muted [&::-webkit-details-marker]:hidden">
                        <ChevronRight
                          className="size-3 transition-transform group-open:rotate-90"
                          aria-hidden
                        />
                        <span>About these matches</span>
                      </summary>
                      <p className="mt-1 text-[0.65rem] leading-relaxed text-foreground-subtle">
                        Scanned {matchHints.scannedCustomerCount} of up to{" "}
                        {matchHints.fetchCap} customer records (display name
                        order). Exact normalized email/phone only. Suggestions
                        — never automatic.
                      </p>
                    </details>
                  </div>
                ) : (
                  <p className="text-xs text-foreground-muted">
                    No matching customers found by email or phone.
                  </p>
                )
              ) : null}

              {/* Attach existing customer */}
              {linkLeadAction ? (
                <div className="border-t border-border pt-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                    Attach existing customer
                  </p>
                  <LeadLinkCustomerForm
                    linkFormAction={linkLeadAction}
                    customers={customersForLink ?? []}
                  />
                </div>
              ) : null}

              {/* Create customer from lead — in disclosure */}
              {createFromLeadAction ? (
                <details className="group border-t border-border pt-4">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
                      aria-hidden
                    />
                    <span>Create customer from lead</span>
                  </summary>
                  <div className="mt-4">
                    <LeadCreateCustomerFromLeadForm
                      lead={lead}
                      formAction={createFromLeadAction}
                    />
                  </div>
                </details>
              ) : null}

              {/* Short reminder */}
              <p className="border-t border-border pt-3 text-xs text-foreground-subtle">
                Suggestions are hints only — no auto-linking or merging. Pick a
                customer and submit explicitly.
              </p>
            </div>
          )}
        </WorkspacePanel>

        {/* ── 3. Intake summary ── */}
        <WorkspacePanel padding="compact">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Intake
            </p>
            <Link href={`/leads/${lead.id}/edit`} className={listLinkClass}>
              Edit
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                Source
              </span>
              <StatusBadge
                label={formatLeadSource(lead.source)}
                tone="neutral"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                Received
              </span>
              <span className="text-xs text-foreground-muted">
                {createdShort}
              </span>
            </div>
          </div>

          {hasIntakeDetails ? (
            <details className="mt-3 group">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-foreground-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
                  aria-hidden
                />
                <span>Intake details</span>
              </summary>
              <div className="mt-3 space-y-3">
                {lead.sourceDetail ? (
                  <div>
                    <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                      Source detail
                    </p>
                    <p className="mt-1 text-xs text-foreground-muted">
                      {lead.sourceDetail}
                    </p>
                  </div>
                ) : null}
                {lead.notes ? (
                  <div>
                    <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                      Notes
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground-muted">
                      {lead.notes}
                    </p>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </WorkspacePanel>

        {/* ── 4. Related quotes ── */}
        <WorkspacePanel padding="compact">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Related quotes
            </p>
            {linkedQuotes.length > 0 ? (
              <Link
                href={`/quotes/new?leadId=${encodeURIComponent(lead.id)}`}
                className={listLinkClass}
              >
                New quote
              </Link>
            ) : null}
          </div>

          {linkedQuotes.length === 0 ? (
            <p className="mt-2 text-sm text-foreground-muted">
              No quotes linked yet. Use the next-action above to start one.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
              {linkedQuotes.map((q) => {
                const updated = new Date(q.updatedAt).toLocaleString();
                return (
                  <li key={q.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/quotes/${q.id}`}
                          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          {q.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-foreground-muted">
                          Updated {updated} · {formatMoneyCents(q.totalCents)}
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

        {/* ── 5. Record details — collapsed disclosure ── */}
        <WorkspacePanel padding="compact">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-3.5 shrink-0 text-foreground-subtle transition-transform group-open:rotate-90"
                aria-hidden
              />
              <span className="text-xs font-medium text-foreground-muted">
                Record details
              </span>
              <StatusBadge
                label={formatLeadStatus(lead.status)}
                tone={leadStatusBadgeTone(lead.status)}
              />
              <span className="ml-auto text-[0.65rem] text-foreground-subtle">
                {createdShort}
              </span>
            </summary>

            <div className="mt-4 space-y-5 border-t border-border pt-4">
              {/* Manual status */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                  Manual status
                </p>
                <p className="mt-1 text-xs text-foreground-muted">
                  Used for your own pipeline tracking. The next-action card
                  above is derived automatically.
                </p>
                {showConvertedWithoutCustomerHelper ? (
                  <p className="mt-2 rounded-lg border border-border border-l-[3px] border-l-accent bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
                    <span className="font-medium text-foreground">
                      Converted without a linked customer.
                    </span>{" "}
                    Linking or creating a customer is a separate explicit step.
                  </p>
                ) : null}
                <LeadStatusForm
                  currentStatus={lead.status}
                  formAction={updateStatusAction}
                />
              </div>

              {/* Record ID */}
              <div>
                <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                  Record ID
                </p>
                <p className="mt-1 break-all font-mono text-xs text-foreground-muted">
                  {lead.id}
                </p>
              </div>

              {/* Timestamps */}
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                    Created
                  </dt>
                  <dd className="mt-0.5 text-foreground-muted">{createdFull}</dd>
                </div>
                <div>
                  <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                    Updated
                  </dt>
                  <dd className="mt-0.5 text-foreground-muted">{updatedFull}</dd>
                </div>
                {convertedFull ? (
                  <div className="sm:col-span-2">
                    <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                      Converted
                    </dt>
                    <dd className="mt-0.5 text-foreground-muted">
                      {convertedFull}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </details>
        </WorkspacePanel>

        {/* ── 6. Deferred placeholders — collapsed ── */}
        <WorkspacePanel padding="compact" className="bg-foreground/[0.01]">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-3.5 shrink-0 text-foreground-subtle transition-transform group-open:rotate-90"
                aria-hidden
              />
              <span className="text-xs text-foreground-subtle">
                Qualification & notes (planned)
              </span>
            </summary>

            <div className="mt-4 space-y-5 border-t border-border pt-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                  Qualification signals
                </p>
                <p className="mt-1 text-xs text-foreground-muted">
                  Job type, timing, location, and fit — not stored in this
                  build.
                </p>
                <div className="mt-2">
                  <PlaceholderButton title="No qualification store in this build">
                    Add signal
                  </PlaceholderButton>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                  Notes & activity
                </p>
                <p className="mt-1 text-xs text-foreground-muted">
                  Activity timeline logs when event storage ships. No
                  fabricated history.
                </p>
              </div>
            </div>
          </details>
        </WorkspacePanel>
      </div>
    </div>
  );
}
