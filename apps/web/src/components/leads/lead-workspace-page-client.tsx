"use client";

/**
 * LeadWorkspacePageClient — client component for the full Lead record page.
 *
 * Renders the tabbed workspace (Overview, Contact, Activity, Quote) that sits
 * below the server-rendered identity header.  Receives pre-serialized data so
 * no Date objects cross the server→client boundary.
 *
 * Action-kind mapping on the full page (same contract as the popup):
 *   OPEN_DRAFT_QUOTE / OPEN_QUOTE / START_QUOTE → Quote tab
 *   ATTACH_OR_CREATE_CUSTOMER / EDIT_CONTACT_INFO  → Contact tab
 *   OPEN_JOB / OPEN_EXECUTION_REVIEW              → deep-link (with context)
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronRight, Pencil } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StatusBadgeTone } from "@/components/ui/status-badge";
import { LEAD_COMMERCIAL_PROGRESS_STEPS } from "@/lib/lead-commercial-progress";
import { prepareCustomerFromLead } from "@/lib/lead-create-customer-from-lead";
import {
  createCustomerFromLeadWorkspaceAction,
  updateLeadContactWorkspaceAction,
  type WorkspaceFormState,
} from "@/app/(workspace)/leads/leads-workspace-actions";
import type { LeadFormState } from "@/app/(workspace)/leads/lead-form-actions";
import type { LeadCustomerMatchHints } from "@/lib/lead-customer-match-hints";
import { LeadLinkCustomerForm } from "@/components/leads/lead-link-customer-form";
import { LeadStatusForm } from "@/components/leads/lead-status-form";
import type { LeadStatus } from "@prisma/client";

/* ─── Serialized types ───────────────────────────────────────────────────── */

export type SerializedProgressActionFull = {
  href: string;
  label: string;
  opensQuoteTab: boolean;
  opensContactTab: boolean;
};

export type SerializedLinkedQuoteFull = {
  id: string;
  title: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  totalCents: number;
  lineItemCount: number;
  updatedAtLabel: string;
  href: string;
  executionReviewHref: string;
  isDraft: boolean;
  isSent: boolean;
  isApproved: boolean;
};

export type SerializedLeadFull = {
  id: string;
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  sourceLabel: string;
  sourceDetail: string | null;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  /** Raw LeadStatus string — passed to LeadStatusForm for the select default. */
  statusValue: LeadStatus;
  customerId: string | null;
  customerDisplayName: string | null;
  customerHref: string | null;
  createdAtLabel: string;
  updatedAtLabel: string;
  convertedAtLabel: string | null;
  showConvertedWithoutCustomerHelper: boolean;
  leadHref: string;
  editHref: string;
  newQuoteHref: string;
  progressLabel: string;
  progressDescription: string;
  progressTone: StatusBadgeTone;
  progressState: string;
  progressPrimaryAction: SerializedProgressActionFull | null;
  progressSecondaryAction: SerializedProgressActionFull | null;
  progressStepIndex: number;
  progressTotalSteps: number;
  progressIsTerminal: boolean;
  activeQuoteId: string | null;
  activeQuoteTitle: string | null;
  activeQuoteStatusLabel: string | null;
  activeQuoteTone: StatusBadgeTone | null;
  activeQuoteTotalCents: number | null;
  activeQuoteLineItemCount: number | null;
  activeJobId: string | null;
  activeJobStatus: string | null;
  showsRevisionDrift: boolean;
};

/* ─── Shared style constants ─────────────────────────────────────────────── */

const primaryBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-accent text-accent-contrast text-xs font-medium px-3 py-2 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed";

const secondaryBtnClass =
  "inline-flex items-center rounded-lg border border-border bg-surface text-foreground-muted text-xs px-3 py-2 hover:text-foreground hover:border-border-strong transition-colors";

const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:border-border-strong focus:outline-none";

const sectionLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

/* ─── Workspace tab type ─────────────────────────────────────────────────── */

type WorkspaceTab = "overview" | "contact" | "activity" | "quote";

const WS_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contact", label: "Contact" },
  { id: "activity", label: "Activity" },
  { id: "quote", label: "Quote" },
];

/* ─── Money helper ───────────────────────────────────────────────────────── */

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/* ─── Progress step indicator ────────────────────────────────────────────── */

function StepIndicator({
  stepIndex,
  totalSteps,
  isTerminal,
}: {
  stepIndex: number;
  totalSteps: number;
  isTerminal: boolean;
}) {
  if (isTerminal) {
    return (
      <p className="text-xs text-foreground-subtle">
        This opportunity is closed — no further commercial steps expected.
      </p>
    );
  }

  const steps = LEAD_COMMERCIAL_PROGRESS_STEPS.slice(0, totalSteps);
  return (
    <ol className="flex items-stretch gap-2" aria-label="Commercial progress">
      {steps.map((step, index) => {
        const isCompleted = index < stepIndex;
        const isCurrent = index === stepIndex;
        return (
          <li
            key={step.key}
            className="flex min-w-0 flex-1 flex-col gap-1.5"
            aria-current={isCurrent ? "step" : undefined}
          >
            <span
              className={[
                "h-1.5 rounded-full transition-colors",
                isCompleted
                  ? "bg-foreground"
                  : isCurrent
                    ? "bg-foreground/70"
                    : "bg-foreground/15",
              ].join(" ")}
              aria-hidden
            />
            <span
              className={[
                "truncate text-[0.65rem] font-medium uppercase tracking-wide",
                isCurrent
                  ? "text-foreground"
                  : isCompleted
                    ? "text-foreground-muted"
                    : "text-foreground-subtle",
              ].join(" ")}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ─── Next step panel ────────────────────────────────────────────────────── */

function NextStepPanel({
  lead,
  onSwitchToQuote,
  onSwitchToContact,
}: {
  lead: SerializedLeadFull;
  onSwitchToQuote: () => void;
  onSwitchToContact: () => void;
}) {
  const { progressPrimaryAction: primary, progressSecondaryAction: secondary } = lead;

  function renderAction(
    action: SerializedProgressActionFull,
    variant: "primary" | "secondary",
  ) {
    const cls = variant === "primary" ? primaryBtnClass : secondaryBtnClass;
    if (action.opensQuoteTab) {
      return (
        <button type="button" onClick={onSwitchToQuote} className={cls}>
          {action.label}
          {variant === "primary" && (
            <ArrowRight className="w-3.5 h-3.5 opacity-70" strokeWidth={2} />
          )}
        </button>
      );
    }
    if (action.opensContactTab) {
      return (
        <button type="button" onClick={onSwitchToContact} className={cls}>
          {action.label}
          {variant === "primary" && (
            <ArrowRight className="w-3.5 h-3.5 opacity-70" strokeWidth={2} />
          )}
        </button>
      );
    }
    return (
      <Link href={action.href} className={cls}>
        {action.label}
        {variant === "primary" && (
          <ArrowUpRight className="w-3.5 h-3.5 opacity-70" strokeWidth={1.5} />
        )}
      </Link>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-border-strong bg-background p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <p className={sectionLabelClass}>Next step</p>
        <StatusBadge label={lead.progressLabel} tone={lead.progressTone} />
      </div>

      <p className="text-sm text-foreground-muted leading-relaxed mb-4">
        {lead.progressDescription}
      </p>

      {/* Job context when action targets a job */}
      {lead.activeJobId && (
        <div className="mb-4 rounded-lg border border-border bg-surface px-3 py-2.5 flex items-center justify-between gap-3">
          <div>
            <p className={sectionLabelClass}>Linked job</p>
            <p className="mt-0.5 text-sm font-medium text-foreground capitalize">
              {lead.activeJobStatus
                ? lead.activeJobStatus.charAt(0).toUpperCase() +
                  lead.activeJobStatus.slice(1).toLowerCase()
                : "Active"}
            </p>
          </div>
          <Link
            href={`/jobs/${lead.activeJobId}`}
            className="text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Open job
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {primary && renderAction(primary, "primary")}
        {secondary && renderAction(secondary, "secondary")}
      </div>

      <div className="mt-5 pt-4 border-t border-border">
        <StepIndicator
          stepIndex={lead.progressStepIndex}
          totalSteps={lead.progressTotalSteps}
          isTerminal={lead.progressIsTerminal}
        />
      </div>
    </div>
  );
}

/* ─── Inline create-customer form ────────────────────────────────────────── */

function CreateCustomerForm({
  lead,
  onSuccess,
}: {
  lead: SerializedLeadFull;
  onSuccess: () => void;
}) {
  const boundAction = createCustomerFromLeadWorkspaceAction.bind(null, lead.id);
  const [state, dispatch, isPending] = useActionState<WorkspaceFormState, FormData>(
    boundAction,
    {},
  );

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  const prepared = prepareCustomerFromLead({
    title: lead.title,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    notes: lead.notes,
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <p className={sectionLabelClass}>Create customer from lead</p>
      <p className="text-xs text-foreground-muted leading-relaxed">
        Creates a new customer record from this intake and links it to the lead. Review the
        preview, then confirm.
      </p>

      {!prepared.ok ? (
        <div className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-danger">
          {prepared.error}{" "}
          <Link
            href={lead.editHref}
            className="font-medium text-foreground underline underline-offset-2 hover:opacity-80"
          >
            Edit lead
          </Link>
        </div>
      ) : (
        <dl className="rounded-lg border border-border bg-background px-4 py-3 grid gap-2.5 text-sm">
          <div>
            <dt className={sectionLabelClass}>Display name</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {prepared.data.displayName}
            </dd>
          </div>
          <div>
            <dt className={sectionLabelClass}>Email</dt>
            <dd className="mt-0.5 text-foreground-muted break-all">
              {prepared.data.email ?? "—"}
            </dd>
          </div>
          <div>
            <dt className={sectionLabelClass}>Phone</dt>
            <dd className="mt-0.5 text-foreground-muted">
              {prepared.data.phone ?? "—"}
            </dd>
          </div>
        </dl>
      )}

      {state.error && (
        <p
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      )}

      <form action={dispatch} className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isPending || !prepared.ok}
          aria-busy={isPending}
          className={primaryBtnClass}
        >
          {isPending ? "Creating…" : "Create customer from lead"}
        </button>
        <Link href={lead.editHref} className={mutedLinkClass}>
          Edit lead first
        </Link>
      </form>
    </div>
  );
}

/* ─── Inline contact edit form ───────────────────────────────────────────── */

function EditContactForm({
  lead,
  onSuccess,
  onCancel,
}: {
  lead: SerializedLeadFull;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const boundAction = updateLeadContactWorkspaceAction.bind(null, lead.id);
  const [state, dispatch, isPending] = useActionState<WorkspaceFormState, FormData>(
    boundAction,
    {},
  );

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  return (
    <form action={dispatch} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label
            htmlFor="full-contactName"
            className={`mb-1 block ${sectionLabelClass}`}
          >
            Contact name
          </label>
          <input
            id="full-contactName"
            name="contactName"
            type="text"
            defaultValue={lead.contactName ?? ""}
            className={inputClass}
            placeholder="Name"
          />
        </div>
        <div>
          <label htmlFor="full-email" className={`mb-1 block ${sectionLabelClass}`}>
            Email
          </label>
          <input
            id="full-email"
            name="email"
            type="email"
            defaultValue={lead.email ?? ""}
            className={inputClass}
            placeholder="email@example.com"
          />
        </div>
        <div>
          <label htmlFor="full-phone" className={`mb-1 block ${sectionLabelClass}`}>
            Phone
          </label>
          <input
            id="full-phone"
            name="phone"
            type="tel"
            defaultValue={lead.phone ?? ""}
            className={inputClass}
            placeholder="(555) 000-0000"
          />
        </div>
      </div>

      {state.error && (
        <p
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          className={primaryBtnClass}
        >
          {isPending ? "Saving…" : "Save contact info"}
        </button>
        <button type="button" onClick={onCancel} className={secondaryBtnClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ─── Overview tab ───────────────────────────────────────────────────────── */

function OverviewTab({
  lead,
  linkedQuotes,
  updateStatusAction,
}: {
  lead: SerializedLeadFull;
  linkedQuotes: SerializedLinkedQuoteFull[];
  updateStatusAction: (prevState: LeadFormState, formData: FormData) => Promise<LeadFormState>;
}) {
  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Customer</p>
          <p className="text-sm font-medium text-foreground truncate">
            {lead.customerDisplayName ?? "Not linked"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Quote</p>
          <p className="text-sm font-medium text-foreground">
            {linkedQuotes.length === 0
              ? "Not started"
              : linkedQuotes[0].statusLabel}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Source</p>
          <p className="text-sm font-medium text-foreground">{lead.sourceLabel}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Received</p>
          <p className="text-sm font-medium text-foreground">{lead.createdAtLabel}</p>
        </div>
      </div>

      {/* Active quote summary */}
      {lead.activeQuoteId && lead.activeQuoteTitle && (
        <Link
          href={`/quotes/${lead.activeQuoteId}`}
          className="block rounded-xl border border-border bg-surface overflow-hidden hover:border-border-strong transition-colors"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className={sectionLabelClass}>Active quote</p>
            {lead.activeQuoteTone && lead.activeQuoteStatusLabel && (
              <StatusBadge
                label={lead.activeQuoteStatusLabel}
                tone={lead.activeQuoteTone}
              />
            )}
          </div>
          <div className="px-4 py-3 flex items-baseline gap-2">
            <p className="text-sm font-medium text-foreground truncate flex-1">
              {lead.activeQuoteTitle}
            </p>
          </div>
          <div className="px-4 pb-3 flex items-baseline gap-2">
            {lead.activeQuoteTotalCents !== null && (
              <span className="text-lg font-semibold text-foreground tabular-nums">
                {formatMoney(lead.activeQuoteTotalCents)}
              </span>
            )}
            {lead.activeQuoteLineItemCount !== null && (
              <span className="text-xs text-foreground-subtle">
                · {lead.activeQuoteLineItemCount}{" "}
                {lead.activeQuoteLineItemCount === 1 ? "line item" : "line items"}
              </span>
            )}
            {lead.showsRevisionDrift && (
              <span className="ml-2 rounded-md border border-border-strong bg-foreground/[0.04] px-2 py-0.5 text-[0.7rem] font-medium text-foreground">
                Edits since last send
              </span>
            )}
          </div>
          <div className="px-4 pb-3">
            <span className="inline-flex items-center gap-1 text-xs text-foreground-subtle">
              Open quote page
              <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
            </span>
          </div>
        </Link>
      )}

      {/* Active job summary */}
      {lead.activeJobId && (
        <Link
          href={`/jobs/${lead.activeJobId}`}
          className="block rounded-xl border border-border bg-surface px-4 py-3 hover:border-border-strong transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={sectionLabelClass}>Active job</p>
              <p className="mt-0.5 text-sm font-medium text-foreground capitalize">
                {lead.activeJobStatus
                  ? lead.activeJobStatus.charAt(0).toUpperCase() +
                    lead.activeJobStatus.slice(1).toLowerCase()
                  : "Active"}
              </p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-foreground-subtle" strokeWidth={1.5} />
          </div>
        </Link>
      )}

      {/* Intake notes */}
      {(lead.notes || lead.sourceDetail) && (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <p className={sectionLabelClass}>Intake notes</p>
          {lead.sourceDetail && (
            <div>
              <p className={`${sectionLabelClass} mb-0.5`}>Source detail</p>
              <p className="text-sm text-foreground-muted">{lead.sourceDetail}</p>
            </div>
          )}
          {lead.notes && (
            <div>
              <p className={`${sectionLabelClass} mb-0.5`}>Notes</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground-muted">
                {lead.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Record details — collapsible */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-3.5 shrink-0 text-foreground-subtle transition-transform group-open:rotate-90"
              aria-hidden
            />
            <span className={sectionLabelClass}>Record details</span>
            <StatusBadge label={lead.statusLabel} tone={lead.statusTone} />
            <span className="ml-auto text-[0.65rem] text-foreground-subtle">
              {lead.createdAtLabel}
            </span>
          </summary>

          <div className="mt-4 space-y-5 border-t border-border pt-4">
            {/* Manual status */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                Manual status
              </p>
              <p className="mt-1 text-xs text-foreground-muted">
                Used for your own pipeline tracking. The next step above is derived
                automatically.
              </p>
              {lead.showConvertedWithoutCustomerHelper && (
                <p className="mt-2 rounded-lg border border-border border-l-[3px] border-l-accent bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
                  <span className="font-medium text-foreground">
                    Converted without a linked customer.
                  </span>{" "}
                  Linking or creating a customer is a separate explicit step.
                </p>
              )}
              <LeadStatusForm
                currentStatus={lead.statusValue}
                formAction={updateStatusAction}
              />
            </div>

            {/* Timestamps */}
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className={sectionLabelClass}>Created</dt>
                <dd className="mt-0.5 text-foreground-muted">{lead.createdAtLabel}</dd>
              </div>
              <div>
                <dt className={sectionLabelClass}>Updated</dt>
                <dd className="mt-0.5 text-foreground-muted">{lead.updatedAtLabel}</dd>
              </div>
              {lead.convertedAtLabel && (
                <div className="sm:col-span-2">
                  <dt className={sectionLabelClass}>Converted</dt>
                  <dd className="mt-0.5 text-foreground-muted">{lead.convertedAtLabel}</dd>
                </div>
              )}
            </dl>

            {/* Record ID */}
            <div>
              <p className={sectionLabelClass}>Record ID</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground-muted">
                {lead.id}
              </p>
            </div>
          </div>
        </details>
      </div>

      {/* Full edit link */}
      <div className="pt-1">
        <Link
          href={lead.editHref}
          className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Edit full lead record
          <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}

/* ─── Contact tab ────────────────────────────────────────────────────────── */

function ContactTab({
  lead,
  onRefresh,
  customersForLink,
  linkLeadAction,
  matchHints,
}: {
  lead: SerializedLeadFull;
  onRefresh: () => void;
  customersForLink?: { id: string; displayName: string }[];
  linkLeadAction?: (prevState: LeadFormState, formData: FormData) => Promise<LeadFormState>;
  matchHints?: LeadCustomerMatchHints;
}) {
  const [isEditingContact, setIsEditingContact] = useState(
    () => lead.progressState === "ADD_CONTACT_INFO",
  );

  function handleContactSaved() {
    setIsEditingContact(false);
    onRefresh();
  }

  const hasMatchHints =
    matchHints?.kind === "checked" && matchHints.matches.length > 0;

  return (
    <div className="space-y-4">
      {/* ── Contact info ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className={sectionLabelClass}>Contact info</p>
          {!isEditingContact && (
            <button
              type="button"
              onClick={() => setIsEditingContact(true)}
              className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground transition-colors"
            >
              <Pencil className="w-3 h-3" strokeWidth={1.5} />
              Edit
            </button>
          )}
        </div>

        {isEditingContact ? (
          <EditContactForm
            lead={lead}
            onSuccess={handleContactSaved}
            onCancel={() => setIsEditingContact(false)}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className={`${sectionLabelClass} mb-0.5`}>Name</p>
              <p className="text-sm text-foreground-muted">
                {lead.contactName ?? "Not provided"}
              </p>
            </div>
            <div>
              <p className={`${sectionLabelClass} mb-0.5`}>Email</p>
              {lead.email ? (
                <a
                  href={`mailto:${lead.email}`}
                  className="text-sm text-foreground-muted hover:text-foreground transition-colors break-all"
                >
                  {lead.email}
                </a>
              ) : (
                <p className="text-sm text-foreground-muted">Not provided</p>
              )}
            </div>
            <div>
              <p className={`${sectionLabelClass} mb-0.5`}>Phone</p>
              {lead.phone ? (
                <a
                  href={`tel:${lead.phone}`}
                  className="text-sm text-foreground-muted hover:text-foreground transition-colors"
                >
                  {lead.phone}
                </a>
              ) : (
                <p className="text-sm text-foreground-muted">Not provided</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Customer ─────────────────────────────────────────────────────── */}
      {lead.customerId ? (
        /* Linked */
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className={sectionLabelClass}>Customer</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {lead.customerDisplayName}
              </p>
              <StatusBadge label="Linked" tone="approved" />
            </div>
            <div className="flex flex-col items-end gap-2">
              {lead.customerHref && (
                <Link href={lead.customerHref} className={mutedLinkClass}>
                  Customer record
                  <ArrowUpRight className="w-3 h-3 ml-1" strokeWidth={1.5} />
                </Link>
              )}
              <Link href={lead.editHref} className={mutedLinkClass}>
                Change link
              </Link>
            </div>
          </div>
        </div>
      ) : (
        /* Not linked — create or link */
        <div className="space-y-4">
          {/* Customer match hints */}
          {hasMatchHints && matchHints.kind === "checked" && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className={`${sectionLabelClass} mb-3`}>Likely customer matches</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
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
                        <p className="text-xs text-foreground-muted">{m.companyName}</p>
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
              <p className="mt-2 text-[0.65rem] text-foreground-subtle">
                Suggestions are hints only — no auto-linking.
              </p>
            </div>
          )}

          {/* Create from lead (workspace action — stays on page) */}
          <CreateCustomerForm lead={lead} onSuccess={onRefresh} />

          {/* Link existing (redirects after success) */}
          {customersForLink && linkLeadAction && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    className="size-3.5 shrink-0 text-foreground-subtle transition-transform group-open:rotate-90"
                    aria-hidden
                  />
                  <span className="text-xs font-medium text-foreground-muted hover:text-foreground transition-colors">
                    Link existing customer
                  </span>
                </summary>
                <div className="mt-4 border-t border-border pt-4">
                  <p className={`${sectionLabelClass} mb-3`}>Select customer to link</p>
                  <LeadLinkCustomerForm
                    linkFormAction={linkLeadAction}
                    customers={customersForLink}
                  />
                </div>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Activity tab ───────────────────────────────────────────────────────── */

function ActivityTab({
  lead,
  linkedQuotes,
}: {
  lead: SerializedLeadFull;
  linkedQuotes: SerializedLinkedQuoteFull[];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className={`${sectionLabelClass} mb-3`}>Timeline</p>
        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5">
            <div className="w-2 h-2 rounded-full bg-border-strong mt-1.5 shrink-0" />
            <div>
              <span className="text-sm text-foreground-subtle">
                Lead created
              </span>
              <span className="text-xs text-foreground-subtle ml-1.5">
                · {lead.createdAtLabel}
              </span>
            </div>
          </div>

          {lead.convertedAtLabel && lead.customerDisplayName && (
            <div className="flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-border-strong mt-1.5 shrink-0" />
              <div>
                <span className="text-sm text-foreground-subtle">
                  Customer linked · {lead.customerDisplayName}
                </span>
                <span className="text-xs text-foreground-subtle ml-1.5">
                  · {lead.convertedAtLabel}
                </span>
              </div>
            </div>
          )}

          {linkedQuotes.map((q) => (
            <div key={q.id} className="flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-foreground mt-1.5 shrink-0" />
              <div>
                <span className="text-sm font-medium text-foreground">
                  Quote {q.statusLabel.toLowerCase()}
                </span>
                <span className="text-xs text-foreground-subtle ml-1.5">
                  · {q.title} · {q.updatedAtLabel}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-foreground-subtle px-1">
        Detailed activity logs will appear here when event storage is available.
        No fabricated history is shown.
      </p>
    </div>
  );
}

/* ─── Quote tab ──────────────────────────────────────────────────────────── */

function QuoteTab({
  lead,
  linkedQuotes,
  onSwitchToContact,
}: {
  lead: SerializedLeadFull;
  linkedQuotes: SerializedLinkedQuoteFull[];
  onSwitchToContact: () => void;
}) {
  if (linkedQuotes.length === 0) {
    const canStart = lead.customerId != null;
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
          <p className="text-sm font-medium text-foreground">No quote started</p>
          <p className="text-xs text-foreground-subtle max-w-xs leading-relaxed">
            {canStart
              ? "Open the quote builder to create a quote for this lead."
              : "Link a customer first so the quote is tied to a billing record."}
          </p>
          {canStart ? (
            <Link href={lead.newQuoteHref} className={primaryBtnClass}>
              Open quote builder
              <ArrowUpRight className="w-3.5 h-3.5 opacity-70" strokeWidth={1.5} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onSwitchToContact}
              className="text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Go to Contact tab to link or create a customer
            </button>
          )}
        </div>

        {!canStart && (
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-foreground-muted leading-relaxed">
            You can also start a quote without a linked customer.{" "}
            <Link
              href={lead.newQuoteHref}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Open quote builder anyway
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {linkedQuotes.map((q) => (
        <div
          key={q.id}
          className="rounded-xl border border-border bg-surface overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground truncate">{q.title}</p>
            <StatusBadge label={q.statusLabel} tone={q.statusTone} />
          </div>
          <div className="px-4 py-3 flex items-baseline gap-2">
            <span className="text-lg font-semibold text-foreground tabular-nums">
              {formatMoney(q.totalCents)}
            </span>
            <span className="text-xs text-foreground-subtle">
              · {q.lineItemCount}{" "}
              {q.lineItemCount === 1 ? "line item" : "line items"}
            </span>
            <span className="text-xs text-foreground-subtle">
              · Updated {q.updatedAtLabel}
            </span>
          </div>
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {q.isDraft && (
              <Link href={q.href} className={primaryBtnClass}>
                Continue quote
                <ArrowRight className="w-3.5 h-3.5 opacity-70" strokeWidth={2} />
              </Link>
            )}
            {q.isApproved && (
              <Link href={q.executionReviewHref} className={primaryBtnClass}>
                Open execution review
                <ArrowUpRight className="w-3.5 h-3.5 opacity-70" strokeWidth={1.5} />
              </Link>
            )}
            <Link href={q.href} className={secondaryBtnClass}>
              Open full quote page
              <ArrowUpRight className="w-3 h-3 ml-1" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      ))}

      <div className="pt-1">
        <Link
          href={lead.newQuoteHref}
          className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Start additional quote
          <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}

/* ─── Main export ────────────────────────────────────────────────────────── */

export function LeadWorkspacePageClient({
  lead,
  linkedQuotes,
  updateStatusAction,
  customersForLink,
  linkLeadAction,
  matchHints,
}: {
  lead: SerializedLeadFull;
  linkedQuotes: SerializedLinkedQuoteFull[];
  updateStatusAction: (prevState: LeadFormState, formData: FormData) => Promise<LeadFormState>;
  customersForLink?: { id: string; displayName: string }[];
  linkLeadAction?: (prevState: LeadFormState, formData: FormData) => Promise<LeadFormState>;
  matchHints?: LeadCustomerMatchHints;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");

  return (
    <div>
      {/* ── Next step (always visible) ───────────────────────────────────── */}
      <NextStepPanel
        lead={lead}
        onSwitchToQuote={() => setActiveTab("quote")}
        onSwitchToContact={() => setActiveTab("contact")}
      />

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="mb-4 inline-flex rounded-lg bg-surface border border-border p-1 gap-0.5">
        {WS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={[
              "rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
              activeTab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground-subtle hover:text-foreground",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <OverviewTab
          lead={lead}
          linkedQuotes={linkedQuotes}
          updateStatusAction={updateStatusAction}
        />
      )}
      {activeTab === "contact" && (
        <ContactTab
          lead={lead}
          onRefresh={() => router.refresh()}
          customersForLink={customersForLink}
          linkLeadAction={linkLeadAction}
          matchHints={matchHints}
        />
      )}
      {activeTab === "activity" && (
        <ActivityTab lead={lead} linkedQuotes={linkedQuotes} />
      )}
      {activeTab === "quote" && (
        <QuoteTab
          lead={lead}
          linkedQuotes={linkedQuotes}
          onSwitchToContact={() => setActiveTab("contact")}
        />
      )}
    </div>
  );
}
